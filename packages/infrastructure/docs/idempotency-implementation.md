# Idempotency Implementation for SatyaMool Lambda Functions

## Overview

This document describes the idempotency implementation for all Lambda functions in the SatyaMool platform to prevent duplicate processing and race conditions.

**Requirements**: 3.1, 3.3 - Handle duplicate SQS messages gracefully and prevent race conditions

## Implementation Components

### 1. Idempotency DynamoDB Table

Created a dedicated DynamoDB table for tracking idempotency records:

**Table Name**: `SatyaMool-Idempotency`

**Schema**:
- **Partition Key**: `idempotencyKey` (STRING) - Unique identifier for each operation
- **Attributes**:
  - `status` - Operation status: `IN_PROGRESS`, `COMPLETED`, or `FAILED`
  - `result` - Cached result for completed operations
  - `error` - Error message for failed operations
  - `createdAt` - Timestamp when operation started
  - `updatedAt` - Timestamp of last update
  - `ttl` - Time-to-live for automatic cleanup (24 hours default)

**Features**:
- On-demand billing mode for cost optimization
- TTL enabled for automatic cleanup of old records
- AWS-managed encryption

### 2. TypeScript Idempotency Utility

**Location**: `packages/backend/src/utils/idempotency.ts`

**Key Functions**:

#### `generateIdempotencyKey(data: any): string`
Generates a SHA-256 hash from data to create a unique idempotency key.

#### `checkIdempotency(idempotencyKey: string): Promise<IdempotencyRecord | null>`
Checks if an operation with the given key has already been processed.

#### `markInProgress(idempotencyKey: string, ttlHours?: number): Promise<boolean>`
Marks an operation as in progress using conditional write to prevent race conditions.
Returns `false` if the key already exists (another process started it first).

#### `markCompleted(idempotencyKey: string, result?: any): Promise<void>`
Marks an operation as completed and stores the result for future duplicate requests.

#### `markFailed(idempotencyKey: string, error: string): Promise<void>`
Marks an operation as failed and stores the error message.

#### `executeIdempotent<T>(operation: () => Promise<T>, data: any, options?: IdempotencyOptions): Promise<T>`
High-level function that wraps an operation with complete idempotency handling:
1. Checks if operation already processed
2. Returns cached result if completed
3. Skips if already in progress
4. Marks as in progress with conditional write
5. Executes the operation
6. Marks as completed/failed based on result

#### `conditionalPut(params: PutCommandInput): Promise<boolean>`
Performs a conditional DynamoDB put operation to prevent duplicate records.

#### `conditionalUpdate(params: UpdateCommandInput): Promise<boolean>`
Performs a conditional DynamoDB update operation.

#### `extractSQSIdempotencyKey(sqsRecord: any): string`
Extracts or generates an idempotency key from an SQS message.

### 3. Python Idempotency Utility

**Location**: `packages/processing/common/idempotency.py`

**Key Functions** (Python equivalents of TypeScript functions):

- `generate_idempotency_key(data: Any) -> str`
- `check_idempotency(idempotency_key: str) -> Optional[Dict[str, Any]]`
- `mark_in_progress(idempotency_key: str, ttl_hours: int) -> bool`
- `mark_completed(idempotency_key: str, result: Any) -> None`
- `mark_failed(idempotency_key: str, error: str) -> None`
- `execute_idempotent(operation: Callable, data: Any, ...) -> Any`
- `conditional_update_document_status(...)` - Specialized function for updating document status with conditional writes
- `extract_sqs_idempotency_key(sqs_record: Dict[str, Any]) -> str`

**Decorator**:
```python
@idempotent(key_generator=lambda doc_id, prop_id: f"{doc_id}:{prop_id}")
def process_document(document_id, property_id):
    # Processing logic
    pass
```

## Updated Lambda Functions

### 1. OCR Processing Lambda

**File**: `packages/processing/ocr/handler.py`

**Changes**:
- Imports idempotency utilities
- Generates idempotency key: `ocr:{documentId}:{propertyId}`
- Checks if document already processed before starting
- Marks operation as in progress with conditional write
- Uses `conditional_update_document_status` to update status from `pending` to `ocr_processing`
- Marks idempotency record as completed/failed based on result
- Handles duplicate SQS messages gracefully by skipping already processed documents

**Benefits**:
- Prevents duplicate OCR processing if SQS message is redelivered
- Prevents race conditions if multiple Lambda instances process the same message
- Returns early if document is already being processed by another instance

### 2. Property Creation Lambda

**File**: `packages/backend/src/properties/create-property.ts`

**Changes**:
- Imports idempotency utilities
- Generates idempotency key from user ID and property details
- Wraps property creation in `executeIdempotent`
- Uses `conditionalPut` to prevent duplicate property records
- Returns existing property if already created (idempotent behavior)

**Benefits**:
- Prevents duplicate property creation if API is called multiple times
- Returns consistent result for duplicate requests
- Handles race conditions between concurrent requests

### 3. Document Registration Lambda

**File**: `packages/backend/src/properties/register-document.ts`

**Changes**:
- Imports idempotency utilities
- Generates idempotency key: `document:register:{documentId}:{propertyId}`
- Wraps document registration in `executeIdempotent`
- Uses `conditionalPut` to prevent duplicate document records
- Returns existing document if already registered

**Benefits**:
- Prevents duplicate document registration
- Handles race conditions between concurrent registrations
- Returns consistent result for duplicate requests

## Infrastructure Updates

### CDK Stack Changes

