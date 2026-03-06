# SatyaMool Deployment Guide

This guide provides instructions for deploying the SatyaMool infrastructure to AWS using AWS CDK.

## Prerequisites

1. **AWS Account**: You need an AWS account with appropriate permissions
2. **AWS CLI**: Install and configure AWS CLI with credentials
3. **Node.js**: Version 20.x or later
4. **AWS CDK**: Install globally with `npm install -g aws-cdk`
5. **Docker**: Required for building Lambda functions (optional, for local testing)

## Environment Setup

### 1. Configure AWS Credentials

```bash
# Configure AWS CLI with your credentials
aws configure

# Verify credentials
aws sts get-caller-identity
```

### 2. Bootstrap CDK (First Time Only)

Bootstrap CDK in your AWS account and region:

```bash
# For development environment
cdk bootstrap aws://ACCOUNT-ID/us-east-1

# For staging environment
cdk bootstrap aws://ACCOUNT-ID/us-east-1 --profile staging

# For production environment
cdk bootstrap aws://ACCOUNT-ID/us-east-1 --profile production
```

## Deployment Environments

SatyaMool supports three deployment environments:

- **dev**: Development environment with minimal resources and costs
- **staging**: Pre-production environment with production-like configuration
- **prod**: Production environment with full resources and monitoring

## Deployment Steps

### Development Environment

```bash
# Navigate to infrastructure directory
cd packages/infrastructure

# Install dependencies
npm install

# Set environment variable
export DEPLOYMENT_ENV=dev

# Synthesize CloudFormation template (optional, for review)
cdk synth

# Deploy to AWS
cdk deploy

# Or deploy with auto-approval (skip confirmation prompts)
cdk deploy --require-approval never
```

### Staging Environment

```bash
# Set environment variable
export DEPLOYMENT_ENV=staging

# Deploy to staging
cdk deploy --profile staging

# Or with specific AWS account/region
cdk deploy \
  --profile staging \
  --context account=123456789012 \
  --context region=us-east-1
```

### Production Environment

```bash
# Set environment variable
export DEPLOYMENT_ENV=prod

# Review changes before deployment (recommended)
cdk diff --profile production

# Deploy to production
cdk deploy --profile production

# Deploy with change set review
cdk deploy --profile production --require-approval broadening
```

## Post-Deployment Configuration

### 1. Configure Cognito User Pool

After deployment, configure Cognito:

```bash
# Get User Pool ID from CDK outputs
aws cloudformation describe-stacks \
  --stack-name SatyaMoolStack \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text

# Configure SMS settings (for phone authentication)
aws cognito-idp update-user-pool \
  --user-pool-id <USER_POOL_ID> \
  --sms-configuration SnsCallerArn=<SNS_ROLE_ARN>
```

### 2. Verify SES Email Addresses

For email notifications to work, verify sender email addresses in SES:

```bash
# Verify email address
aws ses verify-email-identity --email-address noreply@satyamool.com

# Check verification status
aws ses get-identity-verification-attributes \
  --identities noreply@satyamool.com
```

### 3. Configure Custom Domain (Optional)

If using custom domains for API Gateway or CloudFront:

1. Create SSL/TLS certificates in AWS Certificate Manager (ACM)
2. Update `environment-config.ts` with certificate ARNs
3. Configure DNS records (Route 53 or external DNS provider)
4. Redeploy with updated configuration

### 4. Set Up Monitoring Alerts

Configure SNS topic email subscription for alarms:

```bash
# Get SNS topic ARN from CDK outputs
aws cloudformation describe-stacks \
  --stack-name SatyaMoolStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AlarmTopicArn`].OutputValue' \
  --output text

# Subscribe email to SNS topic
aws sns subscribe \
  --topic-arn <ALARM_TOPIC_ARN> \
  --protocol email \
  --notification-endpoint ops@satyamool.com

# Confirm subscription via email
```

## Environment Variables

The following environment variables control deployment:

| Variable | Description | Default | Values |
|----------|-------------|---------|--------|
| `DEPLOYMENT_ENV` | Target environment | `dev` | `dev`, `staging`, `prod` |
| `CDK_DEFAULT_ACCOUNT` | AWS account ID | From AWS CLI | Account ID |
| `CDK_DEFAULT_REGION` | AWS region | `us-east-1` | AWS region |

## CDK Commands

### Useful CDK Commands

```bash
# List all stacks
cdk list

# Show differences between deployed and local
cdk diff

# Synthesize CloudFormation template
cdk synth

# Deploy stack
cdk deploy

# Destroy stack (WARNING: Deletes all resources)
cdk destroy

# Watch mode (auto-deploy on changes)
cdk watch

# Show CloudFormation template
cdk synth --json

