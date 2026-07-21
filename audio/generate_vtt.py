#!/usr/bin/env python3
import argparse
import os
import re
import sys
import requests
import subprocess
import json
from collections import Counter
import stable_whisper

def download_audio(url, local_path):
    """Downloads audio from a public S3 URL with streaming."""
    print(f"Downloading audio from {url}...")
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()
        with open(local_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        print(f"Audio downloaded successfully to {local_path}")
    except Exception as e:
        print(f"Error downloading audio: {e}", file=sys.stderr)
        sys.exit(1)

def extract_markdown_blocks(md_path):
    """Executes the node script to parse and extract paragraph blocks and IDs."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(script_dir)
    node_script_path = os.path.join(root_dir, "scripts", "extract-blocks.mjs")
    
    print(f"Extracting markdown blocks using {node_script_path}...")
    try:
        cmd = ["node", node_script_path, md_path]
        result_proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
        blocks = json.loads(result_proc.stdout)
        return blocks
    except Exception as e:
        print(f"Error executing extract-blocks.mjs: {e}", file=sys.stderr)
        if hasattr(e, 'stderr') and e.stderr:
            print(f"Subprocess stderr:\n{e.stderr}", file=sys.stderr)
        sys.exit(1)

def map_words_to_sentences(words, sentences, debug=False):
    """Maps aligned words from stable_whisper back to their respective sentences.
    Computes a start/end time for each sentence.
    """
    # 1. Build an array of cleaned words and their corresponding sentence IDs
    text_words = []
    word_to_sentence_id = []
    
    for s in sentences:
        s_id = s["id"]
        # Strip apostrophes (father's -> fathers)
        clean_s_text = s["text"].lower().replace("'", "").replace("’", "")
        # Replace en/em dashes with space to avoid joining independent clauses
        clean_s_text = clean_s_text.replace("—", " ").replace("–", " ")
        # Strip regular hyphens so compound words (ever-changing -> everchanging) are single words
        clean_s_text = clean_s_text.replace("-", "")
        # Extract alphanumeric words
        words_in_s = re.findall(r'\w+', clean_s_text)
        for w in words_in_s:
            text_words.append(w)
            word_to_sentence_id.append(s_id)
            
    sentence_timings = {}
    
    # 2. Iterate through Whisper words and match them to the text_words array
    word_ptr = 0
    if debug:
        print(f"\n--- Aligning Whisper words to Text array (Length: {len(text_words)}) ---")
    for w in words:
        w_text = getattr(w, 'word', None)
        if w_text is None and isinstance(w, dict):
            w_text = w.get('word', '')
            
        clean_w = re.sub(r'[^\w]', '', w_text).lower()
        if not clean_w:
            continue
            
        match_idx = -1
        
        # Exact match at the current pointer
        if word_ptr < len(text_words) and text_words[word_ptr] == clean_w:
            match_idx = word_ptr
        else:
            # Bounded forward search (window of 10 words) for minor drift/skips
            for i in range(1, 10):
                if word_ptr + i < len(text_words) and text_words[word_ptr + i] == clean_w:
                    match_idx = word_ptr + i
                    break
                    
        if match_idx != -1:
            s_id = word_to_sentence_id[match_idx]
            
            w_start = getattr(w, 'start', None)
            if w_start is None and isinstance(w, dict):
                w_start = w.get('start', 0.0)
                
            w_end = getattr(w, 'end', None)
            if w_end is None and isinstance(w, dict):
                w_end = w.get('end', 0.0)
                
            if s_id not in sentence_timings:
                sentence_timings[s_id] = {
                    "start": w_start,
                    "end": w_end
                }
                if debug:
                    print(f"  [START] {s_id} @ {w_start:.2f}s (Word: '{clean_w}')")
            else:
                sentence_timings[s_id]["end"] = w_end
                if debug:
                    print(f"  [UPDATE] {s_id} -> end @ {w_end:.2f}s (Word: '{clean_w}')")
                
            # Advance pointer strictly to the next word
            word_ptr = match_idx + 1
        else:
            if debug:
                print(f"  [SKIP] Whisper word '{clean_w}' (Could not align within 10 words of pointer {word_ptr})")
            
    annotated_segments = []
    for s in sentences:
        s_id = s["id"]
        if s_id in sentence_timings:
            annotated_segments.append({
                "start": sentence_timings[s_id]["start"],
                "end": sentence_timings[s_id]["end"],
                "text": s_id
            })
            
    return annotated_segments

def format_timestamp(seconds):
    """Formats float seconds into HH:MM:SS.mmm format for WebVTT."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    milliseconds = int(round((seconds % 1) * 1000))
    if milliseconds >= 1000:
        secs += milliseconds // 1000
        milliseconds = milliseconds % 1000
    if secs >= 60:
        minutes += secs // 60
        secs = secs % 60
    if minutes >= 60:
        hours += minutes // 60
        minutes = minutes % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{milliseconds:03d}"

def save_vtt(vtt_path, annotated_segments):
    """Saves annotated segments to WebVTT format."""
    print(f"Saving synchronized WebVTT to {vtt_path}...")
    try:
        with open(vtt_path, 'w', encoding='utf-8') as f:
            f.write("WEBVTT\n\n")
            for segment in annotated_segments:
                start_str = format_timestamp(segment["start"])
                end_str = format_timestamp(segment["end"])
                f.write(f"{start_str} --> {end_str}\n")
                f.write(f"{segment['text']}\n\n")
    except Exception as e:
        print(f"Error saving WebVTT: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(
        description="Forced alignment PoC: Generates a WebVTT (.vtt) file from a public S3 audio URL and a local Markdown transcript."
    )
    parser.add_argument("s3_url", help="Publicly accessible S3 URL to the audio file")
    parser.add_argument("markdown_file", help="Path to the local markdown transcript file")
    parser.add_argument("--debug", "-d", action="store_true", help="Enable verbose alignment debugging output")
    
    args = parser.parse_args()

    # Verify Markdown file exists
    if not os.path.exists(args.markdown_file):
        print(f"Error: Markdown file not found at {args.markdown_file}", file=sys.stderr)
        sys.exit(1)

    # Derive output .vtt path in the current working directory using the markdown's base filename
    base_name = os.path.basename(args.markdown_file)
    base_path, _ = os.path.splitext(base_name)
    vtt_path = os.path.abspath(f"{base_path}.vtt")

    # Temporary audio path
    temp_audio_path = "temp_audio_to_align.mp3"

    try:
        # Step 1: Download Audio
        download_audio(args.s3_url, temp_audio_path)

        # Step 2: Extract & Clean Text using Node Block Extractor
        blocks = extract_markdown_blocks(args.markdown_file)
        
        # Flatten into sentences
        sentences = []
        for b in blocks:
            for s in b.get("sentences", []):
                sentences.append(s)
                
        # If no sentences (e.g. older blocks output), fallback to block-level
        if not sentences:
            for b in blocks:
                sentences.append({
                    "id": b["id"],
                    "text": b["text"]
                })
                
        clean_text = " ".join([s["text"] for s in sentences])

        # Debug print a sample of the cleaned text
        print("\n--- Cleaned Text Sample (First 200 chars) ---")
        print(clean_text[:200] + "...")
        print("---------------------------------------------\n")

        # Step 3: Run AI Alignment
        print("Loading Whisper model ('base'). This might take a moment to download on first run...")
        # We load the base model. It is a good balance between speed and alignment accuracy.
        model = stable_whisper.load_model('base')

        print("Performing forced alignment. Please wait...")
        # Align the existing clean text to the downloaded audio file
        result = model.align(temp_audio_path, clean_text, language='en')

        # Step 3b: Map aligned words to our exact sentence IDs
        words = []
        for segment in result.segments:
            seg_words = getattr(segment, 'words', None)
            if seg_words is None and isinstance(segment, dict):
                seg_words = segment.get('words')
            if seg_words:
                words.extend(seg_words)
                
        annotated_segments = map_words_to_sentences(words, sentences, debug=args.debug)

        # Step 4: Save to WebVTT
        save_vtt(vtt_path, annotated_segments)
        print("Success! WebVTT file generated.")

    finally:
        # Step 5: Clean up downloaded audio
        if os.path.exists(temp_audio_path):
            print(f"Cleaning up temporary file {temp_audio_path}...")
            os.remove(temp_audio_path)

if __name__ == "__main__":
    main()
