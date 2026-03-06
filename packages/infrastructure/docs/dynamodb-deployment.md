# DynamoDB Tables Deployment Guide

This document describes the DynamoDB tables deployed by the SatyaMool CDK stack, their configuration, and operational considerations.

## Overview

SatyaMool uses 7 DynamoDB tables to store application data:

1. **Users** - User account information
2. **Properties** - Property verification records
3. **Documents** - Document metadata and processing status
4. **Lineage** - Ownership lineage graphs
5. **TrustScores** - Trust score calculations
6. **Notifications** - In-app notifications
7. **AuditLogs** - Audit trail for compliance

## Table Specifications

### 1. Users Table

**Table Name**: `SatyaMool-Users`

**Purpose**: Store user account information

**Schema**:
- **Partition Key**: `userId` (String) - UUID
- **Attributes**:
  - `email` (String) - User email address
  - `phoneNumber` (String) - User phone number
  - `role` (String) - User role (Standard_User, Professional_User, Admin_User)
  - `createdAt` (String) - ISO 8601 timestamp
  - `lastLogin` (String) - ISO 8601 timestamp
  - `status` (String) - Account status (active, deactivated)
  - `deactivatedAt` (String) - ISO 8601 timestamp (if deactivated)

**Indexes**: None

**Configuration**:
- Billing Mode: PAY_PER_REQUEST (on-demand)
- Point-in-Time Recovery: Enabled (staging/prod), Disabled (dev)
- Encryption: AWS managed keys
- Streams: Disabled

**Access Patterns**:
- Get user by userId
- Update user profile
- List all users (admin only)

### 2. Properties Table

**Table Name**: `SatyaMool-Properties`

**Purpose**: Store property verification records

**Schema**:
- **Partition Key**: `propertyId` (String) - UUID
- **Attributes**:
  - `userId` (String) - Owner user ID
  - `address` (String) - Property address
  - `surveyNumber` (String) - Government survey number
  - `status` (String) - Processing status (pending, processing, completed, failed)
  - `trustScore` (Number) - Calculated trust score (0-100)
  - `createdAt` (String) - ISO 8601 timestamp
  - `updatedAt` (String) - ISO 8601 timestamp
  - `completedAt` (String) - ISO 8601 timestamp (if completed)

**Indexes**:
- **GSI**: `userId-createdAt-index`
  - Partition Key: `userId`
  - Sort Key: `createdAt`
  - Projection: ALL

**Configuration**:
- Billing Mode: PAY_PER_REQUEST
- Point-in-Time Recovery: Enabled (staging/prod), Disabled (dev)
- Encryption: AWS managed keys
- Streams: NEW_AND_OLD_IMAGES (for notifications)

**Access Patterns**:
- Get property by propertyId
- List properties by userId (sorted by creation date)
- Update property status
- Delete property

### 3. Documents Table

**Table Name**: `SatyaMool-Documents`

**Purpose**: Store document metadata and processing status

**Schema**:
- **Partition Key**: `documentId` (String) - UUID
- **Sort Key**: `propertyId` (String) - UUID
- **Attributes**:
  - `s3Key` (String) - S3 object key
  - `documentType` (String) - Document type (sale_deed, mother_deed, encumbrance_certificate)
  - `uploadedAt` (String) - ISO 8601 timestamp
  - `processingStatus` (String) - Status (pending, ocr_complete, translation_complete, analysis_complete, failed)
  - `ocrText` (String) - Raw OCR output
  - `ocrConfidence` (Number) - OCR confidence score (0-100)
  - `translatedText` (String) - Translated text (English)
  - `originalLanguage` (String) - Detected language
  - `extractedData` (Map) - Structured extracted data
  - `errorMessage` (String) - Error details (if failed)

**Indexes**:
- **GSI**: `propertyId-uploadedAt-index`
  - Partition Key: `propertyId`
  - Sort Key: `uploadedAt`
  - Projection: ALL

