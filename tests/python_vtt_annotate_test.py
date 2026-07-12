#!/usr/bin/env python3
import sys
import os

# Add parent directory of audio/ so we can import generate_vtt
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "audio")))

from generate_vtt import annotate_segments_with_block_ids

class MockSegment:
    def __init__(self, text, start=0.0, end=1.0):
        self.text = text
        self.start = start
        self.end = end

def test_annotation():
    blocks = [
        {"id": "p1", "text": "This is the first paragraph by Author Name. It is quite interesting."},
        {"id": "p3", "text": "This is the second paragraph. It contains more exciting details."},
        {"id": "p4", "text": "This is the third paragraph, following immediately after the second paragraph."}
    ]

    segments = [
        MockSegment("This is the first"),
        MockSegment("paragraph by Author Name."),
        MockSegment("It is quite interesting."),
        MockSegment("This is the second paragraph."),
        MockSegment("It contains more exciting"),
        MockSegment("details."),
        MockSegment("This is the third paragraph, following"),
        MockSegment("immediately after the second paragraph.")
    ]

    annotated = annotate_segments_with_block_ids(segments, blocks)

    expected = [
        "p1|This is the first",
        "p1|paragraph by Author Name.",
        "p1|It is quite interesting.",
        "p3|This is the second paragraph.",
        "p3|It contains more exciting",
        "p3|details.",
        "p4|This is the third paragraph, following",
        "p4|immediately after the second paragraph."
    ]

    for i, seg in enumerate(annotated):
        print(f"Segment {i}: Expected '{expected[i]}', Got '{seg['text']}'")
        assert seg["text"] == expected[i], f"Mismatch at index {i}: expected '{expected[i]}', got '{seg['text']}'"

    print("All python annotation tests passed successfully!")

if __name__ == "__main__":
    test_annotation()
