#!/bin/bash
set -e

# S3 Object Deletion Tool
# Safely delete objects from AWS S3 with interactive previews and safety confirmations.

# Colors for safe/warning display
RED='\033[0;31m'
BOLD_RED='\033[1;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================================="
echo "              S3 Object Deletion Tool                     "
echo "=========================================================="
echo ""

# Function to print usage instructions
print_usage() {
  echo "Usage:"
  echo "  $0 [options]"
  echo ""
  echo "Options:"
  echo "  -b, --bucket <name>     S3 Bucket name (or full s3:// URI)"
  echo "  -p, --prefix <prefix>   Folder prefix to search under (optional)"
  echo "  -k, --key <key>         Specific single object key to delete"
  echo "  -q, --pattern <pattern> Substring or Bash regex pattern to match against object keys"
  echo "  -r, --recursive         Delete EVERYTHING under the specified prefix"
  echo "  -f, --force             Skip safety confirmation prompts (dangerous!)"
  echo "  -d, --dry-run           Perform preview run without deleting anything"
  echo "  -h, --help              Show this help message"
  echo ""
  echo "Examples:"
  echo "  # Interactive guided mode"
  echo "  $0"
  echo ""
  echo "  # Delete a single specific object"
  echo "  $0 -b my-bucket -k folder/file.txt"
  echo ""
  echo "  # Delete a single object using full S3 URI"
  echo "  $0 -k s3://my-bucket/folder/file.txt"
  echo ""
  echo "  # Delete everything under a prefix recursively (with safety prompt)"
  echo "  $0 -b my-bucket -p static-assets/ -r"
  echo ""
  echo "  # Delete objects under prefix matching a pattern/regex (with safety prompt)"
  echo "  $0 -b my-bucket -p logs/ -q '2025-.*\.log'"
  echo ""
  echo "  # Non-interactive deletion of files matching a pattern (CI/CD style)"
  echo "  $0 -b my-bucket -p temp/ -q 'draft' --force"
}

# Default variables
BUCKET=""
PREFIX=""
PATTERN=""
RECURSIVE=false
FORCE=false
DRY_RUN=false
SINGLE_KEY=""

# Parse command line options
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    -h|--help)
      print_usage
      exit 0
      ;;
    -b|--bucket)
      BUCKET="$2"
      shift 2
      ;;
    -p|--prefix)
      PREFIX="$2"
      shift 2
      ;;
    -k|--key)
      SINGLE_KEY="$2"
      shift 2
      ;;
    -q|--pattern)
      PATTERN="$2"
      shift 2
      ;;
    -r|--recursive)
      RECURSIVE=true
      shift
      ;;
    -f|--force)
      FORCE=true
      shift
      ;;
    -d|--dry-run|--dryrun)
      DRY_RUN=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      print_usage
      exit 1
      ;;
  esac
done

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
  echo -e "${RED}Error: AWS CLI is not installed. Please install it and try again.${NC}"
  exit 1
fi

# Check if running in interactive terminal (standard input is a tty)
is_interactive() {
  [ -t 0 ]
}

# Helper to format bytes into human readable format
format_bytes() {
  local bytes=$1
  if [ -z "$bytes" ] || ! [[ "$bytes" =~ ^[0-9]+$ ]]; then
    echo "Unknown size"
    return
  fi
  if [ "$bytes" -lt 1024 ]; then
    echo "${bytes} B"
  elif [ "$bytes" -lt 1048576 ]; then
    echo "$(($bytes / 1024)) KB"
  elif [ "$bytes" -lt 1073741824 ]; then
    echo "$(($bytes / 1048576)) MB"
  else
    local gb_part=$((bytes / 1073741824))
    local mb_part=$(( (bytes % 1073741824) / 104857600 )) # Get 1 decimal place
    echo "${gb_part}.${mb_part} GB"
  fi
}

