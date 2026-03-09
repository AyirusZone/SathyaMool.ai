#!/bin/bash

# Amplify App Configuration
APP_ID="d2kh7n7sie9i2y"
BRANCH_NAME="newer_mani"
REGION="ap-south-1"

# API Gateway URLs (from our check)
AUTH_API_URL="https://tabclk95h4.execute-api.ap-south-1.amazonaws.com/v1"
MAIN_API_URL="https://44f28lv3d2.execute-api.ap-south-1.amazonaws.com/v1"

# Cognito Configuration
USER_POOL_ID="ap-south-1_L9QAyUMp2"
USER_POOL_CLIENT_ID="257jk8dhpt1l6mu2l5trld1r4q"

# S3 Bucket
DOCUMENT_BUCKET="satyamool-documents-339648407295"

echo "=========================================="
echo "Updating Amplify Environment Variables"
echo "=========================================="
echo ""
echo "App ID: $APP_ID"
echo "Branch: $BRANCH_NAME"
echo ""

# Update environment variables
aws amplify update-branch \
  --app-id "$APP_ID" \
  --branch-name "$BRANCH_NAME" \
  --region "$REGION" \
  --environment-variables \
    VITE_API_BASE_URL="$MAIN_API_URL" \
    VITE_AUTH_API_BASE_URL="$AUTH_API_URL" \
    VITE_AWS_REGION="$REGION" \
    VITE_USER_POOL_ID="$USER_POOL_ID" \
    VITE_USER_POOL_CLIENT_ID="$USER_POOL_CLIENT_ID" \
    VITE_DOCUMENT_BUCKET="$DOCUMENT_BUCKET"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Environment variables updated successfully!"
    echo ""
    echo "Environment Variables Set:"
    echo "  VITE_API_BASE_URL: $MAIN_API_URL"
    echo "  VITE_AUTH_API_BASE_URL: $AUTH_API_URL"
    echo "  VITE_AWS_REGION: $REGION"
    echo "  VITE_USER_POOL_ID: $USER_POOL_ID"
    echo "  VITE_USER_POOL_CLIENT_ID: $USER_POOL_CLIENT_ID"
    echo "  VITE_DOCUMENT_BUCKET: $DOCUMENT_BUCKET"
    echo ""
    echo "⚠️  IMPORTANT: You need to trigger a new deployment for changes to take effect!"
    echo ""
    echo "To redeploy, run:"
    echo "  aws amplify start-job --app-id $APP_ID --branch-name $BRANCH_NAME --job-type RELEASE --region $REGION"
else
    echo ""
    echo "❌ Failed to update environment variables"
    exit 1
fi