**Configuration**:
- Billing Mode: PAY_PER_REQUEST
- Point-in-Time Recovery: Enabled (staging/prod), Disabled (dev)
- Encryption: AWS managed keys
- Streams: NEW_AND_OLD_IMAGES (for processing pipeline and notifications)

**Access Patterns**:
- Get document by documentId
- List documents by propertyId (sorted by upload date)
- Update document processing status
- Query documents by processing status

### 4. Lineage Table

**Table Name**: `SatyaMool-Lineage`

**Purpose**: Store ownership lineage graphs

**Schema**:
- **Partition Key**: `propertyId` (String) - UUID
- **Attributes**:
  - `nodes` (List) - Array of owner nodes
  - `edges` (List) - Array of transfer edges
  - `graphData` (Map) - Complete graph data structure
  - `motherDeedId` (String) - Document ID of mother deed
  - `currentOwnerId` (String) - Current owner node ID
  - `gaps` (List) - Array of detected gaps
  - `calculatedAt` (String) - ISO 8601 timestamp

**Indexes**: None

**Configuration**:
- Billing Mode: PAY_PER_REQUEST
- Point-in-Time Recovery: Enabled (staging/prod), Disabled (dev)
- Encryption: AWS managed keys
- Streams: Disabled

**Access Patterns**:
- Get lineage by propertyId
- Update lineage graph

### 5. TrustScores Table

**Table Name**: `SatyaMool-TrustScores`

**Purpose**: Store trust score calculations

**Schema**:
- **Partition Key**: `propertyId` (String) - UUID
- **Attributes**:
  - `totalScore` (Number) - Final trust score (0-100)
  - `scoreBreakdown` (Map) - Component scores
    - `baseScore` (Number)
    - `gapPenalty` (Number)
    - `inconsistencyPenalty` (Number)
    - `surveyNumberMismatchPenalty` (Number)
    - `ecBonus` (Number)
    - `recencyBonus` (Number)
    - `successionBonus` (Number)
  - `factors` (List) - Array of score factors with explanations
  - `calculatedAt` (String) - ISO 8601 timestamp

**Indexes**: None

**Configuration**:
- Billing Mode: PAY_PER_REQUEST
- Point-in-Time Recovery: Enabled (staging/prod), Disabled (dev)
- Encryption: AWS managed keys
- Streams: Disabled

**Access Patterns**:
- Get trust score by propertyId
- Update trust score

### 6. Notifications Table

**Table Name**: `SatyaMool-Notifications`

**Purpose**: Store in-app notifications

**Schema**:
- **Partition Key**: `notificationId` (String) - UUID
- **Sort Key**: `userId` (String) - UUID
- **Attributes**:
  - `type` (String) - Notification type (processing_complete, processing_failed, quality_warning)
  - `title` (String) - Notification title
  - `message` (String) - Notification message
  - `propertyId` (String) - Related property ID
  - `documentId` (String) - Related document ID (optional)
  - `read` (Boolean) - Read status
  - `createdAt` (String) - ISO 8601 timestamp
  - `readAt` (String) - ISO 8601 timestamp (if read)

**Indexes**:
- **GSI**: `userId-createdAt-index`
  - Partition Key: `userId`
  - Sort Key: `createdAt`
  - Projection: ALL

**Configuration**:
- Billing Mode: PAY_PER_REQUEST
- Point-in-Time Recovery: Enabled (staging/prod), Disabled (dev)
- Encryption: AWS managed keys
- Streams: Disabled

**Access Patterns**:
- Get notification by notificationId
- List notifications by userId (sorted by creation date)
- Mark notification as read
- Count unread notifications by userId

### 7. AuditLogs Table

**Table Name**: `SatyaMool-AuditLogs`

**Purpose**: Store audit trail for compliance

