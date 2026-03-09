# Design Document: SatyaMool

## Overview

SatyaMool is built as a fully serverless, event-driven system on AWS, leveraging managed AI services for document processing. The architecture follows the KISS principle, avoiding complex orchestration frameworks in favor of simple Lambda functions coordinated through SQS queues and DynamoDB streams.

### Core Design Principles

1. **Serverless-First**: No EC2, no Kubernetes - pure Lambda, API Gateway, and managed services
2. **Event-Driven**: Asynchronous processing using SQS for decoupling and resilience
3. **Stateless Functions**: Each Lambda function is stateless, storing state in DynamoDB
4. **Idempotent Operations**: All processing functions handle duplicate messages gracefully
5. **Fail-Fast with Retry**: Quick failure detection with automatic retries and dead-letter queues
6. **Security by Default**: Encryption everywhere, least-privilege IAM, no public access

### Technology Stack

- **Frontend**: React 18 + Material-UI (MUI) + React Flow for graph visualization
- **API Layer**: AWS API Gateway (REST) with Lambda authorizers
- **Compute**: AWS Lambda (Node.js 20 for API, Python 3.12 for AI processing)
- **Authentication**: AWS Cognito User Pools with phone and email providers
- **Storage**: AWS S3 with KMS encryption, lifecycle policies
- **Database**: AWS DynamoDB with on-demand pricing, point-in-time recovery
- **Queues**: AWS SQS standard queues with dead-letter queues
- **AI Services**: Amazon Textract, Amazon Translate, Amazon Bedrock (Claude 3.5 Sonnet)
- **Monitoring**: CloudWatch Logs, Metrics, Alarms, X-Ray tracing
- **IaC**: AWS CDK (TypeScript) for infrastructure as code

## Architecture

### High-Level Architecture

```
┌─────────────┐
│   React UI  │
│  (CloudFront│
│   + S3)     │
└──────┬──────┘
       │ HTTPS
       ▼
┌─────────────────┐
│  API Gateway    │
│  (REST + Auth)  │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌──────────┐
│ Auth   │ │ Property │
│ Lambda │ │ Lambda   │
└────────┘ └─────┬────┘
                 │
         ┌───────┴────────┐
         ▼                ▼
    ┌─────────┐      ┌─────────┐
    │ Cognito │      │DynamoDB │
    └─────────┘      └────┬────┘
                          │
                          ▼
                     ┌─────────┐
                     │   S3    │
                     │(Presigned│
                     │  URLs)  │
                     └────┬────┘
                          │ S3 Event
                          ▼
                     ┌─────────┐
                     │   SQS   │
                     │ Queue   │
                     └────┬────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
    ┌────────┐      ┌──────────┐    ┌──────────┐
    │  OCR   │      │Translation│    │ Analysis │
    │ Lambda │      │  Lambda   │    │  Lambda  │
    │(Textract)     │(Translate)│    │(Bedrock) │
    └────┬───┘      └─────┬────┘    └─────┬────┘
         │                │               │
         └────────────────┼───────────────┘
                          ▼
                     ┌─────────┐
                     │DynamoDB │
                     │ Streams │
                     └────┬────┘
                          │
         ┌────────────────┴────────────────┐
         ▼                                  ▼
    ┌──────────┐                      ┌──────────┐
    │ Lineage  │                      │  Scoring │
    │  Lambda  │                      │  Lambda  │
    └──────────┘                      └──────────┘
```

### Processing Pipeline Flow

1. **Upload Phase**: User → API Gateway → Lambda generates presigned URL → User uploads to S3
2. **Trigger Phase**: S3 event → SQS message with document metadata
3. **OCR Phase**: Lambda polls SQS → Textract API → Raw text to DynamoDB
4. **Translation Phase**: DynamoDB Stream → Lambda → Translate API → English text to DynamoDB
5. **Analysis Phase**: DynamoDB Stream → Lambda → Bedrock API → Structured data to DynamoDB
6. **Lineage Phase**: DynamoDB Stream (all docs processed) → Lambda → Graph construction → DynamoDB
7. **Scoring Phase**: Lineage complete → Lambda → Trust score calculation → DynamoDB

