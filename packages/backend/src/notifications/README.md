# Notification System

## Overview

The SatyaMool notification system provides real-time email and in-app notifications for property verification events. It monitors DynamoDB Streams for status changes in Properties and Documents tables and sends appropriate notifications to users.

## Architecture

### Components

1. **Notification Lambda Function** (`index.ts`)
   - Triggered by DynamoDB Streams from Properties and Documents tables
   - Sends email notifications via AWS SES
   - Stores in-app notifications in DynamoDB
   - Handles multiple notification types

2. **Notification History API** (`get-notifications.ts`)
   - GET endpoint to retrieve user notification history
   - PUT endpoint to mark notifications as read
   - Supports filtering and pagination

3. **DynamoDB Tables**
   - **Users Table**: Stores user email addresses for notifications
   - **Properties Table**: Monitored for property status changes
   - **Documents Table**: Monitored for document processing status changes
   - **Notifications Table**: Stores in-app notification history

### Event Flow

```
DynamoDB Stream Event
        ↓
Notification Lambda
        ↓
    ┌───┴───┐
    ↓       ↓
  SES     DynamoDB
 Email   Notification
         Storage
```

## Notification Types

### 1. Completion Notifications (Requirement 14.2)

**Trigger**: Property status changes to `completed`

**Email Content**:
- Property address
- Trust Score summary
- Link to view property details and download report

**Example**:
```
Subject: Property Verification Complete - SatyaMool

Your property verification for 123 Main St, Bangalore has been completed successfully.

Trust Score: 85/100

You can now view the detailed lineage graph and download your property report.
```

### 2. Failure Notifications (Requirements 14.1, 14.6)

**Trigger**: Property status changes to `failed`

**Email Content**:
- Property address
- Error details (user-friendly)
- Suggested actions:
  - Check document formats
  - Verify document quality
  - Re-upload documents
  - Contact support

**Example**:
```
Subject: Property Verification Failed - SatyaMool

Unfortunately, the verification for 123 Main St, Bangalore has failed.

Suggested Actions:
- Check if all required documents were uploaded correctly
- Ensure documents are clear and readable
- Verify that documents are in supported formats (PDF, JPEG, PNG, TIFF)
- Try re-uploading the documents
```

### 3. OCR Quality Warning Notifications (Requirement 14.4)

**Trigger**: Document OCR confidence < 70%

**Email Content**:
- Property address
- Explanation of low confidence
- Possible causes:
  - Faded or damaged document
  - Poor scan quality
  - Handwritten text
  - Low resolution
- Recommended actions:
  - Re-scan with higher quality
  - Ensure good lighting
  - Re-upload clearer version
  - Manual review may be required

### 4. Translation Failure Notifications (Requirement 14.5)

**Trigger**: Document translation fails

**Email Content**:
- Property address
- Translation failure notice
- Recommended actions:
  - Original OCR text available for manual review
  - Re-upload clearer document
  - Contact support for assistance

### 5. Document Processing Failure Notifications (Requirement 14.1)

**Trigger**: Document processing status changes to `failed`

**Email Content**:
- Property address
- Error details
- Suggested actions:
  - Verify file format
  - Check file size (< 50MB)
  - Ensure file is not corrupted
  - Re-upload document

## API Endpoints

### GET /v1/notifications

Retrieve notification history for authenticated user.

**Query Parameters**:
- `limit` (optional): Number of notifications to return (default: 50, max: 100)
- `unreadOnly` (optional): Filter for unread notifications only (default: false)

**Response**:
```json
{
  "notifications": [
    {
      "notificationId": "notif-123",
      "userId": "user-123",
      "propertyId": "prop-123",
      "type": "completion",
      "subject": "Property Verification Complete",
      "message": "Your property verification is complete",
      "read": false,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "unreadCount": 5,
  "total": 50
}
```

**Requirements**: 14.3, 14.8

### PUT /v1/notifications/{notificationId}/read

Mark a notification as read.

**Response**:
```json
{
  "notification": {
    "notificationId": "notif-123",
    "userId": "user-123",
    "read": true,
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

**Requirements**: 14.3, 14.8

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `USERS_TABLE_NAME` | DynamoDB Users table name | `SatyaMool-Users` |
| `PROPERTIES_TABLE_NAME` | DynamoDB Properties table name | `SatyaMool-Properties` |
| `NOTIFICATIONS_TABLE_NAME` | DynamoDB Notifications table name | `SatyaMool-Notifications` |
| `FROM_EMAIL` | SES verified sender email | `noreply@satyamool.com` |
| `FRONTEND_URL` | Frontend application URL | `https://app.satyamool.com` |
| `LOG_LEVEL` | Logging level | `INFO` |

### AWS SES Setup

1. **Verify Sender Email**:
   ```bash
   aws ses verify-email-identity --email-address noreply@satyamool.com
   ```

2. **Move Out of Sandbox** (Production):
   - Request production access via AWS Console
   - Provide use case details
   - Wait for approval (typically 24 hours)

3. **Configure Email Templates** (Optional):
   - Create SES email templates for consistent branding
   - Use template variables for dynamic content

### DynamoDB Streams Configuration

The notification Lambda is automatically triggered by DynamoDB Streams:

