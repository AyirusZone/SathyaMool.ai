# Troubleshooting: S3 Access Denied During CDK Deployment

## Problem Summary

CloudFormation is getting "Access Denied (Service: S3, Status Code: 403)" errors when trying to create S3 buckets during CDK deployment, despite both the IAM user and CDK execution role having AdministratorAccess.

## Error Details

```
Resource handler returned message: "Access Denied (Service: S3, Status Code: 403, 
Request ID: Z1CVZNPG7D6HHCZS, Extended Request ID: +Wbk4RERywl8QzREFJwIbsfV1MYH0Ya2NLX8gI7GwFUVkA4zMWC0gFj6bcbkmvAh5qADi75qxHfVZWPpM+CS0xRkTd1T1YbQ) 
(SDK Attempt Count: 1)"
```

## What We've Verified

✅ IAM user `devMG` has AdministratorAccess policy attached
✅ CDK execution role `cdk-hnb659fds-cfn-exec-role-339648407295-ap-south-1` has AdministratorAccess
✅ Manual S3 bucket creation via AWS CLI works fine
✅ No permission boundary on the IAM user
✅ AWS CLI is configured for ap-south-1 region
✅ CDK is bootstrapped in ap-south-1

❌ CloudFormation-initiated S3 bucket creation fails with 403

## Possible Root Causes

### 1. Service Control Policy (SCP) Restrictions

AWS Organizations may have SCPs that restrict CloudFormation or S3 operations.

**Check if account is in an organization:**
```bash
aws organizations describe-organization
```

**List SCPs attached to the account:**
```bash
# First, get your account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# List policies
aws organizations list-policies-for-target \
  --target-id $ACCOUNT_ID \
  --filter SERVICE_CONTROL_POLICY
```

**View SCP content:**
```bash
aws organizations describe-policy --policy-id <policy-id>
```

### 2. S3 Block Public Access Settings

Account-level S3 Block Public Access settings might be interfering.

**Check account-level settings:**
```bash
aws s3control get-public-access-block --account-id 339648407295
```

**If blocking is enabled, you might need to disable it:**
```bash
aws s3control put-public-access-block \
  --account-id 339648407295 \
  --public-access-block-configuration \
    BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false
```

### 3. CloudFormation Service Role Trust Policy

The CDK execution role might have trust policy issues.

**Check the trust policy:**
```bash
aws iam get-role \
  --role-name cdk-hnb659fds-cfn-exec-role-339648407295-ap-south-1 \
  --query 'Role.AssumeRolePolicyDocument'
```

**Expected trust policy should include:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudformation.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

### 4. CloudTrail Investigation

Check CloudTrail logs for detailed error information.

**Look for CreateBucket events:**
```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=CreateBucket \
  --region ap-south-1 \
  --max-results 10 \
  --query 'Events[*].[EventTime,EventName,ErrorCode,ErrorMessage]' \
  --output table
```

**Look for PutBucketPolicy events:**
```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=PutBucketPolicy \
  --region ap-south-1 \
  --max-results 10
```

### 5. Bucket Name Conflicts

Even though we deleted the buckets, there might be a naming conflict.

**Try creating a bucket with a different name pattern:**

Modify `packages/infrastructure/lib/satyamool-stack.ts`:

```typescript
// Change from:
bucketName: `satyamool-documents-${this.account}`,

// To:
bucketName: `satyamool-docs-${this.account}-${Date.now()}`,
```

### 6. Region-Specific Issues

Some regions have specific restrictions.

**Try deploying to a different region temporarily:**
```bash
export CDK_DEFAULT_REGION=us-east-1
npx cdk deploy --require-approval never
```

## Workaround Solutions

### Option 1: Manual Bucket Creation + CDK Import

1. **Create buckets manually:**
```bash
aws s3api create-bucket \
  --bucket satyamool-documents-339648407295 \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1

aws s3api create-bucket \
  --bucket satyamool-audit-logs-339648407295 \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1

aws s3api create-bucket \
  --bucket satyamool-frontend-339648407295 \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1
```

2. **Import into CDK stack:**
```bash
# This requires modifying the CDK code to import existing resources
# Not recommended for production
```

### Option 2: Use Terraform Instead

If CDK continues to fail, consider using Terraform which might handle permissions differently.

### Option 3: Deploy via AWS Console

Manually create the infrastructure via AWS Console:
1. Create S3 buckets
2. Create DynamoDB tables
3. Create Lambda functions
4. Configure permissions manually

### Option 4: Contact AWS Support

If none of the above solutions work, open an AWS Support case:
- Category: Account and Billing Support
- Subject: "CloudFormation Access Denied on S3 bucket creation despite AdministratorAccess"
- Include: Account ID, Region, Error message, Request ID

## Testing Commands

**Test manual S3 bucket creation:**
```bash
aws s3api create-bucket \
  --bucket test-permissions-$(date +%s) \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1

# Clean up
aws s3 rb s3://test-permissions-<timestamp>
```

**Test CloudFormation S3 creation:**
```bash
# Create a minimal CloudFormation template
cat > test-s3-cfn.yaml <<EOF
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  TestBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: test-cfn-s3-$(date +%s)
EOF

# Deploy
aws cloudformation create-stack \
  --stack-name test-s3-permissions \
  --template-body file://test-s3-cfn.yaml \
  --region ap-south-1

# Check status
aws cloudformation describe-stacks \
  --stack-name test-s3-permissions \
  --region ap-south-1

# Clean up
aws cloudformation delete-stack \
  --stack-name test-s3-permissions \
  --region ap-south-1
```

## Next Steps

1. Run the diagnostic commands above to identify the root cause
2. Apply the appropriate fix based on findings
3. If issue persists, contact AWS Support with diagnostic results
4. Consider workaround solutions if urgent deployment is needed

## Additional Resources

- [AWS CDK Troubleshooting](https://docs.aws.amazon.com/cdk/v2/guide/troubleshooting.html)
- [AWS CloudFormation Troubleshooting](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/troubleshooting.html)
- [AWS Organizations SCPs](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html)
- [S3 Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