**Schema**:
- **Partition Key**: `logId` (String) - UUID
- **Sort Key**: `timestamp` (String) - ISO 8601 timestamp
- **Attributes**:
  - `userId` (String) - User who performed action
  - `action` (String) - Action performed (login, upload, delete, role_change)
  - `resourceType` (String) - Resource type (user, property, document)
  - `resourceId` (String) - Resource ID
  - `ipAddress` (String) - Client IP address
  - `userAgent` (String) - Client user agent
  - `requestId` (String) - Request ID for traceability
  - `details` (Map) - Additional details

**Indexes**:
- **GSI**: `userId-timestamp-index`
  - Partition Key: `userId`
  - Sort Key: `timestamp`
  - Projection: ALL

**Configuration**:
- Billing Mode: PAY_PER_REQUEST
- Point-in-Time Recovery: Enabled (all environments)
- Encryption: AWS managed keys
- Streams: Disabled

**Access Patterns**:
- Get audit log by logId
- List audit logs by userId (sorted by timestamp)
- Query audit logs by action type
- Export audit logs for compliance

## Deployment Configuration

### Environment-Specific Settings

#### Development
- Billing Mode: PAY_PER_REQUEST
- Point-in-Time Recovery: Disabled (to save costs)
- Removal Policy: DESTROY (allows deletion)
- Auto-Scaling: Not applicable (on-demand mode)

#### Staging
- Billing Mode: PAY_PER_REQUEST
- Point-in-Time Recovery: Enabled
- Removal Policy: RETAIN (prevents accidental deletion)
- Auto-Scaling: Not applicable (on-demand mode)

#### Production
- Billing Mode: PAY_PER_REQUEST (switch to PROVISIONED if workload is predictable)
- Point-in-Time Recovery: Enabled (required)
- Removal Policy: RETAIN (required)
- Auto-Scaling: Configure if using PROVISIONED mode

### Backup Configuration

**Point-in-Time Recovery (PITR)**:
- Enabled for staging and production
- Allows restore to any point in the last 35 days
- Continuous backups with no performance impact

**On-Demand Backups**:
```bash
# Create on-demand backup
aws dynamodb create-backup \
  --table-name SatyaMool-Properties \
  --backup-name SatyaMool-Properties-Backup-$(date +%Y%m%d)

# List backups
aws dynamodb list-backups --table-name SatyaMool-Properties

# Restore from backup
aws dynamodb restore-table-from-backup \
  --target-table-name SatyaMool-Properties-Restored \
  --backup-arn arn:aws:dynamodb:us-east-1:123456789012:table/SatyaMool-Properties/backup/01234567890123-abcdefgh
```

## Monitoring and Alarms

### CloudWatch Metrics

Monitor the following metrics for each table:

1. **ConsumedReadCapacityUnits** - Read capacity consumption
2. **ConsumedWriteCapacityUnits** - Write capacity consumption
3. **UserErrors** - Client-side errors (4xx)
4. **SystemErrors** - Server-side errors (5xx)
5. **ThrottledRequests** - Throttled requests (if any)

### Recommended Alarms

```bash
# Alarm for high error rate
aws cloudwatch put-metric-alarm \
  --alarm-name SatyaMool-DynamoDB-UserErrors \
  --alarm-description "Alert when DynamoDB user errors exceed threshold" \
  --metric-name UserErrors \
  --namespace AWS/DynamoDB \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=TableName,Value=SatyaMool-Properties
```

## Performance Optimization

### On-Demand vs Provisioned Capacity

**Use On-Demand When**:
- Workload is unpredictable
- Traffic has large spikes
- Starting a new application (MVP phase)

**Switch to Provisioned When**:
- Workload is predictable and consistent
- Can forecast capacity requirements
- Want to optimize costs (can save up to 70%)

### Query Optimization

**Best Practices**:
1. Use partition key in all queries
2. Use sort key for range queries
3. Use GSIs for alternate access patterns
4. Avoid scans (use queries instead)
5. Use projection expressions to fetch only needed attributes
6. Use batch operations for bulk reads/writes