# Deploy specific stack
cdk deploy SatyaMoolStack
```

## Deployment Outputs

After successful deployment, CDK will output important resource identifiers:

- **DocumentBucketName**: S3 bucket for document storage
- **ProcessingQueueUrl**: SQS queue URL for document processing
- **UserPoolId**: Cognito User Pool ID
- **UserPoolClientId**: Cognito App Client ID
- **ApiGatewayUrl**: API Gateway endpoint URL
- **CloudFrontDistributionId**: CloudFront distribution ID (if enabled)
- **AlarmTopicArn**: SNS topic ARN for alarms

Save these outputs for frontend configuration and operational use.

## Updating Existing Deployment

To update an existing deployment:

```bash
# Review changes
cdk diff

# Deploy updates
cdk deploy

# Deploy with automatic approval
cdk deploy --require-approval never
```

## Rollback

If deployment fails or you need to rollback:

```bash
# Rollback to previous version (CloudFormation)
aws cloudformation cancel-update-stack --stack-name SatyaMoolStack

# Or destroy and redeploy
cdk destroy
cdk deploy
```

## Multi-Region Deployment

To deploy to multiple regions:

```bash
# Deploy to us-east-1
export CDK_DEFAULT_REGION=us-east-1
cdk deploy

# Deploy to eu-west-1
export CDK_DEFAULT_REGION=eu-west-1
cdk deploy
```

## Cost Estimation

Before deploying, estimate costs:

1. Use AWS Pricing Calculator: https://calculator.aws/
2. Key cost drivers:
   - Lambda invocations and duration
   - DynamoDB read/write capacity
   - S3 storage and requests
   - Textract API calls
   - Bedrock API calls (token usage)
   - CloudFront data transfer

Expected monthly costs:
- **Dev**: $50-100 (minimal usage)
- **Staging**: $200-500 (moderate usage)
- **Prod**: $500-2000+ (depends on traffic)

## Troubleshooting

### Common Issues

**Issue**: CDK bootstrap fails
```bash
# Solution: Ensure AWS credentials are configured
aws sts get-caller-identity

# Re-bootstrap with explicit account/region
cdk bootstrap aws://123456789012/us-east-1
```

**Issue**: Lambda deployment fails (package too large)
```bash
# Solution: Use Lambda layers for dependencies
# Or optimize package size by removing dev dependencies
```

**Issue**: API Gateway CORS errors
```bash
# Solution: Update CORS configuration in environment-config.ts
# Ensure frontend origin is in allowOrigins list
```

**Issue**: Cognito SMS not working
```bash
# Solution: Configure SNS SMS settings
# Verify phone number in Cognito console
# Check SNS spending limits
```

## Security Best Practices

1. **Use IAM roles with least-privilege permissions**
2. **Enable MFA for AWS root account**
3. **Rotate AWS access keys regularly**
4. **Enable CloudTrail for audit logging**
5. **Use AWS Secrets Manager for sensitive data**
6. **Enable encryption at rest and in transit**
7. **Regularly review IAM policies and permissions**
8. **Use separate AWS accounts for dev/staging/prod**

## Monitoring and Maintenance

### CloudWatch Dashboards

Access dashboards in AWS Console:
- API Metrics: `SatyaMool-API-Metrics`
- Processing Pipeline: `SatyaMool-Processing-Pipeline`
- Cost Metrics: `SatyaMool-Cost-Metrics`

### CloudWatch Alarms

Monitor alarms in AWS Console:
- Queue Depth High: Triggers when SQS queue > 10,000 messages
- Lambda Error Rate High: Triggers when error rate > 1%

### Log Groups

View logs in CloudWatch Logs:
- `/aws/lambda/SatyaMool-OCR-Processor`
- `/aws/lambda/SatyaMool-Notification-Processor`
- `/aws/lambda/SatyaMool-Cleanup-Deactivated-Accounts`
- `/aws/apigateway/SatyaMool-API`

## Disaster Recovery

### Backup Strategy

- **DynamoDB**: Point-in-time recovery enabled (production)
- **S3**: Versioning enabled (staging/production)
- **Audit Logs**: Archived to Glacier after 90 days

### Recovery Procedure

1. Restore DynamoDB tables from point-in-time backup
2. Restore S3 objects from versioned backups
3. Redeploy CDK stack if infrastructure is lost
4. Update DNS records if using custom domains
5. Verify system functionality with smoke tests

## Support

For deployment issues or questions:
- Email: ops@satyamool.com
- Documentation: https://docs.satyamool.com
- GitHub Issues: https://github.com/satyamool/satyamool/issues

## Additional Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [AWS Serverless Application Lens](https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/)
- [SatyaMool Architecture Documentation](./docs/architecture.md)
