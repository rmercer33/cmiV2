#!/bin/bash
set -e

echo "=========================================================="
echo "              S3 Directory/Folder Creation Tool           "
echo "=========================================================="
echo ""

# Check if arguments are supplied for non-interactive mode
# Usage: ./aws/s3-mkdir.sh <bucket-name> <base-prefix> <folder1> [folder2] ...
if [ "$#" -ge 3 ]; then
  BUCKET="$1"
  BASE_PREFIX="$2"
  shift 2
  FOLDERS=("$@")
  # Auto-confirm in CLI non-interactive mode
  CONFIRM_MODE="auto"
else
  CONFIRM_MODE="interactive"
  # Guided interactive mode
  read -p "Enter S3 Bucket Name (e.g., my-audio-bucket): " BUCKET
  if [ -z "$BUCKET" ]; then
    echo "Error: Bucket name is required."
    exit 1
  fi

  read -p "Enter Base Prefix Path (optional, e.g., wom/audio/): " BASE_PREFIX

  read -p "Enter Folder Names to create (space-separated, e.g., early tjl woh wot): " -a FOLDERS
  if [ ${#FOLDERS[@]} -eq 0 ]; then
    echo "Error: At least one folder name is required."
    exit 1
  fi
fi

# Sanitize bucket name (remove s3:// if provided)
BUCKET="${BUCKET#s3://}"
BUCKET="${BUCKET%/}"

# Sanitize base prefix: ensure it ends with / if not empty, and remove leading/trailing slashes
if [ -n "$BASE_PREFIX" ]; then
  # Remove s3://bucket/ if user entered full URI
  BASE_PREFIX="${BASE_PREFIX#s3://$BUCKET/}"
  BASE_PREFIX="${BASE_PREFIX#s3://$BUCKET}"
  BASE_PREFIX="${BASE_PREFIX#/}"
  # Ensure trailing slash
  if [ "$BASE_PREFIX" != "" ]; then
    [[ ! "$BASE_PREFIX" =~ /$ ]] && BASE_PREFIX="$BASE_PREFIX/"
  fi
fi

echo -e "\nSummary of Folders to Create in Bucket: s3://$BUCKET/"
for FOLDER in "${FOLDERS[@]}"; do
  # Remove leading/trailing slashes
  CLEAN_FOLDER="${FOLDER#/}"
  CLEAN_FOLDER="${CLEAN_FOLDER%/}"
  echo "  - s3://$BUCKET/$BASE_PREFIX$CLEAN_FOLDER/"
done

# Request confirmation in interactive mode
if [ "$CONFIRM_MODE" = "interactive" ]; then
  echo ""
  read -p "Proceed with creation? (y/N): " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

echo -e "\nCreating folders..."
for FOLDER in "${FOLDERS[@]}"; do
  # Remove leading/trailing slashes
  CLEAN_FOLDER="${FOLDER#/}"
  CLEAN_FOLDER="${CLEAN_FOLDER%/}"
  FULL_KEY="$BASE_PREFIX$CLEAN_FOLDER/"

  echo "Creating s3://$BUCKET/$FULL_KEY..."
  aws s3api put-object --bucket "$BUCKET" --key "$FULL_KEY" > /dev/null
done

echo -e "\nAll folders successfully created!"
