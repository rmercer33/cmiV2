#!/bin/bash

# Check if AWS CLI is installed
if command -v aws &> /dev/null; then
  echo "Scanning local DynamoDB table 'cmiSearch' via AWS CLI..."
  aws dynamodb scan \
    --table-name cmiSearch \
    --endpoint-url http://localhost:8000 \
    --region us-east-1
else
  echo "AWS CLI is not installed. Falling back to the Node.js verification script..."
  node scripts/verify-data.mjs
fi