### Scalability Design

- **API Gateway**: Handles 10,000 requests/second per region
- **Lambda Concurrency**: Reserved concurrency of 1000 for processing functions
- **SQS**: Standard queue with unlimited throughput, batch processing (10 messages/batch)
- **DynamoDB**: On-demand mode with auto-scaling, GSIs for query patterns
- **S3**: Unlimited storage, multipart upload for large files
- **Textract**: Async API for documents > 5 pages, sync for smaller docs
- **Bedrock**: Provisioned throughput for Claude 3.5 Sonnet (1000 tokens/sec)


## AWS Well-Architected Framework Optimizations

This section documents architectural improvements based on the AWS Well-Architected Framework's six pillars: Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization, and Sustainability.

### Cost Optimization

#### AI Services Cost Management

**Bedrock Inference Strategy:**
- **MVP/Development**: Use on-demand inference (pay per token)
- **Production at Scale**: Evaluate provisioned throughput only when consistent high volume (>1M tokens/day)
- **Cost Impact**: On-demand saves ~95% during development vs provisioned throughput
- **Implementation**: Configure Bedrock client with on-demand mode in CDK

**Textract Cost Controls:**
- Set CloudWatch billing alarm when Textract costs exceed $500/month
- Use `DetectDocumentText` API for simple documents (cheaper than `AnalyzeDocument`)
- Implement page limits: Reject documents > 50 pages to prevent abuse
- Cache OCR results in DynamoDB to avoid reprocessing

**DynamoDB Pricing Strategy:**
- Start with on-demand pricing for unpredictable workload
- Monitor usage for 2 weeks using CloudWatch metrics
- Switch to provisioned capacity if workload is predictable (can save up to 70%)
- Use DynamoDB auto-scaling for provisioned mode

**S3 Storage Optimization:**
- Use S3 Intelligent-Tiering for document storage (automatic cost optimization)
- Lifecycle policy: Move audit logs to Glacier after 90 days
- Enable S3 Storage Lens for usage analytics
- Delete incomplete multipart uploads after 7 days

```typescript
// CDK Example: S3 Lifecycle Policy
documentBucket.addLifecycleRule({
  id: 'IntelligentTieringForDocuments',
  transitions: [{
    storageClass: StorageClass.INTELLIGENT_TIERING,
    transitionAfter: Duration.days(0)
  }]
});

auditLogBucket.addLifecycleRule({
  id: 'ArchiveAuditLogs',
  transitions: [{
    storageClass: StorageClass.GLACIER,
    transitionAfter: Duration.days(90)
  }]
});
```

### Reliability

#### Circuit Breaker Pattern for AI Services

Implement circuit breaker for Bedrock API to prevent cascading failures:

```python
# Circuit Breaker Configuration
CIRCUIT_BREAKER_CONFIG = {
    "service": "Bedrock",
    "failure_threshold": 5,  # Open circuit after 5 consecutive failures
    "timeout": 30000,  # 30 second timeout per request
    "reset_timeout": 60000,  # Try to close circuit after 60 seconds
    "fallback": "queue_for_manual_review"  # Fallback action
}
```

**Implementation:**
- Use `pybreaker` library in Python Lambda functions
- When circuit opens, queue documents for manual review
- Send CloudWatch alarm to operations team
- Automatically retry when circuit closes

#### Idempotency for Critical Operations

Ensure all critical operations are idempotent to handle retries safely:

**Property Creation:**
- Use client-provided UUID as propertyId
- Check for existing property before creation
- Return existing property if duplicate request detected

**Document Upload:**
- Use content hash (SHA-256) as deduplication key
- Store hash in DynamoDB to detect duplicates
- Skip processing if document already exists

