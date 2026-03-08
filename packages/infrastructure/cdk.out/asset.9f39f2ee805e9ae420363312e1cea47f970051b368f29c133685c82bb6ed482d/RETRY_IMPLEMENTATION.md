# Retry Logic Implementation for OCR Lambda

## Overview

This document describes the retry logic implementation for the OCR Lambda function, which processes documents using Amazon Textract.

## Requirements

- **Requirement 3.3**: WHEN OCR_Engine processing fails, THE System SHALL retry up to 3 times with exponential backoff
- **Requirement 3.4**: WHEN all retry attempts fail, THE System SHALL mark the document as failed and notify the user

## Implementation

### Retry Decorator

The retry logic is implemented using a decorator pattern (`retry_with_exponential_backoff`) that can be applied to any function that makes Textract API calls.

**Key Features:**
- **Max Retries**: 3 attempts (configurable)
- **Exponential Backoff**: 1s, 2s, 4s delays between retries
- **Non-Retryable Errors**: Immediately fails for certain error types (InvalidParameterException, AccessDeniedException, etc.)
- **Exception Propagation**: After exhausting retries, raises the exception to trigger SQS retry mechanism

### Exponential Backoff Strategy

The backoff delay is calculated as:
```
delay = min(base_delay * (exponential_base ^ attempt), max_delay)
```

For the default configuration:
- Attempt 1: 1.0s delay
- Attempt 2: 2.0s delay
- Attempt 3: 4.0s delay

### Applied Functions

The retry decorator is applied to:
1. `process_document_sync()` - Synchronous Textract API calls
2. `process_document_async()` - Asynchronous Textract API calls

### Integration with SQS

The Lambda function is configured with:
- **SQS Visibility Timeout**: 6 minutes (Lambda timeout + buffer)
- **Dead Letter Queue**: Configured with `maxReceiveCount: 3`
- **Batch Item Failures**: Enabled for partial batch failure reporting

**Retry Flow:**
1. Lambda function retries Textract API calls 3 times with exponential backoff
2. If all Lambda retries fail, exception is raised
3. SQS message becomes visible again after visibility timeout
4. Lambda is invoked again (SQS retry #1)
5. Process repeats up to 3 times (SQS `maxReceiveCount`)
6. After 3 SQS retries, message is moved to Dead Letter Queue

**Total Retry Attempts**: 3 (Lambda) × 3 (SQS) = 9 potential retries before DLQ

### Error Handling

**Retryable Errors:**
- `ThrottlingException` - API rate limit exceeded
- `ServiceUnavailableException` - Textract service temporarily unavailable
- `InternalServerError` - Transient server errors
- Generic exceptions (network issues, timeouts)

**Non-Retryable Errors:**
- `InvalidParameterException` - Invalid request parameters
- `InvalidS3ObjectException` - Invalid S3 object
- `UnsupportedDocumentException` - Unsupported document format
- `AccessDeniedException` - Permission denied

### Logging

The retry logic logs:
- Warning on each retry attempt with error code and delay
- Error when all retries are exhausted
- Info on successful completion after retries

Example log output:
```
WARNING: Attempt 1/3 failed with ThrottlingException. Retrying in 1.0s...
WARNING: Attempt 2/3 failed with ThrottlingException. Retrying in 2.0s...
INFO: Sync Textract completed. Extracted 150 blocks
```

## Testing

Comprehensive unit tests verify:
1. ✅ Successful retry after initial failures
2. ✅ Retry exhaustion after 3 attempts
3. ✅ Non-retryable errors fail immediately
4. ✅ Exponential backoff delays (1s, 2s, 4s)
5. ✅ Retry logic works for both sync and async processing

Run tests:
```bash
python -m unittest packages.processing.ocr.__tests__.test_handler.TestOCRHandler -v
```

## Configuration

The retry decorator accepts the following parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_retries` | 3 | Maximum number of retry attempts |
| `base_delay` | 1.0 | Initial delay in seconds |
| `max_delay` | 60.0 | Maximum delay in seconds |
| `exponential_base` | 2.0 | Base for exponential calculation |

## Monitoring

Monitor retry behavior using CloudWatch:
- **Metric**: Lambda invocation count
- **Metric**: SQS message receive count
- **Metric**: DLQ message count
- **Logs**: Search for "Retrying in" to identify retry attempts
- **Logs**: Search for "exhausted" to identify failed documents

## Future Enhancements

Potential improvements:
1. Add jitter to backoff delays to prevent thundering herd
2. Implement circuit breaker pattern for cascading failures
3. Add custom CloudWatch metrics for retry counts
4. Implement adaptive retry based on error type