**Example Optimized Query**:
```javascript
// Good: Query with partition key and sort key
const params = {
  TableName: 'SatyaMool-Properties',
  IndexName: 'userId-createdAt-index',
  KeyConditionExpression: 'userId = :userId AND createdAt > :date',
  ExpressionAttributeValues: {
    ':userId': userId,
    ':date': '2024-01-01T00:00:00Z'
  },
  ProjectionExpression: 'propertyId, address, trustScore, status'
};

// Bad: Scan entire table
const params = {
  TableName: 'SatyaMool-Properties',
  FilterExpression: 'userId = :userId',
  ExpressionAttributeValues: {
    ':userId': userId
  }
};
```

## Cost Optimization

### On-Demand Pricing

**Cost Structure**:
- $1.25 per million write request units
- $0.25 per million read request units
- Storage: $0.25 per GB-month

**Estimated Monthly Costs** (based on usage):
- **Dev**: $10-20 (minimal usage)
- **Staging**: $50-100 (moderate usage)
- **Prod**: $200-500 (depends on traffic)

### Cost Reduction Strategies

1. **Use Projection Expressions**: Fetch only needed attributes
2. **Batch Operations**: Use BatchGetItem and BatchWriteItem
3. **TTL for Temporary Data**: Auto-delete expired items
4. **Archive Old Data**: Move to S3 for long-term storage
5. **Switch to Provisioned**: If workload is predictable

## Disaster Recovery

### Recovery Point Objective (RPO)

- **PITR**: RPO of 5 minutes (continuous backups)
- **On-Demand Backups**: RPO depends on backup frequency

### Recovery Time Objective (RTO)

- **PITR Restore**: 10-30 minutes (depends on table size)
- **On-Demand Backup Restore**: 10-30 minutes

### Recovery Procedure

1. **Identify Restore Point**: Determine timestamp or backup to restore
2. **Create New Table**: Restore to new table (cannot overwrite existing)
3. **Verify Data**: Validate restored data integrity
4. **Update Application**: Point application to new table
5. **Delete Old Table**: After verification, delete old table

```bash
# Restore from PITR
aws dynamodb restore-table-to-point-in-time \
  --source-table-name SatyaMool-Properties \
  --target-table-name SatyaMool-Properties-Restored \
  --restore-date-time 2024-01-15T10:30:00Z

# Restore from backup
aws dynamodb restore-table-from-backup \
  --target-table-name SatyaMool-Properties-Restored \
  --backup-arn arn:aws:dynamodb:us-east-1:123456789012:table/SatyaMool-Properties/backup/01234567890123-abcdefgh
```

## Troubleshooting

### Common Issues

**Issue**: ProvisionedThroughputExceededException
```
Cause: Requests exceed provisioned capacity (only in PROVISIONED mode)
Solution: Enable auto-scaling or switch to on-demand mode
```

**Issue**: ValidationException
```
Cause: Invalid request parameters (wrong key types, missing required attributes)
Solution: Verify request parameters match table schema
```

**Issue**: ConditionalCheckFailedException
```
Cause: Conditional expression evaluated to false
Solution: Review condition expression logic, check item state
```

**Issue**: ItemCollectionSizeLimitExceededException
```
Cause: Item collection exceeds 10 GB limit (for tables with LSI)
Solution: Redesign data model to avoid large item collections
```

## Security Best Practices

1. **Encryption at Rest**: Use AWS managed keys or customer managed keys (KMS)
2. **Encryption in Transit**: Always use HTTPS for API calls
3. **IAM Policies**: Use least-privilege access policies
4. **VPC Endpoints**: Use VPC endpoints for private access
5. **Audit Logging**: Enable CloudTrail for API call logging
6. **Field-Level Encryption**: Encrypt sensitive fields in application code

## References

- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/)
- [DynamoDB Backup and Restore](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/BackupRestore.html)
- [DynamoDB Streams](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html)
