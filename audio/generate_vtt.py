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

def annotate_segments_with_block_ids(segments, blocks):
    """Maps sequential Whisper segments back to the parsed paragraph blocks using clean character indexing."""
    # Prepare clean_full_text and character-to-block info mapping
    clean_full_text = ""
    char_to_block_info = [] # list of (block_id, original_char_idx)
    
    for block in blocks:
        b_id = block["id"]
        b_text = block["text"]
        for idx, char in enumerate(b_text):
            cleaned_char = re.sub(r'[^\w]', '', char).lower()
            if cleaned_char:
                clean_full_text += cleaned_char
                char_to_block_info.append((b_id, idx))
                
    annotated_segments = []
    clean_char_ptr = 0
    for segment in segments:
        seg_text = segment.text
        # Clean the segment text for matching
        clean_seg = re.sub(r'[^\w]', '', seg_text).lower()
        if not clean_seg:
            continue
            
        # Find clean_seg in clean_full_text starting from clean_char_ptr
        match_idx = clean_full_text.find(clean_seg, clean_char_ptr)
        if match_idx == -1:
            # Fallback: search from beginning if we got out of sync
            match_idx = clean_full_text.find(clean_seg, 0)
            
        if match_idx != -1:
            # Found a match! Map the segment's characters to the blocks
            matched_info = char_to_block_info[match_idx : match_idx + len(clean_seg)]
            if matched_info:
                # Find the most common block ID in this range
                block_ids = [info[0] for info in matched_info]
                best_block_id = Counter(block_ids).most_common(1)[0][0]
                
                # Retrieve the exact substring from the original block text
                relevant_indices = [info[1] for info in matched_info if info[0] == best_block_id]
                if relevant_indices:
                    min_idx = min(relevant_indices)
                    max_idx = max(relevant_indices)
                    
                    best_block = next((b for b in blocks if b["id"] == best_block_id), None)
                    if best_block:
                        # Extend min_idx backward to capture leading non-alphanumeric, non-space characters
                        while min_idx > 0 and not best_block["text"][min_idx - 1].isalnum() and not best_block["text"][min_idx - 1].isspace():
                            min_idx -= 1
                            
                        # Extend max_idx forward to capture trailing non-alphanumeric, non-space characters
                        while max_idx + 1 < len(best_block["text"]) and not best_block["text"][max_idx + 1].isalnum() and not best_block["text"][max_idx + 1].isspace():
                            max_idx += 1
                            
                        exact_substring = best_block["text"][min_idx : max_idx + 1]
                        annotated_text = f"{best_block_id}|{exact_substring}"
                    else:
                        annotated_text = f"{best_block_id}|{seg_text}"
                else:
                    annotated_text = f"{best_block_id}|{seg_text}"
                
                # Advance the pointer
                clean_char_ptr = match_idx + len(clean_seg)
            else:
                annotated_text = f"unknown|{seg_text}"
        else:
            annotated_text = f"unknown|{seg_text}"

        annotated_segments.append({
            "start": segment.start,
            "end": segment.end,
            "text": annotated_text
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
        clean_text = " ".join([b["text"] for b in blocks])

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

        # Step 3b: Annotate segments with block IDs and exact text
        annotated_segments = annotate_segments_with_block_ids(result.segments, blocks)

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
