# Quick Lambda Testing Commands

## Prerequisites

Before testing, ensure Lambda functions have their code properly deployed. The current deployment only created the infrastructure - the actual Lambda code needs to be built and uploaded.

## Test Lambda Functions

### 1. List All Deployed Lambda Functions

```bash
aws lambda list-functions --region ap-south-1 | grep SatyaMool
```

Expected output:
- SatyaMool-OCR-Processor
- SatyaMool-Notification-Processor
- SatyaMool-Cleanup-Deactivated-Accounts

### 2. Get Lambda Function Details

```bash
# Get OCR Lambda details
aws lambda get-function --function-name SatyaMool-OCR-Processor --region ap-south-1

# Get Notification Lambda details
aws lambda get-function --function-name SatyaMool-Notification-Processor --region ap-south-1

# Get Cleanup Lambda details
aws lambda get-function --function-name SatyaMool-Cleanup-Deactivated-Accounts --region ap-south-1
```

### 3. Invoke Lambda with Test Event

```bash
# Test Cleanup Lambda (simplest to test)
aws lambda invoke \
  --function-name SatyaMool-Cleanup-Deactivated-Accounts \
  --cli-binary-format raw-in-base64-out \
  --payload file://test-events/cleanup-test-event.json \
  --region ap-south-1 \
  cleanup-response.json

# View response
cat cleanup-response.json
```

```bash
# Test Notification Lambda
aws lambda invoke \
  --function-name SatyaMool-Notification-Processor \
  --cli-binary-format raw-in-base64-out \
  --payload file://test-events/notification-test-event.json \
  --region ap-south-1 \
  notification-response.json

# View response
cat notification-response.json
```

```bash
# Test OCR Lambda (requires S3 document to exist)
aws lambda invoke \
  --function-name SatyaMool-OCR-Processor \
  --cli-binary-format raw-in-base64-out \
  --payload file://test-events/ocr-test-event.json \
  --region ap-south-1 \
  ocr-response.json

# View response
cat ocr-response.json
```

### 4. View Lambda Logs (Real-time)

```bash
# Tail OCR Lambda logs
aws logs tail /aws/lambda/SatyaMool-OCR-Processor --region ap-south-1 --follow

# Tail Notification Lambda logs
aws logs tail /aws/lambda/SatyaMool-Notification-Processor --region ap-south-1 --follow

# Tail Cleanup Lambda logs
aws logs tail /aws/lambda/SatyaMool-Cleanup-Deactivated-Accounts --region ap-south-1 --follow
```

### 5. View Recent Lambda Logs (Last 5 minutes)

```bash
# View recent OCR logs
aws logs tail /aws/lambda/SatyaMool-OCR-Processor --region ap-south-1 --since 5m

# View recent Notification logs
aws logs tail /aws/lambda/SatyaMool-Notification-Processor --region ap-south-1 --since 5m

# View recent Cleanup logs
aws logs tail /aws/lambda/SatyaMool-Cleanup-Deactivated-Accounts --region ap-south-1 --since 5m
```

### 6. Check Lambda Metrics

```bash
# Get invocation count (last hour)
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=SatyaMool-OCR-Processor \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum \
  --region ap-south-1

# Get error count (last hour)
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=SatyaMool-OCR-Processor \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum \
  --region ap-south-1
```

## Test via AWS Console

### Quick Steps:

1. **Open Lambda Console**: https://ap-south-1.console.aws.amazon.com/lambda/home?region=ap-south-1#/functions
2. **Select Function**: Click on `SatyaMool-OCR-Processor` (or any other function)
3. **Create Test Event**:
   - Click **Test** tab
   - Click **Create new event**
   - Name: `test-event-1`
   - Paste JSON from `test-events/` folder
   - Click **Save**
4. **Run Test**: Click **Test** button
5. **View Results**: See execution result, logs, and duration

### View Logs in Console:

1. **Open CloudWatch Console**: https://ap-south-1.console.aws.amazon.com/cloudwatch/home?region=ap-south-1#logsV2:log-groups
2. **Find Log Group**: `/aws/lambda/SatyaMool-OCR-Processor`
3. **Click Latest Stream**: View most recent execution logs
4. **Filter Logs**: Use filter patterns like `ERROR`, `WARNING`, etc.

## Test End-to-End Flow

### Upload Document to S3 (Triggers OCR)

```bash
# Create test document
echo "This is a test document for OCR processing" > test-doc.txt

# Upload to S3 (this will trigger OCR Lambda via SQS)
aws s3 cp test-doc.txt \
  s3://satyamool-documents-339648407295/properties/test-prop-001/documents/test-doc-001.txt \
  --region ap-south-1

# Monitor OCR Lambda logs
aws logs tail /aws/lambda/SatyaMool-OCR-Processor --region ap-south-1 --follow
```

### Check SQS Queue

```bash
# Get queue attributes
aws sqs get-queue-attributes \
  --queue-url https://sqs.ap-south-1.amazonaws.com/339648407295/satyamool-document-processing \
  --attribute-names All \
  --region ap-south-1

# Receive messages (peek without deleting)
aws sqs receive-message \
  --queue-url https://sqs.ap-south-1.amazonaws.com/339648407295/satyamool-document-processing \
  --max-number-of-messages 1 \
  --region ap-south-1
```

### Check DynamoDB Tables

```bash
# Scan Documents table
aws dynamodb scan \
  --table-name SatyaMool-Documents \
  --region ap-south-1 \
  --max-items 5

# Get specific document
aws dynamodb get-item \
  --table-name SatyaMool-Documents \
  --key '{"documentId":{"S":"test-doc-001"},"propertyId":{"S":"test-prop-001"}}' \
  --region ap-south-1
```

## Common Issues

### Issue: "Runtime.ImportModuleError"
**Cause**: Lambda code not properly packaged or deployed
**Solution**: Build and deploy Lambda code:
```bash
cd packages/backend
npm run build
# Then redeploy CDK stack
cd ../infrastructure
npx cdk deploy
```

### Issue: "AccessDeniedException"
**Cause**: Lambda doesn't have permissions to access AWS services
**Solution**: Check IAM role permissions in CDK stack

### Issue: Lambda timeout
**Cause**: Function taking too long to execute
**Solution**: 
- Increase timeout in Lambda configuration
- Optimize code
- Check if external services (Textract, S3) are responding

### Issue: No logs appearing
**Cause**: CloudWatch Logs permissions missing
**Solution**: Verify Lambda execution role has CloudWatch Logs permissions

## Quick Verification Checklist

- [ ] Lambda functions deployed: `aws lambda list-functions --region ap-south-1`
- [ ] S3 buckets created: `aws s3 ls | grep satyamool`
- [ ] DynamoDB tables created: `aws dynamodb list-tables --region ap-south-1`
- [ ] SQS queues created: `aws sqs list-queues --region ap-south-1`
- [ ] Lambda can be invoked: `aws lambda invoke ...`
- [ ] CloudWatch logs accessible: `aws logs tail ...`
- [ ] IAM permissions correct: Check Lambda execution role

## Next Steps

1. Build and deploy Lambda code (currently only infrastructure is deployed)
2. Enable S3 event notifications to trigger OCR automatically
3. Configure SES for email notifications
4. Set up CloudWatch alarms for monitoring
5. Deploy API Gateway for REST API access
