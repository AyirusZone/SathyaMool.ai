# Dead Letter Queue (DLQ) Configuration

## Overview

This document describes the Dead Letter Queue (DLQ) configuration for the SatyaMool platform. DLQs capture messages that fail processing after maximum retry attempts, enabling analysis and alerting for systematic failures.

**Requirements:** 3.4 - Handle failed processing with DLQ

## Architecture

### Components

1. **Processing DLQ** (`satyamool-document-processing-dlq`)
   - Captures failed messages from the main document processing queue
   - Retention period: 14 days
   - Encryption: KMS with customer-managed key
   - Max receive count: 3 (messages move to DLQ after 3 failed attempts)

2. **DLQ Processor Lambda** (`SatyaMool-DLQ-Processor`)
   - Processes messages from the DLQ
   - Analyzes failure information
   - Updates document status to 'failed' in DynamoDB
   - Sends SNS alerts to operations team
   - Publishes CloudWatch metrics

3. **CloudWatch Alarm** (`SatyaMool-DLQ-Messages-Detected`)
   - Triggers when any message arrives in the DLQ
   - Sends notification to SNS topic
   - Evaluation period: 5 minutes
   - Threshold: ≥ 1 message

## Message Flow

```
┌─────────────────┐
│ Processing      │
│ Queue           │
└────────┬────────┘
         │
         │ (3 failed attempts)
         ▼
┌─────────────────┐
│ Processing DLQ  │
└────────┬────────┘
         │
         │ (SQS Event)
         ▼
┌─────────────────┐
│ DLQ Processor   │
│ Lambda          │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│DynamoDB│ │  SNS   │
│ Update │ │ Alert  │
└────────┘ └────────┘
```

## DLQ Processor Functionality

### 1. Failure Analysis

The DLQ processor extracts the following information from failed messages:

- **Message ID**: Unique identifier for the failed message
- **Receive Count**: Number of times the message was received before failure
- **First Receive Timestamp**: When the message was first received
- **Document Information** (if applicable):
  - Document ID
  - Property ID
  - S3 bucket and key
  - Processing stage where failure occurred

### 2. Document Status Update

For document processing failures, the processor:

1. Extracts document ID and property ID from the S3 key
2. Updates the document status in DynamoDB to 'failed'
3. Records the failure reason and timestamp
4. Preserves the message ID for traceability

**DynamoDB Update:**
```python
{
    'processingStatus': 'failed',
    'failureReason': 'Processing failed after maximum retries. Message ID: {messageId}',
    'failureTimestamp': '{ISO 8601 timestamp}'
}
```

### 3. Alert Notification

The processor sends an SNS notification with:

- **Subject**: "SatyaMool DLQ Alert: Processing Failure"
- **Message Content**:
  - Failure details (message ID, timestamp, receive count)
  - Document information (if available)
  - Action required steps
  - CloudWatch Logs link for debugging

**Alert Recipients:**
- Operations team (configured via SNS topic subscription)
- On-call engineers (via PagerDuty integration)

### 4. CloudWatch Metrics

The processor publishes custom metrics:

- **Namespace**: `SatyaMool/DLQ`
- **Metric**: `MessagesProcessed`
- **Unit**: Count
- **Dimensions**: None (aggregated across all DLQ messages)

## Monitoring and Alerting

### CloudWatch Dashboard

The Processing Pipeline dashboard includes a DLQ metrics widget showing:

1. **DLQ Messages**: Number of messages in the DLQ (average over 5 minutes)
2. **DLQ Processor Invocations**: Number of times the processor Lambda was invoked
3. **DLQ Processor Errors**: Number of errors in the processor Lambda

### CloudWatch Alarms

**DLQ Message Alarm:**
- **Name**: `SatyaMool-DLQ-Messages-Detected`
- **Metric**: `ApproximateNumberOfMessagesVisible` on Processing DLQ
- **Threshold**: ≥ 1 message
- **Evaluation Period**: 5 minutes
- **Action**: Send notification to SNS topic

**Alarm States:**
- **OK**: No messages in DLQ (normal operation)
- **ALARM**: Messages detected in DLQ (requires investigation)
- **INSUFFICIENT_DATA**: Not enough data to evaluate (rare)

## Operational Procedures

### When DLQ Alarm Triggers

1. **Check CloudWatch Logs**
   - Navigate to `/aws/lambda/SatyaMool-DLQ-Processor` log group
   - Review recent log entries for failure details
   - Look for patterns (same error repeated, specific document types, etc.)

2. **Analyze Failure Cause**
   - **API Throttling**: Check if AWS service quotas are exceeded (Textract, Bedrock, Translate)
   - **Invalid Data**: Check if document format is corrupted or unsupported
   - **Timeout**: Check if Lambda timeout is too short for large documents
   - **Permission Issues**: Check if IAM roles have required permissions

3. **Take Corrective Action**
   - **Systemic Issue**: Fix the root cause (increase quotas, update code, adjust timeouts)
   - **Isolated Failure**: Manually reprocess the document or notify the user
   - **Data Issue**: Contact user to re-upload the document

4. **Monitor Resolution**
   - Verify the alarm returns to OK state
   - Check that similar failures are not recurring
   - Update runbooks if new failure patterns are discovered

### Manual DLQ Message Inspection

