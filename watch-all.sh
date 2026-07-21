#!/bin/bash
set -e

# Enforce mandatory directory argument
if [ -z "$1" ]; then
  echo "Usage: $0 <content_directory_path>"
  echo "Example: $0 ../cmiContent/example/flat"
  exit 1
fi

CONTENT_DIR="$1"

if [ ! -d "$CONTENT_DIR" ]; then
  echo "Error: Directory '$CONTENT_DIR' does not exist."
  exit 1
fi

node -e "
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

const contentDir = '$CONTENT_DIR';
console.log('==========================================================');
console.log('            Recursive Markdown Watcher Active              ');
console.log('==========================================================');
console.log('Watching for changes recursively in: ' + contentDir + '\n');

let debounce = null;
fs.watch(contentDir, { recursive: true }, (eventType, filename) => {
  if (filename && filename.endsWith('.md')) {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const fullPath = path.join(contentDir, filename);
      if (fs.existsSync(fullPath)) {
        console.log('[Change Detected] ' + filename + ' -> Recompiling...');
        const child = spawn('node', ['src/index.mjs', fullPath], { stdio: 'inherit' });
      }
    }, 100);
  }
});
"