- **Properties Table Stream**: `NEW_AND_OLD_IMAGES`
- **Documents Table Stream**: `NEW_AND_OLD_IMAGES`
- **Batch Size**: 10 records
- **Max Batching Window**: 5 seconds
- **Retry Attempts**: 3

## Error Handling

### Graceful Degradation

- **Email Failure**: Logged but doesn't block notification storage
- **Notification Storage Failure**: Logged but doesn't block email sending
- **User Not Found**: Logged and skipped gracefully
- **Batch Processing**: One record failure doesn't affect others

### Retry Logic

- DynamoDB Stream retries: 3 attempts with exponential backoff
- SES retries: Handled by AWS SDK with exponential backoff
- Failed records after retries: Sent to Dead Letter Queue (DLQ)

## Testing

### Unit Tests

Run all notification tests:
```bash
cd packages/backend
npm test -- src/notifications/__tests__/notifications.test.ts
```

### Test Coverage

- ✅ Property completion notifications
- ✅ Property failure notifications
- ✅ OCR quality warnings
- ✅ Translation failure notifications
- ✅ Document processing failures
- ✅ Error handling and graceful degradation
- ✅ Notification history retrieval
- ✅ Mark as read functionality
- ✅ Authentication and authorization

### Manual Testing

1. **Test Completion Notification**:
   ```bash
   # Update property status to completed
   aws dynamodb update-item \
     --table-name SatyaMool-Properties \
     --key '{"propertyId": {"S": "test-prop-123"}}' \
     --update-expression "SET #status = :status" \
     --expression-attribute-names '{"#status": "status"}' \
     --expression-attribute-values '{":status": {"S": "completed"}}'
   ```

2. **Test OCR Quality Warning**:
   ```bash
   # Update document with low OCR confidence
   aws dynamodb update-item \
     --table-name SatyaMool-Documents \
     --key '{"documentId": {"S": "test-doc-123"}, "propertyId": {"S": "test-prop-123"}}' \
     --update-expression "SET processingStatus = :status, ocrConfidence = :confidence" \
     --expression-attribute-values '{":status": {"S": "ocr_complete"}, ":confidence": {"N": "65"}}'
   ```

## Monitoring

### CloudWatch Metrics

- **Lambda Invocations**: Number of notification Lambda invocations
- **Lambda Errors**: Failed notification processing
- **Lambda Duration**: Processing time per notification
- **SES Send Rate**: Email sending rate
- **SES Bounce Rate**: Email bounce rate
- **SES Complaint Rate**: Email complaint rate

### CloudWatch Alarms

Recommended alarms:
- Lambda error rate > 5%
- SES bounce rate > 5%
- SES complaint rate > 0.1%
- Lambda duration > 25 seconds (approaching timeout)

### Logs

All notification events are logged to CloudWatch Logs:
- Stream events received
- Status changes detected
- Emails sent
- Notifications stored
- Errors and warnings

## Performance

### Optimization

- **Batch Processing**: Process up to 10 stream records per invocation
- **Concurrent Execution**: Reserved concurrency of 50
- **Memory**: 256 MB (sufficient for email generation)
- **Timeout**: 30 seconds
- **Architecture**: ARM64 (Graviton2) for cost efficiency

### Scalability

- Handles 1000+ notifications per minute
- Auto-scales with DynamoDB Stream throughput
- SES sending rate: 14 emails/second (sandbox), 50+/second (production)

## Security

### IAM Permissions

The notification Lambda has minimal required permissions:
- **DynamoDB**: Read from Users and Properties tables
- **DynamoDB**: Read/Write to Notifications table
- **SES**: SendEmail and SendRawEmail
- **CloudWatch**: Logs and metrics

### Data Protection

- Email addresses encrypted at rest in DynamoDB
- TLS 1.2+ for all SES communications
- No sensitive data in email content (only property addresses and scores)
- Notification history accessible only to authenticated users

## Future Enhancements

1. **SMS Notifications**: Add Twilio/SNS integration for SMS alerts
2. **Push Notifications**: Implement web push notifications
3. **Notification Preferences**: Allow users to customize notification settings
4. **Digest Emails**: Send daily/weekly summary emails
5. **Webhook Support**: Allow third-party integrations via webhooks
6. **Rich Email Templates**: Use SES templates with branding
7. **Multi-Language Support**: Localize notification content

## Troubleshooting

### Common Issues

**Issue**: Emails not being sent
- **Check**: SES email verification status
- **Check**: Lambda execution logs for errors
- **Check**: SES sending limits (sandbox vs production)

**Issue**: Notifications not stored
- **Check**: DynamoDB table permissions
- **Check**: Lambda execution role
- **Check**: CloudWatch logs for errors

**Issue**: Duplicate notifications
- **Check**: DynamoDB Stream configuration
- **Check**: Lambda idempotency implementation
- **Check**: Stream event deduplication

**Issue**: High Lambda costs
- **Check**: Stream batch size (increase to reduce invocations)
- **Check**: Reserved concurrency settings
- **Check**: Lambda memory allocation

## References

- [AWS SES Documentation](https://docs.aws.amazon.com/ses/)
- [DynamoDB Streams Documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html)
- [Lambda Event Source Mapping](https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventsourcemapping.html)
- [Requirements Document](../../../../.kiro/specs/satya-mool/requirements.md) - Requirement 14
