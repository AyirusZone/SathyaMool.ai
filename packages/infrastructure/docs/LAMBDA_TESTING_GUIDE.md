# Lambda Testing Guide for SatyaMool

This guide shows you how to test your deployed Lambda functions in AWS.

## Deployed Lambda Functions

1. **OCR Processor**: `SatyaMool-OCR-Processor`
   - Processes document uploads and extracts text using Amazon Textract
   - Triggered by SQS messages from S3 uploads

2. **Notification Processor**: `SatyaMool-Notification-Processor`
   - Sends email and in-app notifications
   - Triggered by DynamoDB Streams (Properties and Documents tables)

3. **Cleanup Deactivated Accounts**: `SatyaMool-Cleanup-Deactivated-Accounts`
   - Cleans up deactivated user accounts after 30 days
   - Triggered by EventBridge (daily at 2 AM UTC)

---

## Method 1: Test via AWS CLI (Recommended for Quick Tests)

### Test OCR Lambda

First, create a test document in S3:

```bash
# Create a test document (you can use any PDF/image file)
echo "Test document content" > test-document.txt

# Upload to S3 in the correct path format
aws s3 cp test-document.txt s3://satyamool-documents-339648407295/properties/test-property-123/documents/test-doc-456.txt --region ap-south-1
```

Then invoke the Lambda with a test SQS event:

```bash
# Create test event file
cat > ocr-test-event.json << 'EOF'
{
  "Records": [
    {
      "messageId": "test-message-1",
      "receiptHandle": "test-receipt-handle",
      "body": "{\"Records\":[{\"eventVersion\":\"2.1\",\"eventSource\":\"aws:s3\",\"awsRegion\":\"ap-south-1\",\"eventTime\":\"2026-03-06T10:00:00.000Z\",\"eventName\":\"ObjectCreated:Put\",\"s3\":{\"bucket\":{\"name\":\"satyamool-documents-339648407295\"},\"object\":{\"key\":\"properties/test-property-123/documents/test-doc-456.txt\"}}}]}",
      "attributes": {
        "ApproximateReceiveCount": "1",
        "SentTimestamp": "1709722800000",
        "SenderId": "AIDAIT2UOQQY3AUEKVGXU",
        "ApproximateFirstReceiveTimestamp": "1709722800000"
      },
      "messageAttributes": {},
      "md5OfBody": "test-md5",
      "eventSource": "aws:sqs",
      "eventSourceARN": "arn:aws:sqs:ap-south-1:339648407295:satyamool-document-processing",
      "awsRegion": "ap-south-1"
    }
  ]
}
EOF

# Invoke Lambda
aws lambda invoke \
  --function-name SatyaMool-OCR-Processor \
  --payload file://ocr-test-event.json \
  --region ap-south-1 \
  ocr-response.json

# View response
cat ocr-response.json
```

### Test Notification Lambda

```bash
# Create test DynamoDB Stream event
cat > notification-test-event.json << 'EOF'
{
  "Records": [
    {
      "eventID": "1",
      "eventName": "INSERT",
      "eventVersion": "1.1",
      "eventSource": "aws:dynamodb",
      "awsRegion": "ap-south-1",
      "dynamodb": {
        "Keys": {
          "documentId": {"S": "test-doc-123"},
          "propertyId": {"S": "test-property-456"}
        },
        "NewImage": {
          "documentId": {"S": "test-doc-123"},
          "propertyId": {"S": "test-property-456"},
          "userId": {"S": "test-user-789"},
          "processingStatus": {"S": "ocr_complete"},
          "uploadedAt": {"S": "2026-03-06T10:00:00Z"}
        },
        "SequenceNumber": "111",
        "SizeBytes": 26,
        "StreamViewType": "NEW_AND_OLD_IMAGES"
      },
      "eventSourceARN": "arn:aws:dynamodb:ap-south-1:339648407295:table/SatyaMool-Documents/stream/2026-03-06T09:33:55.166"
    }
  ]
}
EOF

# Invoke Lambda
aws lambda invoke \
  --function-name SatyaMool-Notification-Processor \
  --payload file://notification-test-event.json \
  --region ap-south-1 \
  notification-response.json

# View response
cat notification-response.json
```

### Test Cleanup Lambda

```bash
# Create test EventBridge event
cat > cleanup-test-event.json << 'EOF'
{
  "version": "0",
  "id": "test-event-id",
  "detail-type": "Scheduled Event",
  "source": "aws.events",
  "account": "339648407295",
  "time": "2026-03-06T02:00:00Z",
  "region": "ap-south-1",
  "resources": [
    "arn:aws:events:ap-south-1:339648407295:rule/SatyaMool-Daily-Account-Cleanup"
  ],
  "detail": {}
}
EOF

# Invoke Lambda
aws lambda invoke \
  --function-name SatyaMool-Cleanup-Deactivated-Accounts \
  --payload file://cleanup-test-event.json \
  --region ap-south-1 \
  cleanup-response.json

# View response
cat cleanup-response.json
```

---

## Method 2: Test via AWS Console

### Step 1: Navigate to Lambda Console

1. Go to AWS Console: https://console.aws.amazon.com/lambda/
2. Select region: **ap-south-1 (Mumbai)**
3. Click on the Lambda function you want to test

### Step 2: Create Test Event

1. Click the **Test** tab
2. Click **Create new event**
3. Enter event name (e.g., "test-ocr-event")
4. Select event template or paste custom JSON
5. Click **Save**

### Step 3: Run Test

1. Click **Test** button
2. View execution results in the console
3. Check logs in CloudWatch Logs

### Test Event Templates