To manually inspect DLQ messages:

```bash
# List messages in DLQ (without removing them)
aws sqs receive-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/{account}/satyamool-document-processing-dlq \
  --max-number-of-messages 10 \
  --visibility-timeout 0

# Purge all messages from DLQ (use with caution!)
aws sqs purge-queue \
  --queue-url https://sqs.us-east-1.amazonaws.com/{account}/satyamool-document-processing-dlq
```

### Manual Message Reprocessing

To manually reprocess a failed message:

1. **Retrieve the message from DLQ**
   ```bash
   aws sqs receive-message \
     --queue-url https://sqs.us-east-1.amazonaws.com/{account}/satyamool-document-processing-dlq \
     --max-number-of-messages 1
   ```

2. **Fix the underlying issue** (if applicable)

3. **Send the message back to the main queue**
   ```bash
   aws sqs send-message \
     --queue-url https://sqs.us-east-1.amazonaws.com/{account}/satyamool-document-processing \
     --message-body '{message body from step 1}'
   ```

4. **Delete the message from DLQ**
   ```bash
   aws sqs delete-message \
     --queue-url https://sqs.us-east-1.amazonaws.com/{account}/satyamool-document-processing-dlq \
     --receipt-handle {receipt handle from step 1}
   ```

## Configuration Parameters

### SQS Queue Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| Queue Name | `satyamool-document-processing-dlq` | DLQ name |
| Retention Period | 14 days | How long messages are kept |
| Encryption | KMS | Customer-managed key |
| Visibility Timeout | 30 seconds | Default visibility timeout |
| Max Receive Count | N/A | Not applicable for DLQ |

### Lambda Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| Function Name | `SatyaMool-DLQ-Processor` | Lambda function name |
| Runtime | Python 3.12 | Python runtime |
| Memory | 256 MB | Memory allocation |
| Timeout | 30 seconds | Execution timeout |
| Reserved Concurrency | 10 | Max concurrent executions |
| Batch Size | 10 | SQS messages per invocation |
| Max Batching Window | 5 seconds | Wait time before invoking |

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DOCUMENTS_TABLE_NAME` | DynamoDB table for documents | `SatyaMool-Documents` |
| `ALARM_TOPIC_ARN` | SNS topic for alerts | `arn:aws:sns:us-east-1:123456789012:SatyaMool-Alarm-Notifications` |
| `LOG_LEVEL` | Logging level | `INFO` |

## Testing

### Unit Tests

Run unit tests for the DLQ processor:

```bash
cd packages/processing/dlq
python -m pytest test_handler.py -v
```

**Test Coverage:**
- Lambda handler with single and multiple records
- Failure information extraction from S3 events
- Document status updates in DynamoDB
- SNS alert notifications
- CloudWatch metrics publishing
- Error handling for invalid JSON and partial failures

### Integration Testing

To test the DLQ configuration end-to-end:

1. **Trigger a failure** by sending an invalid message to the processing queue
2. **Verify the message moves to DLQ** after 3 failed attempts
3. **Check DLQ processor invocation** in CloudWatch Logs
4. **Verify document status update** in DynamoDB
5. **Confirm SNS alert** was sent
6. **Check CloudWatch alarm** triggered

## Best Practices

1. **Monitor DLQ Depth**: Set up alerts for DLQ depth > 0 to catch failures immediately
2. **Regular Review**: Review DLQ messages weekly to identify patterns
3. **Root Cause Analysis**: Always investigate the root cause, not just the symptom
4. **Update Runbooks**: Document new failure patterns and resolutions
5. **Test Failure Scenarios**: Regularly test DLQ functionality with simulated failures
6. **Retention Policy**: Keep DLQ retention at 14 days to allow time for investigation
7. **Idempotency**: Ensure reprocessing messages is safe (idempotent operations)

## Troubleshooting

### DLQ Processor Lambda Errors

**Symptom**: DLQ processor Lambda is failing

**Possible Causes:**
- DynamoDB table not accessible (permissions issue)
- SNS topic not accessible (permissions issue)
- Invalid message format (unexpected structure)

**Resolution:**
1. Check Lambda execution role permissions
2. Review CloudWatch Logs for error details
3. Verify environment variables are set correctly

### Messages Not Moving to DLQ

**Symptom**: Messages are failing but not appearing in DLQ

**Possible Causes:**
- DLQ not configured on the main queue
- Max receive count not reached
- Messages being deleted before reaching max receive count

**Resolution:**
1. Verify DLQ configuration on main queue
2. Check max receive count setting (should be 3)
3. Review Lambda error handling (ensure errors are thrown, not caught)

### Alarm Not Triggering

**Symptom**: Messages in DLQ but alarm not triggering

**Possible Causes:**
- Alarm threshold too high
- Alarm evaluation period too long
- SNS topic subscription not configured

**Resolution:**
1. Check alarm configuration (threshold should be ≥ 1)
2. Verify SNS topic has active subscriptions
3. Test alarm manually using AWS Console

## References

- [AWS SQS Dead Letter Queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)
- [AWS Lambda Error Handling](https://docs.aws.amazon.com/lambda/latest/dg/invocation-retries.html)
- [CloudWatch Alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html)
- [SatyaMool Requirements Document](../../.kiro/specs/satya-mool/requirements.md) - Requirement 3.4
