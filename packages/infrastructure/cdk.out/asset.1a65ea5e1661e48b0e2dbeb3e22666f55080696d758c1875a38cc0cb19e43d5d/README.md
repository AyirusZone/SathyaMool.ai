# OCR Lambda Function

This Lambda function handles Optical Character Recognition (OCR) processing for the SatyaMool platform using Amazon Textract.

## Overview

The OCR Lambda function:
1. Polls the SQS queue for document upload events from S3
2. Retrieves documents from S3 using boto3
3. Invokes Amazon Textract with FORMS and TABLES analysis
4. Handles both sync (< 5 pages) and async (> 5 pages) Textract APIs
5. Stores raw OCR output in the Documents DynamoDB table
6. Updates processing status to "ocr_complete"

## Requirements Addressed

- **Requirement 3.1**: Initiates OCR processing within 30 seconds of document upload
- **Requirement 4.1**: Uses Amazon Textract with FORMS and TABLES analysis features
- **Requirement 4.2**: Extracts text, forms, and tabular data
- **Requirement 4.3**: Preserves spatial relationships between text elements
- **Requirement 4.7**: Detects document language and includes language metadata

## Architecture

### Input
- **Trigger**: SQS messages from the document processing queue
- **Message Format**: S3 event notification containing bucket name and object key
- **Expected S3 Key Format**: `properties/{propertyId}/documents/{documentId}.{ext}`

### Processing Logic

#### Sync vs Async Decision
- **Sync API** (< 5 pages): Uses `analyze_document` for immediate results
- **Async API** (> 5 pages): Uses `start_document_analysis` with polling

The function estimates page count based on file size (rough estimate: 100KB per page).

#### Textract Features
- **FORMS**: Extracts key-value pairs from form fields
- **TABLES**: Extracts tabular data with row/column structure

### Output
- **DynamoDB Updates**: Stores OCR results in Documents table
- **Status Updates**: Updates `processingStatus` field through processing stages
- **Metadata**: Stores confidence scores, language detection, page count

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DOCUMENTS_TABLE_NAME` | DynamoDB table name for documents | Yes |
| `QUEUE_URL` | SQS queue URL for processing | Yes |

## IAM Permissions Required

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:HeadObject"
      ],
      "Resource": "arn:aws:s3:::satyamool-documents-*/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "textract:AnalyzeDocument",
        "textract:StartDocumentAnalysis",
        "textract:GetDocumentAnalysis"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:UpdateItem",
        "dynamodb:GetItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/SatyaMool-Documents"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:*:*:satyamool-document-processing"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:*:*:key/*"
    }
  ]
}
```

## Configuration

### Lambda Settings
- **Runtime**: Python 3.12
- **Memory**: 512 MB (as per design document)
- **Timeout**: 5 minutes (300 seconds)
- **Architecture**: ARM64 (Graviton2 for cost/energy efficiency)
- **Reserved Concurrency**: Part of 1000 total processing concurrency

### SQS Configuration
- **Batch Size**: 10 messages per invocation
- **Visibility Timeout**: 6 minutes (Lambda timeout + buffer)
- **Max Receive Count**: 3 (retry up to 3 times before DLQ)

## Error Handling

### Retry Logic
- Failed messages are automatically retried up to 3 times by SQS
- After 3 failures, messages move to the Dead Letter Queue (DLQ)
- Each retry uses exponential backoff via SQS visibility timeout

### Error Scenarios
1. **Invalid S3 Key Format**: Logs error and skips processing
2. **S3 Access Error**: Raises exception for SQS retry
3. **Textract API Error**: Raises exception for SQS retry
4. **DynamoDB Update Error**: Raises exception for SQS retry
5. **Async Job Timeout**: Raises exception after 60 polling attempts (5 minutes)

### Status Tracking
- `ocr_processing`: OCR in progress
- `ocr_complete`: OCR successfully completed
- `ocr_failed`: OCR failed (with error message stored)

## Confidence Scoring

The function calculates average confidence scores from Textract output:
- **High Confidence**: > 70% (normal processing)
- **Low Confidence**: < 70% (flagged for review)

Low confidence regions are flagged in the `ocrMetadata.low_confidence_flag` field.

## Testing

### Unit Tests
Located in `__tests__/handler.test.py`:
- Test Textract API integration with mock responses
- Test sync vs async decision logic
- Test confidence scoring
- Test error handling and retries

### Integration Tests
- Upload test documents to S3
- Verify SQS message processing
- Verify DynamoDB updates
- Verify status transitions

## Monitoring

### CloudWatch Metrics
- Lambda invocations, duration, errors
- SQS queue depth and message age
- Textract API calls and errors

### CloudWatch Logs
- Structured logging with document IDs
- Error stack traces for debugging
- Processing time metrics

### X-Ray Tracing
- End-to-end trace of document processing
- Textract API call latency
- DynamoDB update latency

## Deployment

The Lambda function is deployed via AWS CDK in the infrastructure package:

```typescript
const ocrLambda = new lambda.Function(this, 'OcrFunction', {
  runtime: lambda.Runtime.PYTHON_3_12,
  architecture: lambda.Architecture.ARM_64,
  handler: 'handler.lambda_handler',
  code: lambda.Code.fromAsset('packages/processing/ocr'),
  memorySize: 512,
  timeout: Duration.minutes(5),
  environment: {
    DOCUMENTS_TABLE_NAME: documentsTable.tableName,
    QUEUE_URL: processingQueue.queueUrl
  }
});

// Add SQS event source
ocrLambda.addEventSource(new SqsEventSource(processingQueue, {
  batchSize: 10,
  maxBatchingWindow: Duration.seconds(5)
}));
```

## Future Enhancements

1. **Handwriting Detection**: Improve handling of handwritten documents
2. **Multi-Language Support**: Enhanced language detection for regional Indian languages
3. **Confidence Improvement**: Pre-processing for faded/damaged documents
4. **Cost Optimization**: Implement caching for duplicate documents
5. **Parallel Processing**: Process multiple pages in parallel for large documents
