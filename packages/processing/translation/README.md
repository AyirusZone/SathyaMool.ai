# Translation Lambda Function

## Overview

This Lambda function is triggered by DynamoDB Streams when documents reach "ocr_complete" status. It automatically detects the document language from OCR metadata and translates regional Indian languages to English using Amazon Translate.

## Supported Languages

The function supports translation from the following Indian languages to English:

- **Hindi** (hi)
- **Tamil** (ta)
- **Kannada** (kn)
- **Marathi** (mr)
- **Telugu** (te)

## Requirements Implemented

- **5.1**: Support translation from Hindi, Tamil, Kannada, Marathi, and Telugu to English
- **5.2**: Automatically translate OCR output when in a supported regional language
- **5.3**: Preserve original language text alongside English translation
- **5.6**: Store both original and translated text in DynamoDB
- **5.7**: Update processing status to "translation_complete"

## Architecture

### Trigger
- **DynamoDB Streams** from the Documents table
- Filters for documents with `processingStatus = "ocr_complete"`

### Processing Flow

1. **Event Filtering**: Only processes INSERT and MODIFY events from DynamoDB Streams
2. **Status Check**: Filters for documents with "ocr_complete" status
3. **Language Detection**: Reads detected language from OCR metadata
4. **Translation Decision**:
   - If language is English or unsupported: Skip translation
   - If language is supported: Translate to English
5. **Text Translation**: Uses Amazon Translate with formal language settings
6. **Result Storage**: Stores translated text alongside original in DynamoDB
7. **Status Update**: Updates status to "translation_complete"

### Text Chunking

Amazon Translate has a 10,000 byte limit per request. The function automatically:
- Detects if text exceeds the limit
- Splits text into chunks at sentence boundaries
- Translates each chunk separately
- Combines translated chunks back together

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DOCUMENTS_TABLE_NAME` | DynamoDB table name for documents | `SatyaMool-Documents` |

## IAM Permissions Required

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "translate:TranslateText"
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
        "dynamodb:GetRecords",
        "dynamodb:GetShardIterator",
        "dynamodb:DescribeStream",
        "dynamodb:ListStreams"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/SatyaMool-Documents/stream/*"
    }
  ]
}
```

## DynamoDB Stream Configuration

- **Stream View Type**: `NEW_AND_OLD_IMAGES` or `NEW_IMAGE`
- **Batch Size**: 10-100 records
- **Starting Position**: `LATEST` or `TRIM_HORIZON`
- **Maximum Retry Attempts**: 3
- **Bisect Batch on Error**: Enabled

## Data Model

### Input (from DynamoDB Stream)

```json
{
  "documentId": "uuid",
  "propertyId": "uuid",
  "processingStatus": "ocr_complete",
  "ocrText": "Original text in regional language",
  "ocrMetadata": {
    "detected_language": "hi",
    "average_confidence": 85.5
  }
}
```

### Output (stored in DynamoDB)

