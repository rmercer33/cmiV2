#!/bin/bash
set -e

echo "=========================================================="
echo "              S3 Object Renaming (Find & Replace)        "
echo "=========================================================="
echo ""

read -p "Enter S3 Bucket Name: " BUCKET
if [ -z "$BUCKET" ]; then
  echo "Error: Bucket name is required."
  exit 1
fi
BUCKET="${BUCKET#s3://}"
BUCKET="${BUCKET%/}"

read -p "Enter S3 Folder Prefix (optional, e.g. wom/audio/early/): " PREFIX
if [ -n "$PREFIX" ]; then
  PREFIX="${PREFIX#s3://$BUCKET/}"
  PREFIX="${PREFIX#/}"
  if [ "$PREFIX" != "" ]; then
    [[ ! "$PREFIX" =~ /$ ]] && PREFIX="$PREFIX/"
  fi
fi

read -p "Enter text to FIND in object keys (e.g., _audio): " FIND_TEXT
if [ -z "$FIND_TEXT" ]; then
  echo "Error: Text to find is required."
  exit 1
fi

read -p "Enter text to REPLACE with (can be empty): " REPLACE_TEXT

echo -e "\nRetrieving objects from s3://$BUCKET/$PREFIX..."

# List objects and extract keys
KEYS=$(aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "$PREFIX" --query "Contents[].Key" --output text)

if [ -z "$KEYS" ] || [ "$KEYS" = "None" ]; then
  echo "No objects found under s3://$BUCKET/$PREFIX."
  exit 0
fi

declare -a OLD_KEYS
declare -a NEW_KEYS
COUNT=0

for KEY in $KEYS; do
  # Skip directories (keys ending with /)
  if [[ "$KEY" =~ /$ ]]; then
    continue
  fi

  # Check if find text exists in key
  if [[ "$KEY" == *"$FIND_TEXT"* ]]; then
    # Perform find-and-replace on key
    NEW_KEY="${KEY//$FIND_TEXT/$REPLACE_TEXT}"
    
    OLD_KEYS+=("$KEY")
    NEW_KEYS+=("$NEW_KEY")
    ((COUNT++))
  fi
done

if [ "$COUNT" -eq 0 ]; then
  echo "No objects matched the pattern '$FIND_TEXT' under s3://$BUCKET/$PREFIX."
  exit 0
fi

echo -e "\nMatched $COUNT objects. Previewing renames:"
for ((i=0; i<COUNT; i++)); do
  echo "  [Rename $((i+1))] s3://$BUCKET/${OLD_KEYS[i]}"
  echo "         -> s3://$BUCKET/${NEW_KEYS[i]}"
done

echo ""
read -p "Proceed with renaming $COUNT objects? (y/N): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

echo -e "\nExecuting renames..."
for ((i=0; i<COUNT; i++)); do
  OLD="s3://$BUCKET/${OLD_KEYS[i]}"
  NEW="s3://$BUCKET/${NEW_KEYS[i]}"
  
  echo "Renaming $((i+1))/$COUNT: $OLD to $NEW..."
  aws s3 mv "$OLD" "$NEW" > /dev/null
done

echo -e "\nSuccessfully renamed $COUNT objects!"
