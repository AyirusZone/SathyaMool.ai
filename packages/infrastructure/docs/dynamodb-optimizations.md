# DynamoDB Query Optimizations

This document describes the DynamoDB query optimizations implemented for the SatyaMool platform to improve performance and reduce costs per Requirement 16.5.

## Overview

The optimizations focus on three key areas:
1. **GSI (Global Secondary Index) Optimization** - Efficient query patterns
2. **Query Result Caching** - In-memory caching for frequently accessed data
3. **Batch Operations** - Bulk reads and writes to reduce latency

## 1. GSI Optimization

### Properties Table GSIs

#### userId-createdAt-index (Existing)
- **Partition Key**: userId
- **Sort Key**: createdAt
- **Projection**: ALL
- **Use Case**: List all properties for a user, sorted by creation date
- **Query Pattern**: `userId = :userId`

#### userId-status-index (NEW)
- **Partition Key**: userId
- **Sort Key**: status
- **Projection**: ALL
- **Use Case**: Filter properties by status without client-side filtering
- **Query Pattern**: `userId = :userId AND status = :status`
- **Benefit**: Eliminates need to fetch all properties and filter client-side, reducing data transfer and latency

### Documents Table GSIs

#### propertyId-uploadedAt-index (Existing)
- **Partition Key**: propertyId
- **Sort Key**: uploadedAt
- **Projection**: ALL
- **Use Case**: List all documents for a property, sorted by upload date
- **Query Pattern**: `propertyId = :propertyId`

#### propertyId-processingStatus-index (NEW)
- **Partition Key**: propertyId
- **Sort Key**: processingStatus
- **Projection**: KEYS_ONLY
- **Use Case**: Check processing status of documents without fetching full items
- **Query Pattern**: `propertyId = :propertyId AND processingStatus = :status`
- **Benefit**: Reduces data transfer by only projecting keys, useful for status checks

### Notifications Table GSIs

#### userId-createdAt-index (Existing)
- **Partition Key**: userId
- **Sort Key**: createdAt
- **Projection**: ALL
- **Use Case**: List all notifications for a user, sorted by creation date
- **Query Pattern**: `userId = :userId`

### Audit Logs Table GSIs

#### userId-timestamp-index (Existing)
- **Partition Key**: userId
- **Sort Key**: timestamp
- **Projection**: ALL
- **Use Case**: Query audit logs for a specific user
- **Query Pattern**: `userId = :userId`

## 2. Query Result Caching

### Implementation

The caching layer is implemented in `packages/backend/src/utils/dynamodb-cache.ts` and provides:

- **In-memory LRU cache** with configurable size and TTL
- **Automatic cache key generation** from query parameters
- **Cache invalidation** by key or pattern
- **Cache statistics** (hit rate, misses, evictions)

### Cache Instances

#### Property Cache
- **Max Size**: 500 entries
- **TTL**: 5 minutes (300,000 ms)
- **Use Case**: Property list queries, property details
- **Invalidation**: On property updates, deletions