#### OCR Lambda Test Event
```json
{
  "Records": [
    {
      "messageId": "test-message-1",
      "receiptHandle": "test-receipt-handle",
      "body": "{\"Records\":[{\"eventVersion\":\"2.1\",\"eventSource\":\"aws:s3\",\"awsRegion\":\"ap-south-1\",\"eventTime\":\"2026-03-06T10:00:00.000Z\",\"eventName\":\"ObjectCreated:Put\",\"s3\":{\"bucket\":{\"name\":\"satyamool-documents-339648407295\"},\"object\":{\"key\":\"properties/test-property-123/documents/test-doc-456.txt\"}}}]}",
      "attributes": {
        "ApproximateReceiveCount": "1"
      },
      "eventSource": "aws:sqs",
      "eventSourceARN": "arn:aws:sqs:ap-south-1:339648407295:satyamool-document-processing",
      "awsRegion": "ap-south-1"
    }
  ]
}
```

#### Notification Lambda Test Event
```json
{
  "Records": [
    {
      "eventID": "1",
      "eventName": "INSERT",
      "eventVersion": "1.1",
      "eventSource": "aws:dynamodb",
      "awsRegion": "ap-south-1",
      "dynamodb": {
        "Keys": {
          "documentId": {"S": "test-doc-123"},
          "propertyId": {"S": "test-property-456"}
        },
        "NewImage": {
          "documentId": {"S": "test-doc-123"},
          "propertyId": {"S": "test-property-456"},
          "userId": {"S": "test-user-789"},
          "processingStatus": {"S": "ocr_complete"}
        }
      }
    }
  ]
}
```

---

## Method 3: View CloudWatch Logs

Check Lambda execution logs:

```bash
# List log streams for OCR Lambda
aws logs describe-log-streams \
  --log-group-name /aws/lambda/SatyaMool-OCR-Processor \
  --region ap-south-1 \
  --order-by LastEventTime \
  --descending \
  --max-items 5

# Get latest log events
aws logs tail /aws/lambda/SatyaMool-OCR-Processor \
  --region ap-south-1 \
  --follow
```

Or via AWS Console:
1. Go to CloudWatch Console
2. Click **Logs** → **Log groups**
3. Find `/aws/lambda/SatyaMool-OCR-Processor`
4. Click on latest log stream
5. View execution logs

---

## Method 4: Monitor Lambda Metrics

### Via AWS CLI

```bash
# Get Lambda invocation count (last hour)
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=SatyaMool-OCR-Processor \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum \
  --region ap-south-1

# Get Lambda error count
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

### Via AWS Console

1. Go to Lambda Console
2. Click on function name
3. Click **Monitor** tab
4. View metrics:
   - Invocations
   - Duration
   - Error count
   - Throttles
   - Concurrent executions

---

## Method 5: End-to-End Testing

### Test Complete OCR Flow

1. **Upload a document to S3** (this will trigger the entire flow):

```bash
# Upload a real PDF document
aws s3 cp sample-document.pdf \
  s3://satyamool-documents-339648407295/properties/prop-001/documents/doc-001.pdf \
  --region ap-south-1
```

2. **Check SQS queue** for messages:

```bash
# Check queue depth
aws sqs get-queue-attributes \
  --queue-url https://sqs.ap-south-1.amazonaws.com/339648407295/satyamool-document-processing \
  --attribute-names ApproximateNumberOfMessages \
  --region ap-south-1
```

3. **Monitor Lambda execution**:

```bash
# Tail OCR Lambda logs
aws logs tail /aws/lambda/SatyaMool-OCR-Processor \
  --region ap-south-1 \
  --follow
```

4. **Check DynamoDB** for results:

```bash
# Query Documents table
aws dynamodb get-item \
  --table-name SatyaMool-Documents \
  --key '{"documentId":{"S":"doc-001"},"propertyId":{"S":"prop-001"}}' \
  --region ap-south-1
```

---

## Troubleshooting

### Lambda Not Executing

1. **Check IAM permissions**:
```bash
aws lambda get-function --function-name SatyaMool-OCR-Processor --region ap-south-1
```

2. **Check event source mappings**:
```bash
aws lambda list-event-source-mappings \
  --function-name SatyaMool-OCR-Processor \
  --region ap-south-1
```

3. **Check CloudWatch Logs** for errors

### Lambda Timing Out

- Increase timeout in Lambda configuration
- Check if external services (Textract, S3) are responding
- Review CloudWatch Logs for bottlenecks

### Lambda Errors

1. Check CloudWatch Logs for stack traces
2. Verify environment variables are set correctly
3. Check IAM permissions for accessing AWS services
4. Verify DynamoDB tables and S3 buckets exist

---

## Quick Test Commands Summary

```bash
# Test OCR Lambda
aws lambda invoke --function-name SatyaMool-OCR-Processor --payload file://ocr-test-event.json --region ap-south-1 response.json

# Test Notification Lambda
aws lambda invoke --function-name SatyaMool-Notification-Processor --payload file://notification-test-event.json --region ap-south-1 response.json

# Test Cleanup Lambda
aws lambda invoke --function-name SatyaMool-Cleanup-Deactivated-Accounts --payload file://cleanup-test-event.json --region ap-south-1 response.json

# View logs
aws logs tail /aws/lambda/SatyaMool-OCR-Processor --region ap-south-1 --follow

# Check Lambda status
aws lambda get-function --function-name SatyaMool-OCR-Processor --region ap-south-1

# List all Lambda functions
aws lambda list-functions --region ap-south-1 | grep SatyaMool
```

---

## Next Steps

After testing:

1. **Enable S3 Event Notifications** to trigger OCR automatically on uploads
2. **Configure SES** for email notifications (verify sender email)
3. **Set up CloudWatch Alarms** for Lambda errors and throttles
4. **Deploy API Gateway** to expose Lambda functions via REST API
5. **Test with real documents** (PDF, images) for OCR accuracy
