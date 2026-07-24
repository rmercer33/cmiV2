#!/bin/bash
# build-nav-config.sh
# Compiles the raw content directory into config.json and splits it for the frontend based on room settings in rooms.json.

# Exit immediately if a command exits with a non-zero status
set -e

# Enforce that this script is executed from the project root
if [ ! -f "scripts/build-room.mjs" ]; then
    echo "Error: This script must be run from the project root directory containing the 'scripts' folder."
    exit 1
fi

ROOM_ID="$1"
CONTENT_DIR_OVERRIDE="$2"

if [ -z "$ROOM_ID" ]; then
    echo "=========================================================="
    echo "          Frontend Navigation Config Compiler             "
    echo "=========================================================="
    read -p "Enter the Room ID to build (e.g., main, scifi): " ROOM_ID
fi

if [ -z "$ROOM_ID" ]; then
    echo "Error: Room ID cannot be empty."
    exit 1
fi

node scripts/build-room.mjs "$ROOM_ID" "$CONTENT_DIR_OVERRIDE"
