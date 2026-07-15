# To copy your objects back to their original location (keeping them in both places), you can run the standard `aws s3 cp` command with the `--recursive` flag.
#
# ### Quick One-Liner Command
#
# 1. **First, perform a dry run** to preview exactly what will be copied without making any actual changes:
#    ```bash
#    aws s3 cp s3://YOUR_BUCKET/NEW_LOCATION/ s3://YOUR_BUCKET/ORIGINAL_LOCATION/ --recursive --dryrun
#    ```
#
# 2. **Run the actual copy**:
#    ```bash
#    aws s3 cp s3://YOUR_BUCKET/NEW_LOCATION/ s3://YOUR_BUCKET/ORIGINAL_LOCATION/ --recursive
#    ```
#
# ---
#
# ### Interactive Bash Script
#
# For a safer, guided process that automatically runs a dry-run preview and asks for confirmation before executing, you can use this script:
#
# ```bash
#
#!/bin/bash
set -e

echo "=========================================================="
echo "              S3 Copy-Back Restoration Tool              "
echo "=========================================================="
echo ""

read -p "Enter the CURRENT S3 URI (e.g., s3://my-bucket/new-path/): " SRC_URI
if [ -z "$SRC_URI" ]; then
	echo "Error: Source URI required."
	exit 1
fi

read -p "Enter the ORIGINAL S3 URI (e.g., s3://my-bucket/original-path/): " DST_URI
if [ -z "$DST_URI" ]; then
	echo "Error: Destination URI required."
	exit 1
fi

# Ensure s3:// prefix
[[ ! "$SRC_URI" =~ ^s3:// ]] && SRC_URI="s3://$SRC_URI"
[[ ! "$DST_URI" =~ ^s3:// ]] && DST_URI="s3://$DST_URI"

echo -e "\nExecuting DRY RUN to preview changes..."
if ! aws s3 cp "$SRC_URI" "$DST_URI" --recursive --dryrun; then
	echo -e "\nError: Dry run failed. Check your URIs and AWS credentials."
	exit 1
fi

echo "----------------------------------------------------------"
read -p "Proceed with the ACTUAL copy? (y/N): " CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
	echo -e "\nCopying files..."
	aws s3 cp "$SRC_URI" "$DST_URI" --recursive
	echo -e "\nSuccess! Objects copied back to: $DST_URI"
else
	echo -e "\nOperation cancelled."
fi
