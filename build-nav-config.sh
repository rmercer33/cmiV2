#!/bin/bash
# build-nav-config.sh
# Compiles the raw content directory into config.json and splits it for the frontend.

# Exit immediately if a command exits with a non-zero status
set -e

echo "=========================================================="
echo "          Frontend Navigation Config Compiler             "
echo "=========================================================="

# 1. Enforce that this script is executed from the project root
if [ ! -f "scripts/generate-config.js" ] || [ ! -f "scripts/split-config.mjs" ]; then
    echo "Error: This script must be run from the project root directory containing the 'scripts' folder."
    exit 1
fi

# 2. Check for command-line argument, or prompt if not provided
CONTENT_DIR="$1"
if [ -z "$CONTENT_DIR" ]; then
    read -p "Enter the path to the content directory: " CONTENT_DIR
fi

# 3. Fail if the input is empty
if [ -z "$CONTENT_DIR" ]; then
    echo "Error: Content directory path cannot be empty."
    exit 1
fi

# 4. Fail if the directory does not exist or is not a directory
if [ ! -d "$CONTENT_DIR" ]; then
    echo "Error: Directory not found at '$CONTENT_DIR'."
    exit 1
fi

echo -e "\nStep 1/2: Generating 'config.json' from content tree..."
node scripts/generate-config.js "$CONTENT_DIR" config.json

echo -e "\nStep 2/2: Splitting config into frontend JSON chunks..."
node scripts/split-config.mjs config.json frontend/public/config/

echo -e "\n=========================================================="
echo "✅ Success! Navigation configs updated in frontend/public/config/"
echo "=========================================================="
