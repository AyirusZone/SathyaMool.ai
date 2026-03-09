#!/usr/bin/env python3
import boto3
import sys

# Configuration
APP_ID = "d2kh7n7sie9i2y"
BRANCH_NAME = "newer_mani"
REGION = "ap-south-1"

# Environment variables to set
ENV_VARS = {
    "VITE_API_BASE_URL": "https://44f28lv3d2.execute-api.ap-south-1.amazonaws.com/v1",
    "VITE_AUTH_API_BASE_URL": "https://tabclk95h4.execute-api.ap-south-1.amazonaws.com/v1",
    "VITE_AWS_REGION": "ap-south-1",
    "VITE_USER_POOL_ID": "ap-south-1_L9QAyUMp2",
    "VITE_USER_POOL_CLIENT_ID": "257jk8dhpt1l6mu2l5trld1r4q",
    "VITE_DOCUMENT_BUCKET": "satyamool-documents-339648407295"
}

print("=" * 80)
print("UPDATING AMPLIFY ENVIRONMENT VARIABLES")
print("=" * 80)
print()
print(f"App ID: {APP_ID}")
print(f"Branch: {BRANCH_NAME}")
print(f"Region: {REGION}")
print()

try:
    amplify = boto3.client('amplify', region_name=REGION)
    
    # Update branch with environment variables
    response = amplify.update_branch(
        appId=APP_ID,
        branchName=BRANCH_NAME,
        environmentVariables=ENV_VARS
    )
    
    print("✅ Environment variables updated successfully!")
    print()
    print("Environment Variables Set:")
    for key, value in ENV_VARS.items():
        print(f"  {key}: {value}")
    
    print()
    print("=" * 80)
    print("⚠️  IMPORTANT: Trigger a new deployment for changes to take effect!")
    print("=" * 80)
    print()
    print("To redeploy, run:")
    print(f"  python3 redeploy_amplify.py")
    print()
    print("Or manually:")
    print(f"  aws amplify start-job --app-id {APP_ID} --branch-name {BRANCH_NAME} --job-type RELEASE --region {REGION}")
    print()
    
except Exception as e:
    print(f"❌ Error updating environment variables: {e}")
    sys.exit(1)