**Trust Score Calculation:**
- Use `propertyId + version` as idempotency key
- Store calculation timestamp to detect stale data
- Recalculate only if source data changed

#### Lambda Timeout Configuration

Set appropriate timeouts to prevent hung executions:

```typescript
// CDK Lambda Timeout Configuration
const timeouts = {
  ocrLambda: Duration.minutes(5),  // Textract async can take 3-4 minutes
  translationLambda: Duration.minutes(2),
  analysisLambda: Duration.minutes(3),  // Bedrock can be slow
  lineageLambda: Duration.minutes(1),
  scoringLambda: Duration.seconds(30)
};

// SQS Visibility Timeout = Max Lambda Timeout + Buffer
const sqsVisibilityTimeout = Duration.minutes(6);
```

#### Disaster Recovery Strategy

**Backup and Restore (RPO: 24 hours, RTO: 4 hours):**
- Enable DynamoDB point-in-time recovery (PITR) for all tables
- Enable S3 versioning for critical document buckets
- Store CDK infrastructure code in version control (GitHub)
- Enable S3 cross-region replication for disaster recovery
- Document runbook for region failover procedure

**Recovery Procedure:**
1. Deploy CDK stack in backup region
2. Restore DynamoDB tables from PITR backup
3. Replicate S3 data from primary region
4. Update DNS/CloudFront to point to backup region
5. Validate system functionality with smoke tests

### Security

#### Secrets Management

**AWS Secrets Manager Integration:**
- Store third-party API keys for future government portal integration
- Enable automatic 90-day rotation for secrets
- Use IAM policies to restrict secret access to specific Lambda functions
- Audit secret access via CloudTrail

```typescript
// CDK Example: Secrets Manager
const govPortalApiKey = new secretsmanager.Secret(this, 'GovPortalApiKey', {
  secretName: 'satyamool/gov-portal-api-key',
  description: 'API key for state government portal integration',
  generateSecretString: {
    secretStringTemplate: JSON.stringify({ username: 'api-user' }),
    generateStringKey: 'password',
    excludePunctuation: true,
    passwordLength: 32
  }
});

// Automatic rotation every 90 days
govPortalApiKey.addRotationSchedule('RotationSchedule', {
  automaticallyAfter: Duration.days(90)
});
```

#### Data Classification and Tagging

Tag S3 objects with sensitivity levels for compliance and access control:

**Classification Levels:**
- **Public**: Property reports (after user consent for sharing)
- **Confidential**: Property documents containing PII (default)
- **Restricted**: Audit logs and system metadata

