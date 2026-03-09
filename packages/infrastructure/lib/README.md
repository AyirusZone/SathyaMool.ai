# SatyaMool Infrastructure

This directory contains the AWS CDK infrastructure code for the SatyaMool platform.

## S3 Event Notification to SQS Configuration

### Overview

The infrastructure implements automatic document processing by configuring S3 event notifications to trigger SQS messages when documents are uploaded.

### Architecture

```
User Upload → S3 Bucket → S3 Event → SQS Queue → Lambda Processing
```

### Components

#### 1. Document Storage Bucket
- **Name**: `satyamool-documents-{account-id}`
- **Encryption**: KMS encryption with customer-managed key
- **Versioning**: Enabled for disaster recovery
- **Public Access**: Blocked (all public access disabled)
- **Lifecycle Policies**:
  - Intelligent-Tiering: Automatically optimizes storage costs
  - Incomplete Multipart Upload Cleanup: Deletes after 7 days

#### 2. Processing Queue (SQS)
- **Name**: `satyamool-document-processing`
- **Encryption**: KMS encryption
- **Visibility Timeout**: 6 minutes (Lambda timeout + buffer)
- **Long Polling**: 20 seconds receive message wait time
- **Dead Letter Queue**: Configured with max 3 retries

#### 3. Dead Letter Queue (DLQ)
- **Name**: `satyamool-document-processing-dlq`
- **Retention**: 14 days
- **Purpose**: Captures failed processing messages for manual review

#### 4. S3 Event Notification
- **Event Type**: `OBJECT_CREATED` (all creation events)
- **Filter**: 
  - Prefix: `properties/` (only documents in property folders)
  - Suffix: None (accepts all file types: PDF, JPEG, PNG, TIFF)
- **Destination**: Processing Queue (SQS)

### Message Filtering

The S3 event notification is configured to only send messages for documents uploaded to the `properties/{propertyId}/documents/` path structure. This ensures:

1. Only actual property documents trigger processing
2. Other S3 objects (reports, thumbnails, etc.) don't trigger unnecessary processing
3. Clear separation of document types by path prefix

### Event Message Format

When a document is uploaded, S3 sends a message to SQS with the following structure:

```json
{
  "Records": [
    {
      "eventVersion": "2.1",
      "eventSource": "aws:s3",
      "eventName": "ObjectCreated:Put",
      "eventTime": "2024-01-15T10:30:00.000Z",
      "s3": {
        "bucket": {
          "name": "satyamool-documents-123456789012",
          "arn": "arn:aws:s3:::satyamool-documents-123456789012"
        },
        "object": {
          "key": "properties/prop-123/documents/doc-456.pdf",
          "size": 1024000,
          "eTag": "abc123"
        }
      }
    }
  ]
}
```

### Security

1. **Encryption at Rest**: All data encrypted with KMS customer-managed key
2. **Encryption in Transit**: TLS 1.2+ enforced
3. **Access Control**: 
   - S3 bucket blocks all public access
   - SQS queue only accessible by authorized Lambda functions
   - KMS key policies restrict encryption/decryption operations

### Monitoring

The infrastructure outputs the following values for monitoring and Lambda configuration:

- `DocumentBucketName`: S3 bucket name for document storage
- `ProcessingQueueUrl`: SQS queue URL for Lambda polling
- `ProcessingQueueArn`: SQS queue ARN for IAM policies
- `EncryptionKeyId`: KMS key ID for encryption operations

### Deployment

```bash
# Install dependencies
npm install

# Build the CDK stack
npm run build

# Deploy to AWS
npm run deploy
```

### Requirements Satisfied

This implementation satisfies **Requirement 2.5** from the SatyaMool requirements:

> **2.5** WHEN a document is successfully uploaded to Document_Store, THE System SHALL publish a message to Processing_Queue

### Cost Optimization

The infrastructure follows AWS Well-Architected Framework best practices:

1. **S3 Intelligent-Tiering**: Automatically moves objects between access tiers based on usage patterns
2. **KMS Key Rotation**: Enabled for security compliance
3. **Dead Letter Queue**: Prevents message loss and enables debugging
4. **Long Polling**: Reduces SQS costs by minimizing empty receives

### Next Steps

After deploying this infrastructure:

1. Configure Lambda functions to poll the SQS queue
2. Implement OCR processing (Task 7.1)
3. Set up CloudWatch alarms for queue depth monitoring
4. Configure auto-scaling for Lambda concurrency based on queue depth