# S3 URI parsing function (extracts bucket and key/prefix from s3://bucket/path)
parse_s3_uri() {
  local uri="$1"
  if [[ "$uri" =~ ^s3:// ]]; then
    local no_s3="${uri#s3://}"
    local b_name="${no_s3%%/*}"
    local path="${no_s3#$b_name}"
    path="${path#/}"
    echo "$b_name|$path"
  else
    echo ""
  fi
}

# Resolve and sanitize SINGLE_KEY if it contains full S3 URI
if [[ "$SINGLE_KEY" =~ ^s3:// ]]; then
  parsed=$(parse_s3_uri "$SINGLE_KEY")
  if [ -n "$parsed" ]; then
    BUCKET="${parsed%%|*}"
    SINGLE_KEY="${parsed#*|}"
  fi
fi

# Resolve and sanitize PREFIX if it contains full S3 URI
if [[ "$PREFIX" =~ ^s3:// ]]; then
  parsed=$(parse_s3_uri "$PREFIX")
  if [ -n "$parsed" ]; then
    BUCKET="${parsed%%|*}"
    PREFIX="${parsed#*|}"
  fi
fi

# If BUCKET contains s3://, parse it
if [[ "$BUCKET" =~ ^s3:// ]]; then
  parsed=$(parse_s3_uri "$BUCKET")
  if [ -n "$parsed" ]; then
    BUCKET="${parsed%%|*}"
    PATH_PART="${parsed#*|}"
    if [ -n "$PATH_PART" ]; then
      if [ -z "$PREFIX" ] && [ -z "$SINGLE_KEY" ]; then
        if [[ "$PATH_PART" =~ /$ ]] || [ "$RECURSIVE" = true ]; then
          PREFIX="$PATH_PART"
        else
          SINGLE_KEY="$PATH_PART"
        fi
      fi
    fi
  fi
fi

# Prompt for Bucket if empty and running interactively
if [ -z "$BUCKET" ]; then
  if ! is_interactive; then
    echo -e "${RED}Error: Bucket name (-b/--bucket) is required in non-interactive mode.${NC}"
    print_usage
    exit 1
  fi
  
  read -p "Enter S3 Bucket Name (or full s3:// URI): " BUCKET_INPUT
  if [ -z "$BUCKET_INPUT" ]; then
    echo -e "${RED}Error: Bucket name is required.${NC}"
    exit 1
  fi
  BUCKET="$BUCKET_INPUT"
  
  # Re-evaluate in case the interactive input was a full S3 URI
  if [[ "$BUCKET" =~ ^s3:// ]]; then
    parsed=$(parse_s3_uri "$BUCKET")
    if [ -n "$parsed" ]; then
      BUCKET="${parsed%%|*}"
      PATH_PART="${parsed#*|}"
      if [ -n "$PATH_PART" ]; then
        if [[ "$PATH_PART" =~ /$ ]]; then
          PREFIX="$PATH_PART"
        else
          SINGLE_KEY="$PATH_PART"
        fi
      fi
    fi
  fi
fi

# Sanitize Bucket Name (remove leading s3:// and trailing slash)
BUCKET="${BUCKET#s3://}"
BUCKET="${BUCKET%/}"

# Determine target operation if none specified
if [ -z "$SINGLE_KEY" ] && [ "$RECURSIVE" = false ] && [ -z "$PATTERN" ]; then
  if ! is_interactive; then
    echo -e "${RED}Error: Must specify a target for deletion (-k/--key, -r/--recursive, or -q/--pattern).${NC}"
    print_usage
    exit 1
  fi
  
  echo -e "\nNo deletion target specified. Select deletion type for s3://$BUCKET/:"
  echo "  1) Delete a specific single object key"
  echo "  2) Delete everything recursively under a folder prefix"
  echo "  3) Delete objects under a prefix matching a pattern/regex"
  read -p "Select option (1-3): " OPTION
  
  case "$OPTION" in
    1)
      read -p "Enter specific object key (e.g., path/to/file.ext): " SINGLE_KEY
      if [ -z "$SINGLE_KEY" ]; then
        echo -e "${RED}Error: Object key is required.${NC}"
        exit 1
      fi
      # In case they entered a full S3 URI in the prompt
      if [[ "$SINGLE_KEY" =~ ^s3:// ]]; then
        parsed=$(parse_s3_uri "$SINGLE_KEY")
        if [ -n "$parsed" ]; then
          BUCKET="${parsed%%|*}"
          SINGLE_KEY="${parsed#*|}"
        fi
      fi
      ;;
    2)
      RECURSIVE=true
      read -p "Enter folder prefix (optional, e.g. path/to/folder/): " PREFIX
      ;;
    3)
      read -p "Enter folder prefix to search under (optional, e.g. path/to/folder/): " PREFIX
      read -p "Enter substring or regex pattern to match: " PATTERN
      if [ -z "$PATTERN" ]; then
        echo -e "${RED}Error: Pattern is required.${NC}"
        exit 1
      fi
      ;;
    *)
      echo -e "${RED}Error: Invalid option.${NC}"
      exit 1
      ;;
  esac
fi

# Sanitize Prefix (remove leading slash, ensure trailing slash if not empty)
if [ -n "$PREFIX" ]; then
  PREFIX="${PREFIX#/}"
  if [ -n "$PREFIX" ] && [[ ! "$PREFIX" =~ /$ ]]; then
    PREFIX="$PREFIX/"
  fi
fi

# Check AWS Credentials
echo -e "Verifying AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
  echo -e "${YELLOW}Warning: Unable to verify AWS credentials via 'aws sts get-caller-identity'.${NC}"
  echo "Make sure your AWS environment variables, credentials, or config profiles are configured."
  if is_interactive; then
    read -p "Attempt to proceed anyway? (y/N): " CRED_CONFIRM
    if [[ ! "$CRED_CONFIRM" =~ ^[Yy]$ ]]; then
      echo "Cancelled."
      exit 1
    fi
  else
    echo "Proceeding in non-interactive mode..."
  fi
fi

# ==========================================
# Scenario A: Delete Single Object Key
# ==========================================
if [ -n "$SINGLE_KEY" ]; then
  echo -e "\n${BLUE}Targeting Single Object for Deletion:${NC}"
  echo -e "  Bucket: s3://$BUCKET"
  echo -e "  Key:    $SINGLE_KEY"
  
  echo -e "\nChecking object metadata..."
  if METADATA=$(aws s3api head-object --bucket "$BUCKET" --key "$SINGLE_KEY" 2>&1); then
    SIZE=$(aws s3api head-object --bucket "$BUCKET" --key "$SINGLE_KEY" --query "ContentLength" --output text 2>/dev/null || echo "")
    echo -e "  ${GREEN}✓ Object exists${NC}"
    if [ -n "$SIZE" ]; then
      echo -e "  Size:   $(format_bytes $SIZE)"
    fi
  else
    echo -e "  ${YELLOW}⚠ Object not found or access denied.${NC} (It might be a delete marker or already deleted)"
  fi
  
  if [ "$DRY_RUN" = true ]; then
    echo -e "\n${YELLOW}[Dry Run] Would delete: s3://$BUCKET/$SINGLE_KEY${NC}"
    exit 0
  fi
  
  if [ "$FORCE" = false ]; then
    echo ""
    read -p "Are you absolutely sure you want to delete this object? (y/N): " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
      echo "Cancelled."
      exit 0
    fi
  fi
  
  echo -e "\nDeleting object..."
  if aws s3 rm "s3://$BUCKET/$SINGLE_KEY"; then
    echo -e "${GREEN}✓ Successfully deleted s3://$BUCKET/$SINGLE_KEY${NC}"
  else
    echo -e "${RED}Error: Failed to delete object.${NC}"
    exit 1
  fi

# ==========================================
# Scenario B & C: Multi-Object Deletion (Recursive or Pattern)
# ==========================================
else
  if [ -n "$PREFIX" ]; then
    echo -e "\nScanning prefix s3://$BUCKET/$PREFIX for objects..."
  else
    echo -e "\nScanning entire bucket s3://$BUCKET for objects..."
  fi
  
  # Fetch keys and sizes (tab separated to support spaces in keys)
  KEYS_DATA=$(aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "$PREFIX" --query "Contents[].[Key,Size]" --output text 2>/dev/null || echo "")
  
  if [ -z "$KEYS_DATA" ] || [ "$KEYS_DATA" = "None" ]; then
    echo -e "${YELLOW}No objects found under the prefix/bucket.${NC}"
    exit 0
  fi
  
  declare -a ALL_KEYS
  declare -a ALL_SIZES
  TOTAL_COUNT=0
  TOTAL_SIZE=0
  
  while IFS=$'\t' read -r KEY SIZE; do
    if [ -z "$KEY" ] || [ "$KEY" = "None" ]; then
      continue
    fi
    # Skip directories (keys ending with /) unless it is the target prefix itself
    if [[ "$KEY" =~ /$ ]] && [ "$KEY" != "$PREFIX" ]; then
      continue
    fi
    ALL_KEYS+=("$KEY")
    ALL_SIZES+=("$SIZE")
    TOTAL_SIZE=$((TOTAL_SIZE + SIZE))
    ((TOTAL_COUNT++))
  done <<< "$KEYS_DATA"
  
  if [ "$TOTAL_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}No files found under the prefix/bucket.${NC}"
    exit 0
  fi
  
  declare -a TARGET_KEYS
  declare -a TARGET_SIZES
  DELETE_COUNT=0
  DELETE_SIZE=0
  
  if [ -n "$PATTERN" ]; then
    echo -e "Filtering objects with pattern: ${BLUE}$PATTERN${NC}"
    for ((i=0; i<TOTAL_COUNT; i++)); do
      KEY="${ALL_KEYS[i]}"
      SIZE="${ALL_SIZES[i]}"
      if [[ "$KEY" =~ $PATTERN ]]; then
        TARGET_KEYS+=("$KEY")
        TARGET_SIZES+=("$SIZE")
        DELETE_SIZE=$((DELETE_SIZE + SIZE))
        ((DELETE_COUNT++))
      fi
    done
    
    if [ "$DELETE_COUNT" -eq 0 ]; then
      echo -e "${YELLOW}No objects matched the pattern '$PATTERN' under prefix '$PREFIX'.${NC}"
      exit 0
    fi
  else
    TARGET_KEYS=("${ALL_KEYS[@]}")
    TARGET_SIZES=("${ALL_SIZES[@]}")
    DELETE_COUNT="$TOTAL_COUNT"
    DELETE_SIZE="$TOTAL_SIZE"
  fi
  
  # Display safety preview
  echo -e "\n=========================================================="
  echo -e "                 DELETION PREVIEW                         "
  echo -e "=========================================================="
  if [ -n "$PATTERN" ]; then
    echo -e "Mode:   ${YELLOW}Pattern Match (${DELETE_COUNT} of ${TOTAL_COUNT} files matched)${NC}"
    echo -e "Prefix: s3://$BUCKET/$PREFIX"
    echo -e "Pattern (regex): $PATTERN"
  else
    echo -e "Mode:   ${BOLD_RED}Recursive Deletion (ALL FILES UNDER PREFIX)${NC}"
    echo -e "Prefix: s3://$BUCKET/$PREFIX"
  fi
  echo -e "Total files to delete: ${BOLD_RED}${DELETE_COUNT}${NC}"
  echo -e "Total size to delete:  ${YELLOW}$(format_bytes $DELETE_SIZE)${NC}"
  echo -e "----------------------------------------------------------"
  
  PREVIEW_LIMIT=25
  echo "Preview of files to be deleted:"
  for ((i=0; i<DELETE_COUNT; i++)); do
    if [ "$i" -lt "$PREVIEW_LIMIT" ]; then
      echo -e "  - s3://$BUCKET/${TARGET_KEYS[i]} (${YELLOW}$(format_bytes ${TARGET_SIZES[i]})${NC})"
    fi
  done
  if [ "$DELETE_COUNT" -gt "$PREVIEW_LIMIT" ]; then
    echo -e "  ... and $((DELETE_COUNT - PREVIEW_LIMIT)) more files."
  fi
  echo -e "=========================================================="
  
  if [ "$DRY_RUN" = true ]; then
    echo -e "\n${YELLOW}[Dry Run] Completed. No objects were deleted.${NC}"
    exit 0
  fi
  
  if [ "$FORCE" = false ]; then
    echo -e "\n${BOLD_RED}WARNING: THIS OPERATION IS PERMANENT AND CANNOT BE UNDONE!${NC}"
    read -p "Type 'DELETE' to confirm deletion of $DELETE_COUNT objects: " CONFIRM_WORD
    if [ "$CONFIRM_WORD" != "DELETE" ]; then
      echo -e "${RED}Confirmation failed. Cancelled.${NC}"
      exit 0
    fi
  fi
  
  echo -e "\nExecuting deletion..."
  
  # Fast path for complete recursive deletion
  if [ -z "$PATTERN" ]; then
    echo "Running native S3 recursive remove..."
    if aws s3 rm "s3://$BUCKET/$PREFIX" --recursive; then
      echo -e "\n${GREEN}✓ Successfully deleted all objects under s3://$BUCKET/$PREFIX${NC}"
    else
      echo -e "\n${RED}Error: Native recursive deletion failed.${NC}"
      exit 1
    fi
  else
    # Sequential key deletion
    DELETED_OK=0
    for ((i=0; i<DELETE_COUNT; i++)); do
      KEY="${TARGET_KEYS[i]}"
      echo "  [$((i+1))/$DELETE_COUNT] Deleting s3://$BUCKET/$KEY..."
      if aws s3 rm "s3://$BUCKET/$KEY" >/dev/null 2>&1; then
        ((DELETED_OK++))
      else
        echo -e "  ${RED}Failed to delete: s3://$BUCKET/$KEY${NC}"
      fi
    done
    echo -e "\n${GREEN}✓ Successfully deleted $DELETED_OK of $DELETE_COUNT objects!${NC}"
  fi
fi
