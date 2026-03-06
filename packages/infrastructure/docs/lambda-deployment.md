# Lambda Functions Deployment Guide

## Overview

SatyaMool deploys multiple Lambda functions for different purposes:

### Processing Pipeline Functions
1. **OCR Processor** - Extract text from documents using Textract
2. **Translation Processor** - Translate documents using Translate
3. **Analysis Processor** - Analyze documents using Bedrock
4. **Lineage Processor** - Construct ownership graphs
5. **Scoring Processor** - Calculate trust scores

### API Functions
6. **Auth APIs** - Authentication and authorization
7. **Property APIs** - Property management
8. **Document APIs** - Document upload and retrieval
9. **Admin APIs** - User and system management

### Utility Functions
10. **Notification Processor** - Send email and in-app notifications
11. **Cleanup Processor** - Clean up deactivated accounts

## Lambda Configuration

### OCR Processor

**Function Name**: `SatyaMool-OCR-Processor`
**Runtime**: Python 3.12
**Architecture**: ARM64 (Graviton2)
**Memory**: 512 MB
**Timeout**: 5 minutes
**Reserved Concurrency**: 100 (prod), 10 (dev)
**Trigger**: SQS queue (document processing)

**Environment Variables**:
- `DOCUMENTS_TABLE_NAME`: DynamoDB table name
- `QUEUE_URL`: SQS queue URL
- `LOG_LEVEL`: INFO

**IAM Permissions**:
- S3: Read documents
- DynamoDB: Read/write Documents table
- SQS: Consume messages
- Textract: Analyze documents
- KMS: Decrypt data

### Translation Processor

**Function Name**: `SatyaMool-Translation-Processor`
**Runtime**: Python 3.12
**Architecture**: ARM64
**Memory**: 512 MB
**Timeout**: 2 minutes
**Reserved Concurrency**: 100 (prod), 10 (dev)
**Trigger**: DynamoDB Streams (Documents table)

**Environment Variables**:
- `DOCUMENTS_TABLE_NAME`: DynamoDB table name
- `LOG_LEVEL`: INFO

**IAM Permissions**:
- DynamoDB: Read/write Documents table, read streams
- Translate: Translate text
- KMS: Decrypt data

### Analysis Processor

**Function Name**: `SatyaMool-Analysis-Processor`
**Runtime**: Python 3.12
**Architecture**: ARM64
**Memory**: 1024 MB
**Timeout**: 3 minutes
**Reserved Concurrency**: 100 (prod), 10 (dev)
**Trigger**: DynamoDB Streams (Documents table)

**Environment Variables**:
- `DOCUMENTS_TABLE_NAME`: DynamoDB table name
- `BEDROCK_MODEL_ID`: anthropic.claude-3-5-sonnet-20241022
- `LOG_LEVEL`: INFO

**IAM Permissions**:
- DynamoDB: Read/write Documents table, read streams
- Bedrock: Invoke model
- KMS: Decrypt data

### Notification Processor

**Function Name**: `SatyaMool-Notification-Processor`
**Runtime**: Node.js 20
**Architecture**: ARM64
**Memory**: 256 MB
**Timeout**: 30 seconds
**Reserved Concurrency**: 50 (prod), 10 (dev)
**Trigger**: DynamoDB Streams (Properties and Documents tables)

**Environment Variables**:
- `USERS_TABLE_NAME`: Users table name
- `PROPERTIES_TABLE_NAME`: Properties table name
- `NOTIFICATIONS_TABLE_NAME`: Notifications table name
- `FROM_EMAIL`: noreply@satyamool.com
- `FRONTEND_URL`: https://app.satyamool.com
- `LOG_LEVEL`: INFO

**IAM Permissions**:
- DynamoDB: Read Users/Properties, write Notifications, read streams
- SES: Send email
- KMS: Decrypt data

### Cleanup Processor

**Function Name**: `SatyaMool-Cleanup-Deactivated-Accounts`
**Runtime**: Node.js 20
**Architecture**: ARM64
**Memory**: 512 MB
**Timeout**: 15 minutes
**Reserved Concurrency**: 1
**Trigger**: EventBridge (daily at 2 AM UTC)

**Environment Variables**:
- All table names
- `DOCUMENT_BUCKET_NAME`: S3 bucket name
- `USER_POOL_ID`: Cognito User Pool ID
- `LOG_LEVEL`: INFO

**IAM Permissions**:
- DynamoDB: Read/write all tables
- S3: Delete objects
- Cognito: Delete users
- KMS: Decrypt data

## X-Ray Tracing

All Lambda functions have X-Ray tracing enabled for distributed tracing.

**Configuration**:
- Tracing Mode: Active
- Sampling Rate: 100% (can be adjusted via sampling rules)

**Custom Segments**:
- External API calls (Textract, Translate, Bedrock)
- DynamoDB operations
- S3 operations

## Deployment

### Package Lambda Functions

```bash
# Navigate to function directory
cd packages/processing/ocr

# Install dependencies
pip install -r requirements.txt -t .

# Create deployment package
zip -r function.zip .

# Upload to S3 (optional, for large packages)
aws s3 cp function.zip s3://deployment-bucket/lambda/ocr/function.zip
```

### Deploy via CDK

```bash
# Deploy all Lambda functions
cd packages/infrastructure
cdk deploy

# Deploy specific function (update code only)
aws lambda update-function-code \
  --function-name SatyaMool-OCR-Processor \
  --zip-file fileb://function.zip
```

## Monitoring

### CloudWatch Metrics

Monitor these metrics for each function:
- Invocations
- Duration
- Errors
- Throttles
- ConcurrentExecutions

### CloudWatch Logs

Log groups:
- `/aws/lambda/SatyaMool-OCR-Processor`
- `/aws/lambda/SatyaMool-Notification-Processor`
- `/aws/lambda/SatyaMool-Cleanup-Deactivated-Accounts`

### X-Ray Traces

View traces in X-Ray console to analyze:
- End-to-end latency
- Service dependencies
- Error rates by service
- Performance bottlenecks

## Troubleshooting

**Issue**: Lambda timeout
- Increase timeout setting
- Optimize code performance
- Check external API latency

**Issue**: Out of memory
- Increase memory allocation
- Optimize memory usage
- Check for memory leaks

**Issue**: Throttling
- Increase reserved concurrency
- Check account-level concurrency limits
- Implement exponential backoff in callers