#### Trust Score Cache
- **Max Size**: 500 entries
- **TTL**: 10 minutes (600,000 ms)
- **Use Case**: Trust score queries (immutable after calculation)
- **Invalidation**: Never (trust scores don't change)

#### Lineage Cache
- **Max Size**: 500 entries
- **TTL**: 10 minutes (600,000 ms)
- **Use Case**: Lineage graph queries (immutable after construction)
- **Invalidation**: Never (lineage graphs don't change)

#### Document Cache
- **Max Size**: 1000 entries
- **TTL**: 3 minutes (180,000 ms)
- **Use Case**: Document list queries
- **Invalidation**: On document uploads, processing status changes

### Cache Key Format

Cache keys are generated using the format:
```
{tableName}:{sortedQueryParams}
```

Example:
```
SatyaMool-Properties:{"userId":"user-123","status":"completed"}
```

### Cache Headers

API responses include cache status headers:
- `X-Cache: HIT` - Response served from cache
- `X-Cache: MISS` - Response fetched from DynamoDB

### Performance Impact

Expected performance improvements:
- **Cache Hit Latency**: < 1ms (vs 10-50ms for DynamoDB)
- **Cost Reduction**: 80-90% reduction in DynamoDB read capacity for cached queries
- **Throughput**: 10-50x higher for cached queries

## 3. Batch Operations

### Implementation

The batch operations utility is implemented in `packages/backend/src/utils/dynamodb-batch.ts` and provides:

- **Automatic batching** (25 items for writes, 100 for reads)
- **Parallel execution** with concurrency limits
- **Retry logic** with exponential backoff
- **Error handling** for partial failures

### Batch Get Operations

#### Features
- Splits large read requests into batches of 100 items (DynamoDB limit)
- Executes batches in parallel for maximum throughput
- Retries unprocessed keys with exponential backoff
- Returns all items with error details

#### Usage Example
```typescript
import { createBatchOperations } from '../utils/dynamodb-batch';

const batchOps = createBatchOperations(docClient);

const result = await batchOps.batchGet({
  tableName: 'SatyaMool-Documents',
  keys: [
    { documentId: 'doc-1', propertyId: 'prop-1' },
    { documentId: 'doc-2', propertyId: 'prop-1' },
    // ... up to 1000s of keys
  ],
});

console.log(`Retrieved ${result.items.length} items`);
if (result.unprocessedKeys) {
  console.log(`${result.unprocessedKeys.length} keys failed after retries`);
}
```

### Batch Write Operations

#### Features
- Splits large write requests into batches of 25 items (DynamoDB limit)
- Executes batches with concurrency limit (5 parallel batches) to avoid throttling
- Supports both PUT and DELETE operations
- Retries unprocessed items with exponential backoff

#### Usage Example
```typescript
const result = await batchOps.batchWrite({
  tableName: 'SatyaMool-Documents',
  items: [
    { documentId: 'doc-1', propertyId: 'prop-1', status: 'processed' },
    { documentId: 'doc-2', propertyId: 'prop-1', status: 'processed' },
    // ... up to 1000s of items
  ],
  operation: 'put',
});

if (result.unprocessedKeys) {
  console.log(`${result.unprocessedKeys.length} items failed after retries`);
}
```

### Performance Impact

Expected performance improvements:
- **Latency Reduction**: 50-70% for bulk operations (parallel execution)
- **Throughput**: 10-25x higher for batch operations vs sequential
- **Cost**: Same cost per item, but faster completion time

## 4. Existing Batch Operations

The following Lambda functions already use batch operations:

### delete-property.ts
- Uses `BatchWriteCommand` to delete multiple documents in batches of 25
- Implements retry logic for unprocessed items

### cleanup-deactivated-accounts.ts
- Uses `BatchWriteCommand` to delete documents and notifications in batches
- Processes large datasets efficiently

## 5. Query Optimization Best Practices

### Use Appropriate GSIs
- **Status filtering**: Use `userId-status-index` instead of fetching all and filtering
- **Processing status checks**: Use `propertyId-processingStatus-index` with KEYS_ONLY projection

### Leverage Caching
- **Immutable data**: Use longer TTL (10 minutes) for trust scores and lineage graphs
- **Frequently changing data**: Use shorter TTL (3-5 minutes) for properties and documents
- **Cache invalidation**: Invalidate cache on writes to ensure consistency

### Use Batch Operations
- **Bulk reads**: Use `batchGet` for fetching multiple items (e.g., all documents for a property)
- **Bulk writes**: Use `batchWrite` for creating/updating multiple items (e.g., bulk document status updates)
- **Parallel processing**: Batch operations execute in parallel for maximum throughput

### Projection Optimization
- **KEYS_ONLY**: Use for status checks where only keys are needed
- **INCLUDE**: Use when only specific attributes are needed
- **ALL**: Use when full items are needed (default)

## 6. Monitoring and Metrics

### Cache Metrics
Monitor cache performance using the built-in statistics:
```typescript
const stats = propertyCache.getStats();
console.log(`Cache hit rate: ${propertyCache.getHitRate() * 100}%`);
console.log(`Cache size: ${stats.size}`);
console.log(`Cache evictions: ${stats.evictions}`);
```

### DynamoDB Metrics
Monitor DynamoDB performance using CloudWatch:
- **Read Capacity Units (RCU)**: Should decrease with caching
- **Write Capacity Units (WCU)**: Should remain stable
- **Throttled Requests**: Should be zero with proper batching
- **Query Latency**: Should decrease with GSI optimization

### Expected Improvements

Based on the optimizations:
- **Query Latency**: 30-50% reduction for cached queries
- **DynamoDB Costs**: 20-40% reduction with caching and batch operations
- **API Response Time**: 40-60% improvement for list and detail endpoints
- **Throughput**: 5-10x improvement for bulk operations

## 7. Future Enhancements

### DynamoDB DAX (DynamoDB Accelerator)
For production at scale, consider adding DAX for:
- **Microsecond latency**: Sub-millisecond read latency
- **Automatic caching**: Managed cache layer
- **Cost**: ~$60/month for t3.small cluster (2 nodes)

### Read Replicas
For global deployments, consider:
- **Global Tables**: Multi-region replication
- **Read Replicas**: Regional read endpoints

### Query Optimization
- **Composite sort keys**: Combine multiple attributes in sort key for complex queries
- **Sparse indexes**: Create GSIs with conditional writes for specific use cases

## 8. Testing

### Cache Testing
Test cache behavior:
```typescript
// Test cache hit
const result1 = await handler(event);
const result2 = await handler(event);
expect(result2.headers['X-Cache']).toBe('HIT');

// Test cache invalidation
propertyCache.invalidate(cacheKey);
const result3 = await handler(event);
expect(result3.headers['X-Cache']).toBe('MISS');
```

### Batch Operations Testing
Test batch operations:
```typescript
// Test batch get
const result = await batchOps.batchGet({
  tableName: 'SatyaMool-Documents',
  keys: Array.from({ length: 250 }, (_, i) => ({ documentId: `doc-${i}` })),
});
expect(result.items.length).toBe(250);

// Test batch write
const result = await batchOps.batchWrite({
  tableName: 'SatyaMool-Documents',
  items: Array.from({ length: 100 }, (_, i) => ({ documentId: `doc-${i}`, status: 'processed' })),
  operation: 'put',
});
expect(result.errors).toBeUndefined();
```

## 9. Rollout Plan

### Phase 1: Infrastructure (Completed)
- ✅ Add new GSIs to DynamoDB tables
- ✅ Deploy infrastructure changes

### Phase 2: Caching (In Progress)
- ✅ Implement caching utility
- ✅ Add caching to list-properties Lambda
- ✅ Add caching to get-trust-score Lambda
- ⏳ Add caching to get-property Lambda
- ⏳ Add caching to get-lineage Lambda

### Phase 3: Batch Operations (In Progress)
- ✅ Implement batch operations utility
- ⏳ Refactor existing batch operations to use utility
- ⏳ Add batch operations to new Lambda functions

### Phase 4: Monitoring
- ⏳ Add CloudWatch metrics for cache hit rate
- ⏳ Add CloudWatch alarms for cache performance
- ⏳ Create dashboard for query performance

### Phase 5: Optimization
- ⏳ Analyze query patterns and adjust cache TTLs
- ⏳ Optimize GSI projections based on usage
- ⏳ Consider DAX for production deployment

## 10. References

- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [DynamoDB GSI Design](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html)
- [DynamoDB Batch Operations](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html#WorkingWithItems.BatchOperations)
- [AWS Well-Architected Framework - Performance Efficiency](https://docs.aws.amazon.com/wellarchitected/latest/performance-efficiency-pillar/welcome.html)
