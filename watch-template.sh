#!/bin/bash

# Ensure config file is supplied
if [ -z "$1" ]; then
  echo "Usage: $0 <config-json-file>"
  exit 1
fi

CONFIG_FILE="$1"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Error: Config file '$CONFIG_FILE' not found."
  exit 1
fi

# Parse config values using a short Node.js script
PARSE_RESULT=$(node -e "
const fs = require('fs');
try {
  const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
  const filepath = config.filepath || '';
  const source = config.source || '';
  const book = config.book || '';
  const unit = config.unit || '';
  
  if (!filepath) {
    console.error('Error: \"filepath\" is required in config.');
    process.exit(1);
  }
  
  console.log([filepath, source, book, unit].join('|'));
} catch (err) {
  console.error('Error parsing config file:', err.message);
  process.exit(1);
}
" 2>&1)

if [ $? -ne 0 ]; then
  echo "$PARSE_RESULT"
  exit 1
fi

# Split by | separator
IFS="|" read -r FILEPATH SOURCE BOOK UNIT <<< "$PARSE_RESULT"

echo "Watching template edits for compiling:"
echo "  Markdown file: $FILEPATH"
echo "  Source ID:     $SOURCE"
echo "  Book ID:       $BOOK"
echo "  Unit ID:       $UNIT"
echo ""

# Build single-file options
CMD_OPTS=""
if [ -n "$SOURCE" ]; then CMD_OPTS="$CMD_OPTS -s $SOURCE"; fi
if [ -n "$BOOK" ]; then CMD_OPTS="$CMD_OPTS -b $BOOK"; fi
if [ -n "$UNIT" ]; then CMD_OPTS="$CMD_OPTS -u $UNIT"; fi

# Execute nodemon
npx nodemon --watch templates --watch "$FILEPATH" -e hbs,md --exec "node src/index.mjs \"$FILEPATH\"$CMD_OPTS"
