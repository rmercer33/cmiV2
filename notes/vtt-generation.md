# VTT Timing Alignment & Generation Guide

This guide describes how to use the WebVTT (`.vtt`) timing generator script to create perfectly synchronized audio highlights for the **cmiLibrary** reader.

---

## 1. Overview

The VTT generation system uses **Forced Alignment** to synchronize spoken audio tracks with the plain-text Markdown transcripts. 

Unlike standard transcription (which listens to audio and guesses the words), forced alignment takes the **exact ground-truth text** and forces the AI model to locate the precise millisecond each word is spoken. This produces ultra-accurate, drift-free, and jump-free highlighting and seek navigation.

---

## 2. Prerequisites

To run the alignment pipeline, your system must have the following installed:

1.  **Python 3.8+**
2.  **FFmpeg:** Required by Whisper to decode audio.
    *   *macOS:* `brew install ffmpeg`
    *   *Ubuntu/Debian:* `sudo apt install ffmpeg`
3.  **Python Packages:**
    *   Run inside the `/audio` directory:
        ```bash
        pip install -r requirements.txt
        ```
    *   *Note: This installs `stable-whisper` and supporting packages.*
4.  **Node.js:** Required because the Python script spawns a background Node process (`scripts/extract-blocks.mjs`) to parse the Markdown AST.

---

## 3. Usage via `genvtt.sh`

The local helper script `genvtt.sh` provides a simple shortcut to automate running the alignment for chapters in a specific subdirectory (e.g., `vtt/english/wos/`).

### How to Run:
Navigate to your target directory and execute the shell script:
```bash
./genvtt.sh
```

### Typical Script Structure:
Inside `genvtt.sh`, the script automates downloading the S3 audio file and aligning it to the local Markdown source. For example:
```bash
# Example content of genvtt.sh
python3 ../../../audio/generate_vtt.py \
  "https://s3.amazonaws.com/your-bucket/wom/english/wos/chap01.mp3" \
  "../../../content/wom/english/wos/chap01.md"
```

---

## 4. Usage via `generate_vtt.py`

You can run the core Python script directly from any directory to align any audio track and Markdown file.

### Command Syntax:
```bash
python3 audio/generate_vtt.py <s3_audio_url> <markdown_file_path> [options]
```

### Arguments:
*   `s3_audio_url` (Required): Publicly accessible HTTP/HTTPS URL of the `.mp3` audio track to download.
*   `markdown_file_path` (Required): Local file path to the corresponding `.md` transcript.

### Options:
*   `-d, --debug` (Optional): Enable verbose alignment debugging output. This prints step-by-step alignments, starts, ends, updates, and skips in real-time.

### Example Commands:

**Standard Run (Quiet & Clean):**
```bash
python3 audio/generate_vtt.py \
  "https://s3.amazonaws.com/mybucket/audio/chap01.mp3" \
  "content/wom/english/wos/chap01.md"
```
*Outputs only download status, model load warnings, and a success message. Generates `chap01.vtt` in your current directory.*

**Verbose Diagnostic Run:**
```bash
python3 audio/generate_vtt.py \
  "https://s3.amazonaws.com/mybucket/audio/chap01.mp3" \
  "content/wom/english/wos/chap01.md" --debug
```
*Outputs real-time step-by-step token logging:*
```text
--- Aligning Whisper words to Text array (Length: 324) ---
  [START] p1-s0 @ 0.54s (Word: 'servantship')
  [UPDATE] p1-s0 -> end @ 1.10s (Word: 'is')
  [UPDATE] p1-s0 -> end @ 1.45s (Word: 'the')
  [UPDATE] p1-s0 -> end @ 1.90s (Word: 'way')
  [START] p2-s0 @ 3.42s (Word: 'servantship')
  [UPDATE] p2-s0 -> end @ 3.90s (Word: 'means')
```

---

## 5. Troubleshooting & Skipping Warnings

During verbose `--debug` runs, the alignment engine checks for skipped words. Here is what to do if you see warnings:

*   **`[SKIP] Whisper word 'x' (Could not align...)`**
    *   *What it means:* Whisper heard a word in the audio, but it wasn't found in the Markdown text nearby.
    *   *Common Causes:*
        *   **Contractions / Hyphenations:** The generator automatically strips apostrophes and joins hyphenated compound words (e.g. `"father's"` -> `"fathers"`, `"ever-changing"` -> `"everchanging"`) to prevent these skips.
        *   **Ad-libbing / Pauses:** The narrator misspoke or added filler words (like "um" or "ah"). The script safely ignores these without drifting or jumping.
        *   **Skipped Sentences:** If the narrator entirely skipped a paragraph, you will see a series of skips. This is normal and prevents the highlight from showing up on the skipped text.

*   **Highlight Shifts Ahead of Audio:**
    *   *Cause:* The Markdown transcript has extra titles or paragraphs that the narrator **did not read out loud** in the audio track.
    *   *Solution:* Mark those skipped paragraphs or headers in the Markdown with the omit directive: `{: .omit}` at the end of the line. The parser will skip them, aligning subsequent text perfectly.
