# IAM Setup Guide for SatyaMool Deployment

## Problem
The IAM user `devMG` currently only has `IAMUserChangePassword` policy attached, which is insufficient for deploying AWS infrastructure using CDK.

## Current Status
- **AWS Account**: 339648407295
- **IAM User**: devMG
- **Region**: ap-south-1 (Mumbai)
- **Current Policies**: IAMUserChangePassword only

## Solution Options

### Option 1: Use AWS Console (Recommended for Quick Setup)

1. **Log into AWS Console** as root user or an administrator
   - Go to: https://console.aws.amazon.com/

2. **Navigate to IAM**
   - Services → Security, Identity, & Compliance → IAM

3. **Find the devMG user**
   - Click "Users" in the left sidebar
   - Search for and click on "devMG"

4. **Attach Administrator Access (Easiest)**
   - Click "Add permissions" → "Attach policies directly"
   - Search for "AdministratorAccess"
   - Check the box next to it
   - Click "Next" → "Add permissions"

   **OR**

5. **Attach Custom Policy (More Secure)**
   - Click "Add permissions" → "Create inline policy"
   - Click "JSON" tab
   - Copy the contents of `iam-policy-for-deployment.json` (in this directory)
   - Paste into the JSON editor
   - Click "Review policy"
   - Name it: "SatyaMoolDeploymentPolicy"
   - Click "Create policy"

### Option 2: Use AWS CLI (If You Have Admin Access)

If you have access to another IAM user or role with administrative permissions:

#### Attach AdministratorAccess (Quick)
```bash
aws iam attach-user-policy \
  --user-name devMG \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

#### OR Create and Attach Custom Policy (Secure)
```bash
# Create the policy
aws iam create-policy \
  --policy-name SatyaMoolDeploymentPolicy \
  --policy-document file://packages/infrastructure/docs/iam-policy-for-deployment.json

# Attach the policy to devMG user
aws iam attach-user-policy \
  --user-name devMG \
  --policy-arn arn:aws:iam::339648407295:policy/SatyaMoolDeploymentPolicy
```

### Option 3: Use Specific AWS Managed Policies

Attach multiple AWS managed policies for granular control:

```bash
# S3 Full Access
aws iam attach-user-policy \
  --user-name devMG \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

# CloudFormation Full Access
aws iam attach-user-policy \
  --user-name devMG \
  --policy-arn arn:aws:iam::aws:policy/AWSCloudFormationFullAccess

# Lambda Full Access
aws iam attach-user-policy \
  --user-name devMG \
  --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess

# DynamoDB Full Access
aws iam attach-user-policy \
  --user-name devMG \
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess

# IAM Full Access (needed for creating Lambda execution roles)
aws iam attach-user-policy \
  --user-name devMG \
  --policy-arn arn:aws:iam::aws:policy/IAMFullAccess

# CloudWatch Full Access
aws iam attach-user-policy \
  --user-name devMG \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchFullAccess

# SQS Full Access
aws iam attach-user-policy \
  --user-name devMG \
  --policy-arn arn:aws:iam::aws:policy/AmazonSQSFullAccess

# SNS Full Access
aws iam attach-user-policy \
  --user-name devMG \
  --policy-arn arn:aws:iam::aws:policy/AmazonSNSFullAccess

# EventBridge Full Access
aws iam attach-user-policy \
  --user-name devMG \
  --policy-arn arn:aws:iam::aws:policy/AmazonEventBridgeFullAccess

# CloudFront Full Access
aws iam attach-user-policy \
  --user-name devMG \
  --policy-arn arn:aws:iam::aws:policy/CloudFrontFullAccess
```

## Verification

After attaching the policies, verify the permissions:

```bash
# Check attached policies
aws iam list-attached-user-policies --user-name devMG

# Verify you can create an S3 bucket (test)
aws s3api head-bucket --bucket satyamool-documents-339648407295 2>&1 || echo "Bucket doesn't exist yet - this is expected"
```

## After IAM Setup - Deploy the Stack

Once permissions are configured, deploy the infrastructure:

```bash
# Navigate to infrastructure directory
cd packages/infrastructure

# Deploy the stack (no approval prompts)
npx cdk deploy --require-approval never
```

## Expected Deployment Time
- **Initial deployment**: 10-15 minutes
- **Resources created**: ~30 resources (S3 buckets, DynamoDB tables, Lambda functions, etc.)

## Post-Deployment Verification

```bash
# Check stack status
aws cloudformation describe-stacks \
  --stack-name SatyaMoolStack \
  --region ap-south-1 \
  --query 'Stacks[0].StackStatus'

# Get stack outputs
aws cloudformation describe-stacks \
  --stack-name SatyaMoolStack \
  --region ap-south-1 \
  --query 'Stacks[0].Outputs'

# List created S3 buckets
aws s3 ls | grep satyamool

# List created DynamoDB tables
aws dynamodb list-tables --region ap-south-1 | grep SatyaMool

# List created Lambda functions
aws lambda list-functions --region ap-south-1 | grep SatyaMool
```

## Security Best Practices

### For Development Environment
- **AdministratorAccess** is acceptable for development/testing
- Simplifies troubleshooting and rapid iteration

### For Production Environment
- Use the custom policy (`iam-policy-for-deployment.json`)
- Follow principle of least privilege
- Consider using IAM roles with temporary credentials
- Enable MFA for the IAM user
- Rotate access keys regularly

## Troubleshooting

### Issue: "Access Denied" errors during deployment
**Solution**: Ensure all required policies are attached. Use AdministratorAccess for simplest setup.

### Issue: "User cannot perform iam:PassRole"
**Solution**: The IAM policy needs `iam:PassRole` permission for Lambda execution roles.

### Issue: "Cannot create KMS key"
**Solution**: Ensure KMS permissions are included in the policy.

### Issue: Policy size limit exceeded
**Solution**: Use AWS managed policies instead of inline policies, or split into multiple policies.

## Next Steps After Successful Deployment

1. ✅ Verify all resources are created
2. ⏳ Configure Cognito User Pool (not yet deployed)
3. ⏳ Verify SES email addresses
4. ⏳ Enable S3 event notifications (currently commented out)
5. ⏳ Deploy additional Lambda functions (Translation, Analysis, Lineage, Trust Score)
6. ⏳ Deploy API Gateway
7. ⏳ Deploy frontend application

## Support

If you encounter issues:
1. Check CloudFormation events: `aws cloudformation describe-stack-events --stack-name SatyaMoolStack --region ap-south-1`
2. Review IAM permissions: `aws iam list-attached-user-policies --user-name devMG`
3. Verify AWS CLI configuration: `aws configure list`
4. Check region setting: `aws configure get region` (should be ap-south-1)
