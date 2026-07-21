#!/bin/bash
set -e

# ==============================================================================
# S3 Public Audio/VTT Bucket Creator
# ==============================================================================
# Automates:
#   1. Creating a new S3 bucket.
#   2. Turning off "Block Public Access" (necessary to host public assets).
#   3. Applying a public read bucket policy so audio/VTTs can be fetched.
#   4. Applying a CORS policy so your frontend site can fetch the VTT cues.
# ==============================================================================

echo "=========================================================="
echo "          AWS S3 Public Asset Bucket Creator              "
echo "=========================================================="
echo ""

# Determine non-interactive vs interactive mode
if [ "$#" -ge 1 ]; then
  BUCKET_NAME="$1"
  REGION="${2:-us-east-1}"
  CONFIRM_MODE="auto"
else
  CONFIRM_MODE="interactive"
  
  # Prompt for Bucket Name
  read -p "Enter new S3 Bucket Name (e.g., cmi-public-assets): " BUCKET_NAME
  if [ -z "$BUCKET_NAME" ]; then
    echo "Error: Bucket name is required."
    exit 1
  fi

  # Prompt for Region
  read -p "Enter AWS Region (default: us-east-1): " REGION
  REGION="${REGION:-us-east-1}"
fi

# Sanitize bucket name (lowercase, strip s3:// if entered)
BUCKET_NAME=$(echo "$BUCKET_NAME" | tr '[:upper:]' '[:lower:]')
BUCKET_NAME="${BUCKET_NAME#s3://}"
BUCKET_NAME="${BUCKET_NAME%/}"

# Display summary
echo -e "\nSummary of Actions:"
echo "  - Create Bucket:      s3://$BUCKET_NAME"
echo "  - Region:             $REGION"
echo "  - Disable Block Pub:  YES"
echo "  - Set Public Policy:  YES (Public Read-Only)"
echo "  - Set CORS Policy:    YES (Allows frontend direct fetch)"

if [ "$CONFIRM_MODE" = "interactive" ]; then
  echo ""
  read -p "Proceed with bucket creation? (y/N): " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

# 1. Create S3 Bucket
echo -e "\nCreating S3 bucket s3://$BUCKET_NAME in region $REGION..."
set +e # Temporarily disable set -e to handle the error ourselves
if [ "$REGION" = "us-east-1" ]; then
  CREATE_ERR=$(aws s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>&1)
  CREATE_CODE=$?
else
  CREATE_ERR=$(aws s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION" --create-bucket-configuration LocationConstraint="$REGION" 2>&1)
  CREATE_CODE=$?
fi
set -e # Re-enable set -e

if [ $CREATE_CODE -ne 0 ]; then
  echo -e "\n❌ Error: S3 bucket creation failed!"
  echo "AWS Error Details: $CREATE_ERR"
  echo ""
  if [[ "$CREATE_ERR" == *"BucketAlreadyExists"* ]]; then
    echo "=========================================================="
    echo "💡 EXPLANATION: GLOBAL NAMESPACE COLLISION"
    echo "=========================================================="
    echo "S3 bucket names must be GLOBALLY UNIQUE across all AWS"
    echo "accounts in the entire world. The name '$BUCKET_NAME' has"
    echo "already been taken by another AWS user."
    echo ""
    echo "👉 Please run the script again and choose a more unique name"
    echo "   (e.g., prefixing with your site name like 'my-site-audio-bucket')."
    echo "=========================================================="
    exit $CREATE_CODE
  elif [[ "$CREATE_ERR" == *"BucketAlreadyOwnedByYou"* ]]; then
    echo "=========================================================="
    echo "💡 NOTE: Bucket already owned by you."
    echo "We will proceed to configure Block Public Access, Policy, and CORS!"
    echo "=========================================================="
  else
    exit $CREATE_CODE
  fi
else
  echo "Bucket created successfully!"
fi

# 2. Disable Block Public Access settings (required to apply a public policy)
echo "Disabling S3 Block Public Access controls on $BUCKET_NAME..."
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# 3. Apply Public Read-Only Bucket Policy
echo "Applying public read-only bucket policy..."
POLICY_JSON=$(cat <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
        }
    ]
}
EOF
)

aws s3api put-bucket-policy \
  --bucket "$BUCKET_NAME" \
  --policy "$POLICY_JSON"

# 4. Apply CORS Configuration (Critical for client-side VTT text-track fetching)
echo "Applying CORS configuration (allowing GET/HEAD requests)..."
CORS_JSON=$(cat <<EOF
{
    "CORSRules": [
        {
            "AllowedHeaders": ["*"],
            "AllowedMethods": ["GET", "HEAD"],
            "AllowedOrigins": ["*"],
            "ExposeHeaders": [],
            "MaxAgeSeconds": 3000
        }
    ]
}
EOF
)

aws s3api put-bucket-cors \
  --bucket "$BUCKET_NAME" \
  --cors-configuration "$CORS_JSON"

echo -e "\n=========================================================="
echo "🎉 Success! S3 Bucket s3://$BUCKET_NAME is ready!"
echo "=========================================================="
echo "Details:"
echo "  - Public Access: Enabled (s3:GetObject allowed for everyone)"
echo "  - CORS Configured: Enabled (Frontend sites can fetch VTT tracks directly)"
echo "  - S3 URL Format: https://$BUCKET_NAME.s3.amazonaws.com"
echo "=========================================================="
echo "Next step: Run the following to make this script executable:"
echo "  chmod +x aws/s3-create-public-bucket.sh"
echo "=========================================================="