**File**: `packages/infrastructure/lib/satyamool-stack.ts`

**Changes**:
1. Added Idempotency DynamoDB table definition
2. Granted OCR Lambda read/write access to Idempotency table
3. Backend Lambda functions will need access to Idempotency table (to be added when API Gateway integration is complete)

**Environment Variables** (to be added to Lambda functions):
- `IDEMPOTENCY_TABLE_NAME=SatyaMool-Idempotency`

## Idempotency Patterns

### Pattern 1: SQS Message Processing

For Lambda functions triggered by SQS:

```python
# Extract idempotency key from SQS message
idempotency_key = extract_sqs_idempotency_key(sqs_record)

# Check if already processed
existing_record = check_idempotency(idempotency_key)
if existing_record and existing_record['status'] == 'COMPLETED':
    logger.info("Message already processed, skipping")
    return

# Mark as in progress (prevents duplicate processing)
if not mark_in_progress(idempotency_key):
    logger.info("Another instance is processing this message")
    return

try:
    # Process the message
    result = process_message(message_data)
    mark_completed(idempotency_key, result)
except Exception as e:
    mark_failed(idempotency_key, str(e))
    raise
```

### Pattern 2: API Request Processing

For Lambda functions triggered by API Gateway:

```typescript
// Generate idempotency key from request data
const idempotencyKey = `operation:${generateIdempotencyKey(requestData)}`;

// Execute idempotent operation
const result = await executeIdempotent(
  async () => {
    // Perform the operation
    return await performOperation(requestData);
  },
  requestData,
  { idempotencyKey }
);

return result;
```

### Pattern 3: Conditional DynamoDB Updates

For preventing race conditions in status updates:

```python
# Only update if current status is expected
success = conditional_update_document_status(
    documents_table,
    document_id,
    property_id,
    new_status='processing',
    expected_status='pending'
)

if not success:
    logger.warning("Document status changed, may have been processed by another instance")
    return
```

## Testing Idempotency

### Test Scenarios

1. **Duplicate SQS Messages**:
   - Send the same SQS message twice
   - Verify only one processing occurs
   - Verify second message is skipped with log message

2. **Concurrent API Requests**:
   - Send multiple identical API requests concurrently
   - Verify only one operation executes
   - Verify all requests return the same result

3. **Race Conditions**:
   - Simulate concurrent Lambda invocations for the same document
   - Verify conditional writes prevent duplicate processing
   - Verify status updates are atomic

4. **TTL Cleanup**:
   - Verify idempotency records are automatically deleted after 24 hours
   - Verify operations can be retried after TTL expiration

### Manual Testing

```bash
# Test duplicate SQS message handling
aws sqs send-message --queue-url <queue-url> --message-body '{"documentId":"test-123","propertyId":"prop-456"}'
aws sqs send-message --queue-url <queue-url> --message-body '{"documentId":"test-123","propertyId":"prop-456"}'

# Check idempotency table
aws dynamodb get-item --table-name SatyaMool-Idempotency --key '{"idempotencyKey":{"S":"ocr:test-123:prop-456"}}'

# Test concurrent API requests
for i in {1..5}; do
  curl -X POST https://api.example.com/v1/properties \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"address":"123 Main St","surveyNumber":"SN-001"}' &
done
wait
```

## Monitoring

### CloudWatch Metrics

Monitor these metrics for idempotency effectiveness:

1. **Idempotency Table Metrics**:
   - Read/Write capacity units
   - Throttled requests
   - Item count

2. **Lambda Metrics**:
   - Invocation count vs. actual processing count
   - Duplicate message skip rate
   - Conditional write failure rate

### CloudWatch Logs

Search for these log patterns:

- `"Idempotency record found"` - Duplicate operation detected
- `"Operation already completed"` - Returning cached result
- `"Operation already in progress"` - Race condition detected
- `"Another process started this operation"` - Conditional write failed

### Alarms

Consider setting up alarms for:

1. High rate of duplicate operations (may indicate SQS configuration issue)
2. High rate of conditional write failures (may indicate race conditions)
3. Idempotency table throttling

## Performance Considerations

### Latency Impact

- Idempotency check adds ~5-10ms per operation (DynamoDB read)
- Conditional write adds ~5-10ms (DynamoDB write with condition)
- Total overhead: ~10-20ms per operation

### Cost Impact

- Idempotency table uses on-demand billing
- Typical cost: $0.25 per million read/write requests
- TTL cleanup is free
- Expected cost: < $1/month for moderate usage

### Optimization Tips

1. **Use appropriate TTL**: 24 hours is sufficient for most cases
2. **Batch operations**: Group multiple operations when possible
3. **Cache idempotency checks**: For high-frequency operations, consider caching in Lambda memory
4. **Monitor table size**: Ensure TTL is working correctly to prevent unbounded growth

## Future Enhancements

1. **Idempotency for all processing Lambdas**:
   - Translation Lambda
   - Analysis Lambda
   - Lineage Lambda
   - Trust Score Lambda

2. **Idempotency for all backend Lambdas**:
   - All property management endpoints
   - All admin endpoints
   - All user endpoints

3. **Advanced features**:
   - Configurable TTL per operation type
   - Idempotency key versioning
   - Distributed locking for long-running operations
   - Idempotency metrics dashboard

## References

- AWS DynamoDB Conditional Writes: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html#WorkingWithItems.ConditionalUpdate
- AWS Lambda Idempotency: https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#services-sqs-idempotency
- SQS Message Deduplication: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/using-messagededuplicationid-property.html
