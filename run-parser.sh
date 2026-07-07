#!/bin/bash

# Function to print usage
print_usage() {
  echo "Usage: $0 <filepath> -s <source> -b <book> -u <unit>"
  echo ""
  echo "Arguments:"
  echo "  <filepath>    Path to the markdown file to parse"
  echo ""
  echo "Options:"
  echo "  -s <source>   The partition key value (source) [Required]"
  echo "  -b <book>     The book name [Required]"
  echo "  -u <unit>     The unit name [Required]"
  echo ""
  echo "Example:"
  echo "  $0 sample.md -s woh -b chap01 -u unit01"
}

# If help is requested, let commander handle it
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
  node src/index.mjs --help
  exit 0
fi

# Ensure we have at least 7 arguments (filepath + 3 option-value pairs)
if [ "$#" -lt 7 ]; then
  echo "Error: One or more required arguments/options are missing."
  echo ""
  print_usage
  exit 1
fi

node src/index.mjs "$@" -e http://localhost:8000
