# SatyaMool Deployment - Quick Start

## 🚨 Current Status: BLOCKED - IAM Permissions Required

The deployment is ready but blocked because IAM user `devMG` lacks necessary permissions.

## ⚡ Quick Fix (5 minutes)

### Step 1: Fix IAM Permissions

**Option A: AWS Console (Easiest)**
1. Log into AWS Console: https://console.aws.amazon.com/
2. Navigate to: IAM → Users → devMG
3. Click "Add permissions" → "Attach policies directly"
4. Search for "AdministratorAccess"
5. Check the box and click "Add permissions"

**Option B: AWS CLI (If you have admin access)**
```bash
aws iam attach-user-policy \
  --user-name devMG \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

### Step 2: Deploy Infrastructure

```bash
cd packages/infrastructure
npx cdk deploy --require-approval never
```

### Step 3: Wait for Deployment (10-15 minutes)

The deployment will create:
- ✅ 3 S3 buckets (documents, audit logs, frontend)
- ✅ 8 DynamoDB tables (users, properties, documents, etc.)
- ✅ 3 Lambda functions (OCR, notifications, cleanup)
- ✅ Lambda layers for optimization
- ✅ SQS queues with DLQ
- ✅ KMS encryption key
- ✅ CloudFront distribution
- ✅ EventBridge rules
- ✅ SNS topics

### Step 4: Verify Deployment

```bash
# Check stack status
aws cloudformation describe-stacks \
  --stack-name SatyaMoolStack \
  --region ap-south-1 \
  --query 'Stacks[0].StackStatus'

# Should return: "CREATE_COMPLETE"
```

## 📚 Detailed Documentation

- **IAM Setup Guide**: `packages/infrastructure/docs/IAM_SETUP_GUIDE.md`
- **IAM Policy JSON**: `packages/infrastructure/docs/iam-policy-for-deployment.json`
- **Deployment Status**: `DEPLOYMENT_STATUS.md`

## 🔧 Configuration Details

- **AWS Account**: 339648407295
- **Region**: ap-south-1 (Mumbai)
- **Stack Name**: SatyaMoolStack
- **IAM User**: devMG

## ⚠️ Important Notes

1. **Region**: All resources will be created in ap-south-1 (Mumbai)
2. **Costs**: Development environment ~$15-40/month
3. **Temporary Simplifications**: 
   - S3 event notifications disabled (will enable post-deployment)
   - CloudWatch dashboards/alarms removed (will add later)
   - DLQ processor Lambda removed (will add later)

## 🎯 What's Next After Deployment

1. ✅ Infrastructure deployed
2. ⏳ Configure Cognito User Pool
3. ⏳ Verify SES email addresses
4. ⏳ Enable S3 event notifications
5. ⏳ Deploy additional Lambda functions
6. ⏳ Deploy API Gateway
7. ⏳ Deploy frontend application

## 🆘 Troubleshooting

### Deployment fails with "Access Denied"
- Ensure IAM permissions are correctly attached
- Verify with: `aws iam list-attached-user-policies --user-name devMG`

### Wrong region error
- Verify region: `aws configure get region`
- Should be: ap-south-1

### Stack already exists
- Delete old stack: `aws cloudformation delete-stack --stack-name SatyaMoolStack --region ap-south-1`
- Wait for deletion: `aws cloudformation wait stack-delete-complete --stack-name SatyaMoolStack --region ap-south-1`
- Retry deployment

## 📞 Need Help?

Check the detailed guides in `packages/infrastructure/docs/`:
- `IAM_SETUP_GUIDE.md` - Complete IAM setup instructions
- `s3-deployment.md` - S3 configuration details
- `xray-sampling-rules.md` - Monitoring configuration

---

**Ready to deploy?** Fix IAM permissions first, then run the deployment command!
