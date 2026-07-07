#!/bin/bash

# Function to print usage
print_usage() {
  echo "Usage: $0 -s <source> [-b <book>] [-u <unit>]"
  echo ""
  echo "Options:"
  echo "  -s <source>   The partition key value (source) [Required]"
  echo "  -b <book>     The book name [Optional]"
  echo "  -u <unit>     The unit name [Optional, requires -b]"
  echo ""
  echo "Example:"
  echo "  $0 -s wom"
  echo "  $0 -s wom -b wok"
  echo "  $0 -s wom -b wok -u l01"
}

# If help is requested, show usage
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
  print_usage
  exit 0
fi

# We need at least 2 arguments (e.g., -s source = 2 tokens)
if [ "$#" -lt 2 ]; then
  echo "Error: Required option -s is missing."
  echo ""
  print_usage
  exit 1
fi

node scripts/query-table.mjs "$@"
