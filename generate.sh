#!/bin/bash

# Determine directory of this script to find generate-config.js
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Enforce mandatory input directory argument
if [ -z "$1" ]; then
    echo "Usage: $0 <input_directory> [output_file]"
    echo "  <input_directory>  Path to the directory containing markdown files (Required)"
    echo "  [output_file]      Path to the output JSON file (Optional, defaults to config.json in the current directory)"
    exit 1
fi

# Run generate-config.js with any passed arguments
node "$SCRIPT_DIR/scripts/generate-config.js" "$@"