```typescript
// CDK Example: S3 Object Tagging
documentBucket.addToResourcePolicy(new iam.PolicyStatement({
  effect: iam.Effect.Deny,
  principals: [new iam.AnyPrincipal()],
  actions: ['s3:GetObject'],
  resources: [`${documentBucket.bucketArn}/*`],
  conditions: {
    'StringEquals': {
      's3:ExistingObjectTag/Classification': 'Restricted'
    }
  }
}));
```

### Performance Efficiency

#### API Gateway Caching

Enable API Gateway caching for read-heavy endpoints:

```typescript
// CDK Example: API Gateway Cache
const api = new apigateway.RestApi(this, 'SatyaMoolApi', {
  deployOptions: {
    cachingEnabled: true,
    cacheClusterEnabled: true,
    cacheClusterSize: '0.5',  // 0.5 GB cache
    cacheTtl: Duration.seconds(300),  // 5 minutes
    cacheDataEncrypted: true
  }
});

// Cache configuration per endpoint
const propertiesResource = api.root.addResource('properties');
propertiesResource.addMethod('GET', propertiesIntegration, {
  methodResponses: [{
    statusCode: '200',
    responseParameters: {
      'method.response.header.Cache-Control': true
    }
  }]
});
```

**Cached Endpoints:**
- `GET /v1/properties` - User's property list (per user cache key)
- `GET /v1/properties/{id}/lineage` - Immutable after completion
- `GET /v1/properties/{id}/trust-score` - Immutable after calculation

#### DynamoDB DAX for Lineage Queries

Use DynamoDB Accelerator (DAX) for read-heavy lineage graph queries:

**Configuration:**
- Cluster size: t3.small (2 nodes for high availability)
- Cost: ~$60/month ($0.04/hour × 2 nodes × 730 hours)
- Benefit: Microsecond latency vs millisecond for DynamoDB
- Use case: Lineage graph queries (read-heavy, immutable data)

```typescript
// CDK Example: DAX Cluster
const daxCluster = new dax.CfnCluster(this, 'LineageCache', {
  clusterName: 'satyamool-lineage-cache',
  nodeType: 'dax.t3.small',
  replicationFactor: 2,
  iamRoleArn: daxRole.roleArn,
  subnetGroupName: daxSubnetGroup.ref,
  securityGroupIds: [daxSecurityGroup.securityGroupId]
});
```

#### Parallel Processing with Step Functions

Replace sequential processing with parallel execution:

**Current Flow (Sequential):**
OCR → Translation → Analysis (5-7 minutes total)

**Optimized Flow (Parallel):**
OCR → [Translation + Analysis in parallel] (3-4 minutes total)

**Benefit:** 40% faster processing time

```typescript
// Step Functions State Machine
const parallelProcessing = new sfn.Parallel(this, 'ParallelProcessing')
  .branch(translationTask)
  .branch(analysisTask);

const stateMachine = new sfn.StateMachine(this, 'DocumentProcessing', {
  definition: ocrTask
    .next(parallelProcessing)
    .next(lineageTask)
    .next(scoringTask)
});
```

#### Bedrock Batch Processing

Reduce Bedrock API calls by batching multiple documents:

**Strategy:**
- Accumulate 5-10 documents per property
- Send as single prompt with multiple document sections
- Parse structured output for all documents
- **Savings:** Reduce API calls by 80%

```python
# Batch Processing Example
def batch_analyze_documents(documents: List[Document]) -> List[AnalysisResult]:
    """Analyze multiple documents in a single Bedrock API call"""
    
    # Construct batch prompt
    batch_prompt = "Analyze the following property documents:\n\n"
    for i, doc in enumerate(documents):
        batch_prompt += f"Document {i+1}:\n{doc.text}\n\n"
    
    # Single Bedrock API call
    response = bedrock_client.invoke_model(
        modelId='anthropic.claude-3-5-sonnet-20241022',
        body=json.dumps({
            'prompt': batch_prompt,
            'max_tokens': 4096
        })
    )
    
    # Parse results for all documents
    return parse_batch_results(response)
```

#### Frontend Performance Optimization

**Large Graph Virtualization:**
- Implement virtualization for graphs with > 50 nodes
- Use `react-window` or `react-virtualized` for efficient rendering
- Lazy load document thumbnails on hover (not on initial render)

**Code Splitting:**
- Split React Flow bundle into separate chunk
- Load graph visualization library only when needed
- Reduce initial bundle size by 30%

```typescript
// React Code Splitting
const LineageGraph = React.lazy(() => import('./components/LineageGraph'));

function PropertyDetails() {
  return (
    <Suspense fallback={<CircularProgress />}>
      <LineageGraph propertyId={propertyId} />
    </Suspense>
  );
}
```

### Operational Excellence

#### Service Level Objectives (SLO)

Define measurable targets for system reliability:

**Availability:**
- Target: 99.9% uptime (43 minutes downtime per month)
- Measurement: CloudWatch Synthetics canary checks every 5 minutes
- Alerting: PagerDuty notification if availability drops below 99.5%

**Latency:**
- API P50: < 200ms
- API P99: < 2 seconds
- Processing time: < 10 minutes for 20 documents
- Measurement: CloudWatch Logs Insights queries, X-Ray traces

**Error Rate:**
- API calls: < 1% error rate
- Document processing: < 0.1% failure rate
- Measurement: CloudWatch metrics with alarms

#### Operational Runbooks

Document standard operating procedures for common issues:

1. **Lambda Function Timeout Troubleshooting**
   - Check CloudWatch Logs for timeout errors
   - Verify external API latency (Textract, Bedrock)
   - Increase Lambda timeout if legitimate
   - Implement circuit breaker if API is failing

2. **DynamoDB Throttling Response**
   - Check CloudWatch metrics for throttled requests
   - Enable DynamoDB auto-scaling if not already enabled
   - Increase provisioned capacity temporarily
   - Review access patterns for hot partitions

3. **Bedrock API Quota Exceeded**
   - Check Bedrock service quotas in AWS Console
   - Request quota increase via AWS Support
   - Implement request queuing with backoff
   - Enable circuit breaker to prevent cascading failures

4. **S3 Storage Quota Alert Response**
   - Review S3 Storage Lens for usage breakdown
   - Identify large objects or unused data
   - Implement lifecycle policies to archive old data
   - Request quota increase if legitimate growth

5. **Security Incident Response**
   - Isolate affected resources (disable API keys, revoke tokens)
   - Review CloudTrail logs for unauthorized access
   - Rotate compromised credentials immediately
   - Notify affected users per data breach policy
   - Document incident in post-mortem

### Sustainability

#### Energy-Efficient Compute

**Graviton2 Lambda (ARM64):**
- Use ARM64 architecture for all Lambda functions
- Benefits: 20% better performance, 20% lower cost, 20% less energy consumption
- Implementation: Set `architecture: lambda.Architecture.ARM_64` in CDK

```typescript
// CDK Example: Graviton2 Lambda
const ocrLambda = new lambda.Function(this, 'OcrFunction', {
  runtime: lambda.Runtime.PYTHON_3_12,
  architecture: lambda.Architecture.ARM_64,  // Use Graviton2
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/ocr'),
  memorySize: 512,  // Right-sized for workload
  timeout: Duration.minutes(5)
});
```

#### Right-Sized Lambda Memory

Optimize Lambda memory allocation to reduce energy consumption:

**Recommended Configuration:**
- API Lambdas: 256 MB (lightweight request handling)
- OCR Lambda: 512 MB (Textract API calls)
- Translation Lambda: 512 MB (Translate API calls)
- Analysis Lambda: 1024 MB (Bedrock API with large prompts)
- Lineage Lambda: 512 MB (graph construction)
- Scoring Lambda: 256 MB (simple calculations)

**Benefit:** Lower memory = lower energy consumption and cost

#### Storage Optimization

**S3 Intelligent-Tiering:**
- Automatically moves objects between access tiers based on usage
- Reduces storage costs and energy consumption
- No retrieval fees or lifecycle transition charges
- Optimal for unpredictable access patterns

## Implementation Priority

### Phase 1: MVP Launch (Immediate)
1. ✅ Change Bedrock to on-demand inference
2. ✅ Implement circuit breaker for Bedrock
3. ✅ Add idempotency keys to critical operations
4. ✅ Set Lambda timeouts appropriately
5. ✅ Configure S3 Intelligent-Tiering
6. ✅ Set up cost alerts (Textract > $500, Bedrock > $1000)

### Phase 2: Production Hardening (First Month)
7. ✅ Enable DynamoDB point-in-time recovery
8. ✅ Implement API Gateway caching
9. ✅ Add AWS Secrets Manager for API keys
10. ✅ Implement data classification tagging
11. ✅ Create operational runbooks
12. ✅ Set up SLO monitoring and alerting

### Phase 3: Scale Optimization (3 Months)
13. ✅ Analyze DynamoDB usage, switch to provisioned if beneficial
14. ✅ Implement DAX for lineage graph caching
15. ✅ Add Step Functions for parallel processing
16. ✅ Implement Bedrock batch processing
17. ✅ Optimize frontend with code splitting and virtualization
18. ✅ Enable cross-region replication for disaster recovery