```json
{
  "documentId": "uuid",
  "propertyId": "uuid",
  "processingStatus": "translation_complete",
  "ocrText": "Original text in regional language",
  "translatedText": "Translated text in English",
  "translationMetadata": {
    "source_language": "hi",
    "target_language": "en",
    "source_language_name": "Hindi",
    "translation_performed": true,
    "chunk_count": 1,
    "total_characters": 1500,
    "translated_characters": 1450,
    "low_confidence_flag": false,
    "translation_timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

## Translation Settings

The function uses the following Amazon Translate settings:

- **Formality**: `FORMAL` - Appropriate for legal documents
- **Profanity**: `MASK` - Masks any profanity in the text

## Error Handling

### Translation Failures

If translation fails:
1. Status is updated to `translation_failed`
2. Error message is stored in the document record
3. CloudWatch logs contain detailed error information
4. The document can be retried manually or automatically

### Unsupported Languages

If the detected language is not supported:
- Original text is copied to `translatedText` field
- `translation_performed` is set to `false`
- Status is updated to `translation_complete`

## Monitoring

### CloudWatch Metrics

- **Invocations**: Number of times the function is invoked
- **Duration**: Execution time per invocation
- **Errors**: Number of failed invocations
- **Throttles**: Number of throttled invocations

### CloudWatch Logs

The function logs:
- Document processing start/completion
- Language detection results
- Translation statistics (character counts, chunk counts)
- Low confidence warnings
- Error details with stack traces

### Custom Metrics

Consider adding custom CloudWatch metrics for:
- Documents translated per language
- Average translation time per language
- Translation confidence flags
- Character count statistics

## Performance Considerations

### Execution Time

- **Small documents** (< 1000 chars): ~1-2 seconds
- **Medium documents** (1000-5000 chars): ~2-5 seconds
- **Large documents** (> 5000 chars): ~5-15 seconds (chunked translation)

### Concurrency

- Lambda can process multiple documents in parallel
- DynamoDB Streams batch size affects throughput
- Consider reserved concurrency for predictable performance

### Cost Optimization

- Amazon Translate charges per character translated
- Avoid re-translating documents (check if translation already exists)
- Use appropriate batch sizes for DynamoDB Streams

## Testing

### Unit Tests

Run unit tests with:
```bash
cd packages/processing/translation
python -m pytest __tests__/
```

### Integration Tests

Test with sample DynamoDB Stream events:
```bash
# Create test event
aws lambda invoke \
  --function-name SatyaMool-Translation \
  --payload file://test-events/dynamodb-stream-event.json \
  response.json
```

## Deployment

### Using AWS CDK

The function is deployed as part of the SatyaMool infrastructure:

```typescript
const translationLambda = new lambda.Function(this, 'TranslationFunction', {
  runtime: lambda.Runtime.PYTHON_3_12,
  handler: 'handler.lambda_handler',
  code: lambda.Code.fromAsset('packages/processing/translation'),
  environment: {
    DOCUMENTS_TABLE_NAME: documentsTable.tableName
  },
  timeout: Duration.minutes(2),
  memorySize: 512
});

// Add DynamoDB Stream trigger
translationLambda.addEventSource(new DynamoEventSource(documentsTable, {
  startingPosition: lambda.StartingPosition.LATEST,
  batchSize: 10,
  bisectBatchOnError: true,
  retryAttempts: 3
}));
```

## Future Enhancements

1. **Mixed Language Support** (Requirement 5.7):
   - Detect language per section
   - Translate each section separately
   - Preserve section boundaries

2. **Translation Confidence Scoring** (Requirement 5.4):
   - Implement custom confidence scoring
   - Flag translations below 80% confidence
   - Queue low-confidence translations for manual review

3. **Context-Aware Legal Translation** (Requirement 5.5):
   - Build custom terminology database
   - Use Amazon Translate Custom Terminology feature
   - Improve accuracy for legal terms

4. **Caching**:
   - Cache common phrases/terms
   - Reduce duplicate translation requests
   - Improve performance and reduce costs

## Troubleshooting

### Common Issues

1. **"Text too long" error**:
   - Check if text chunking is working correctly
   - Verify MAX_CHUNK_SIZE is appropriate

2. **"Unsupported language pair" error**:
   - Verify language code is correct (ISO 639-1)
   - Check if language is in SUPPORTED_LANGUAGES

3. **DynamoDB Stream not triggering**:
   - Verify stream is enabled on Documents table
   - Check Lambda event source mapping
   - Verify IAM permissions

4. **High latency**:
   - Check document size (large documents take longer)
   - Monitor Amazon Translate API latency
   - Consider increasing Lambda memory

## References

- [Amazon Translate Documentation](https://docs.aws.amazon.com/translate/)
- [DynamoDB Streams Documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html)
- [AWS Lambda Python Documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-python.html)
