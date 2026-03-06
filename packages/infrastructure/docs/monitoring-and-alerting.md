# SatyaMool Monitoring and Alerting Guide

## Overview

This document describes the comprehensive monitoring and alerting infrastructure for the SatyaMool platform, implemented as part of Task 23.

## Architecture

The monitoring system consists of:
1. **CloudWatch Dashboards** - Visual monitoring of key metrics
2. **CloudWatch Alarms** - Automated alerting for critical thresholds
3. **SNS Topics** - Notification delivery to operations team
4. **X-Ray Tracing** - Distributed tracing for performance analysis
5. **Auto-Scaling** - Automatic resource scaling based on utilization

## CloudWatch Dashboards

### 1. API Metrics Dashboard

**Dashboard Name**: `SatyaMool-API-Metrics`

**Purpose**: Monitor API Gateway performance and health

**Widgets**:
- Request count by endpoint
- API latency (P50, P95, P99)
- Error rate by status code (4xx, 5xx)
- Throttled requests
- Integration latency

**Access**: AWS Console → CloudWatch → Dashboards → SatyaMool-API-Metrics

**Note**: This dashboard will be populated once API Gateway is deployed (Task 22).

### 2. Processing Pipeline Dashboard

**Dashboard Name**: `SatyaMool-Processing-Pipeline`

**Purpose**: Monitor document processing pipeline health and performance

**Widgets**:

#### SQS Queue Depth
- **Metrics**:
  - Messages Visible (waiting to be processed)
  - Messages In Flight (currently being processed)
  - DLQ Messages (failed after retries)
- **Alarm Threshold**: > 10,000 messages visible
- **Action**: Scale Lambda concurrency or investigate processing bottlenecks

#### Lambda Function Duration
- **Metrics**:
  - OCR Lambda average duration
  - Notification Lambda average duration
  - Cleanup Lambda average duration
- **Expected Values**:
  - OCR: 30-180 seconds (depends on document size)
  - Notification: < 5 seconds
  - Cleanup: 60-300 seconds (depends on data volume)

#### Lambda Function Errors
- **Metrics**:
  - OCR Lambda error count
  - Notification Lambda error count
  - Cleanup Lambda error count
- **Alarm Threshold**: Error rate > 1%
- **Action**: Investigate logs and X-Ray traces

#### Lambda Function Invocations
- **Metrics**:
  - OCR Lambda invocation count
  - Notification Lambda invocation count
  - Cleanup Lambda invocation count
- **Purpose**: Track processing volume and cost

**Access**: AWS Console → CloudWatch → Dashboards → SatyaMool-Processing-Pipeline

### 3. Cost Metrics Dashboard

**Dashboard Name**: `SatyaMool-Cost-Metrics`

**Purpose**: Track AWS service usage for cost optimization

**Widgets**:

#### Lambda Invocations (Cost Indicator)
- **Metrics**:
  - OCR Lambda invocations per hour
  - Notification Lambda invocations per hour
- **Purpose**: Estimate Lambda compute costs
- **Cost Formula**: Invocations × Duration × Memory × $0.0000166667 per GB-second

#### AI Services Usage (Custom Metrics)
These metrics must be published from Lambda functions:

**Textract Usage**:
- Metric: `SatyaMool/Textract/PagesProcessed`
- Namespace: `SatyaMool/AI`
- Alarm: > $500/month
- Cost: ~$1.50 per 1000 pages (FORMS + TABLES analysis)

**Bedrock Token Usage**:
- Metric: `SatyaMool/Bedrock/TokensUsed`
- Namespace: `SatyaMool/AI`
- Alarm: > $1000/month
- Cost: Claude 3.5 Sonnet pricing (input: $3/MTok, output: $15/MTok)

**Translation Usage**:
- Metric: `SatyaMool/Translate/CharactersTranslated`
- Namespace: `SatyaMool/AI`
- Cost: $15 per million characters

**Implementation**: Add custom metric publishing to Lambda functions:

```python
import boto3
cloudwatch = boto3.client('cloudwatch')

# Publish Textract usage
cloudwatch.put_metric_data(
    Namespace='SatyaMool/AI',
    MetricData=[{
        'MetricName': 'PagesProcessed',
        'Value': page_count,
        'Unit': 'Count',
        'Dimensions': [{'Name': 'Service', 'Value': 'Textract'}]
    }]
)
```

**Access**: AWS Console → CloudWatch → Dashboards → SatyaMool-Cost-Metrics

## CloudWatch Alarms

### 1. Queue Depth Alarm

**Alarm Name**: `SatyaMool-Queue-Depth-High`

**Description**: Alert when SQS queue depth exceeds 10,000 messages

**Configuration**:
- **Metric**: `ApproximateNumberOfMessagesVisible`
- **Threshold**: > 10,000
- **Evaluation Periods**: 2 consecutive periods (10 minutes)
- **Period**: 5 minutes
- **Statistic**: Average
- **Action**: SNS notification to operations team

**Response Actions**:
1. Check Lambda function errors in CloudWatch Logs
2. Review X-Ray traces for performance bottlenecks
3. Temporarily increase Lambda reserved concurrency
4. Investigate upstream issues (excessive uploads, API abuse)

### 2. OCR Lambda Error Rate Alarm

**Alarm Name**: `SatyaMool-OCR-Lambda-Error-Rate-High`

**Description**: Alert when OCR Lambda error rate exceeds 1%

**Configuration**:
- **Metric**: `(Errors / Invocations) * 100`
- **Threshold**: > 1%
- **Evaluation Periods**: 2 consecutive periods (10 minutes)
- **Period**: 5 minutes
- **Action**: SNS notification to operations team

**Response Actions**:
1. Check CloudWatch Logs for error details
2. Review X-Ray traces for Textract API failures
3. Check Textract service health status
4. Verify S3 bucket permissions and encryption keys
5. Review DLQ messages for patterns

### 3. Notification Lambda Error Rate Alarm

**Alarm Name**: `SatyaMool-Notification-Lambda-Error-Rate-High`

**Description**: Alert when Notification Lambda error rate exceeds 1%

**Configuration**:
- **Metric**: `(Errors / Invocations) * 100`
- **Threshold**: > 1%
- **Evaluation Periods**: 2 consecutive periods (10 minutes)
- **Period**: 5 minutes
- **Action**: SNS notification to operations team

**Response Actions**:
1. Check CloudWatch Logs for error details
2. Verify SES email sending permissions
3. Check DynamoDB table availability
4. Review DynamoDB Streams configuration
5. Verify user email addresses are valid

### 4. S3 Storage Quota Alarm

**Alarm Name**: `SatyaMool-S3-Storage-High` (Manual Configuration Required)

**Description**: Alert when S3 storage exceeds 80% of allocated quota

**Configuration Options**:

**Option A: AWS Budgets**
1. Navigate to AWS Budgets Console
2. Create a new budget for S3 storage
3. Set threshold at 80% of quota
4. Configure SNS notification

**Option B: Custom CloudWatch Metric**
1. Create Lambda function to publish S3 bucket size metric
2. Schedule Lambda to run daily via EventBridge
3. Create CloudWatch alarm on custom metric

**Response Actions**:
1. Review S3 lifecycle policies
2. Identify large or unused objects
3. Archive old documents to Glacier
4. Request quota increase if legitimate growth

## SNS Topic Configuration

### Alarm Notification Topic

**Topic Name**: `SatyaMool-Alarm-Notifications`

**ARN**: Available in CloudFormation outputs as `AlarmTopicArn`

**Subscriptions**: Configure email subscriptions for operations team

```bash
# Add email subscription via AWS CLI
aws sns subscribe \
  --topic-arn arn:aws:sns:REGION:ACCOUNT:SatyaMool-Alarm-Notifications \
  --protocol email \
  --notification-endpoint ops@satyamool.com
```

**Notification Format**:
```json
{
  "AlarmName": "SatyaMool-Queue-Depth-High",
  "AlarmDescription": "Alert when SQS queue depth exceeds 10,000 messages",
  "NewStateValue": "ALARM",
  "NewStateReason": "Threshold Crossed: 2 datapoints [12543.0, 11234.0] were greater than the threshold (10000.0)",
  "StateChangeTime": "2024-01-15T10:30:00.000Z",
  "Region": "us-east-1",
  "AlarmArn": "arn:aws:cloudwatch:us-east-1:123456789012:alarm:SatyaMool-Queue-Depth-High"
}
```

## Auto-Scaling Configuration

### DynamoDB Auto-Scaling

**Current Configuration**: All DynamoDB tables use `PAY_PER_REQUEST` (on-demand) billing mode

**Auto-Scaling**: Not applicable for on-demand mode (AWS automatically scales)

**Switching to Provisioned Mode** (for cost optimization at scale):

1. Monitor usage for 2 weeks using CloudWatch metrics
2. Calculate average and peak read/write capacity units
3. Switch to `PROVISIONED` mode if workload is predictable
4. Configure auto-scaling:

```typescript
// Example: Enable auto-scaling for Users table
const readScaling = usersTable.autoScaleReadCapacity({
  minCapacity: 5,
  maxCapacity: 100
});

readScaling.scaleOnUtilization({
  targetUtilizationPercent: 70
});

const writeScaling = usersTable.autoScaleWriteCapacity({
  minCapacity: 5,
  maxCapacity: 100
});

writeScaling.scaleOnUtilization({
  targetUtilizationPercent: 70
});
```

**Cost Comparison**:
- **On-Demand**: $1.25 per million write requests, $0.25 per million read requests
- **Provisioned**: $0.00065 per WCU-hour, $0.00013 per RCU-hour (can save up to 70% at scale)

### Lambda Reserved Concurrency

**Current Configuration**:
- **OCR Lambda**: 100 reserved concurrent executions
- **Notification Lambda**: 50 reserved concurrent executions
- **Cleanup Lambda**: 1 reserved concurrent execution

**Auto-Scaling**: Lambda automatically scales within reserved concurrency limits

**Monitoring**:
- Track `ConcurrentExecutions` metric in CloudWatch
- Alert if consistently hitting reserved concurrency limit
- Increase reserved concurrency if needed

**Cost Impact**:
- Reserved concurrency is free
- Only pay for actual execution time and memory

## X-Ray Distributed Tracing

### Configuration

**Tracing Mode**: Active (enabled for all Lambda functions)

**Lambda Functions with X-Ray**:
- OCR Lambda (`SatyaMool-OCR`)
- Notification Lambda (`SatyaMool-Notification`)
- Cleanup Lambda (`SatyaMool-Cleanup`)

**Custom Segments**:
- Textract API calls (sync and async)
- Translate API calls (when implemented)
- Bedrock API calls (when implemented)
- DynamoDB operations (automatic via SDK instrumentation)
- S3 operations (automatic via SDK instrumentation)

### Viewing Traces

**AWS Console**:
1. Navigate to AWS X-Ray Console
2. Select "Service Map" to view system architecture
3. Select "Traces" to view individual request traces
4. Filter by:
   - Service name (e.g., `SatyaMool-OCR`)
   - HTTP status code
   - Response time
   - Error status

**Example Trace Analysis**:
```
Request: Process document abc123
├─ Lambda: SatyaMool-OCR (180s)
│  ├─ S3: GetObject (0.5s)
│  ├─ Textract: AnalyzeDocument (150s) ← Bottleneck
│  ├─ DynamoDB: UpdateItem (0.2s)
│  └─ DynamoDB: UpdateItem (0.2s)
└─ Total: 180.9s
```

### Sampling Rules

**Default Sampling**: 5% of requests + 1 request per second

**Custom Sampling**: See [xray-sampling-rules.md](./xray-sampling-rules.md) for detailed configuration

**Cost Optimization**:
- Trace critical paths at higher rates (10-100%)
- Trace non-critical paths at lower rates (1-5%)
- Always trace errors (100%)

### X-Ray Insights

**Anomaly Detection**: X-Ray automatically detects:
- Increased error rates
- Increased latency
- Unusual traffic patterns

**Notifications**: Configure SNS notifications for X-Ray Insights alerts

## Monitoring Best Practices

### 1. Regular Dashboard Review

**Daily**:
- Check Processing Pipeline dashboard for queue depth and errors
- Review Lambda error rates and duration

**Weekly**:
- Review Cost Metrics dashboard
- Analyze X-Ray traces for performance optimization opportunities
- Check alarm history for patterns

**Monthly**:
- Review and optimize CloudWatch Logs retention
- Analyze cost trends and optimize sampling rules
- Update alarm thresholds based on traffic patterns

### 2. Log Analysis

**CloudWatch Logs Insights Queries**:

**Find OCR errors**:
```sql
fields @timestamp, @message
| filter @message like /ERROR/
| filter @message like /OCR/
| sort @timestamp desc
| limit 100
```

**Calculate average processing time**:
```sql
fields @timestamp, @duration
| filter @type = "REPORT"
| stats avg(@duration) as avg_duration, 
        max(@duration) as max_duration,
        min(@duration) as min_duration
by bin(5m)
```

**Find low-confidence OCR results**:
```sql
fields @timestamp, @message
| filter @message like /low average confidence/
| parse @message /confidence: (?<confidence>[\d.]+)%/
| filter confidence < 70
| sort @timestamp desc
```

### 3. Cost Optimization

**Monitor and Optimize**:
1. Review Lambda memory allocation (right-size for workload)
2. Optimize Lambda execution time (reduce cold starts)
3. Use S3 Intelligent-Tiering for automatic cost optimization
4. Archive old CloudWatch Logs to S3
5. Implement X-Ray sampling rules to reduce trace costs
6. Switch DynamoDB to provisioned mode if workload is predictable

**Cost Alerts**:
- Set up AWS Budgets for monthly cost thresholds
- Configure billing alarms for unexpected cost increases
- Review AWS Cost Explorer monthly for cost trends

### 4. Incident Response

**Alarm Response Workflow**:
1. Acknowledge alarm notification
2. Check CloudWatch dashboard for context
3. Review CloudWatch Logs for error details
4. Analyze X-Ray traces for root cause
5. Implement fix or mitigation
6. Monitor metrics to confirm resolution
7. Document incident and lessons learned

**Escalation Path**:
1. On-call engineer (immediate response)
2. Team lead (if unresolved after 30 minutes)
3. Platform architect (if system-wide issue)

## Deployment

### Initial Deployment

```bash
# Deploy infrastructure with monitoring
cd packages/infrastructure
npm install
cdk deploy

# Configure SNS email subscription
aws sns subscribe \
  --topic-arn $(aws cloudformation describe-stacks \
    --stack-name SatyaMoolStack \
    --query 'Stacks[0].Outputs[?OutputKey==`AlarmTopicArn`].OutputValue' \
    --output text) \
  --protocol email \
  --notification-endpoint ops@satyamool.com

# Confirm email subscription (check inbox)
```

### Verification

```bash
# Verify dashboards are created
aws cloudwatch list-dashboards

# Verify alarms are configured
aws cloudwatch describe-alarms \
  --alarm-name-prefix SatyaMool

# Verify X-Ray tracing is enabled
aws lambda get-function-configuration \
  --function-name SatyaMool-OCR-Processor \
  --query 'TracingConfig'
```

## Troubleshooting

### Dashboard Not Showing Data

**Symptoms**: Dashboard widgets show "No data available"

**Causes**:
1. Lambda functions haven't been invoked yet
2. Metrics haven't been published yet (5-minute delay)
3. Incorrect metric namespace or dimensions

**Resolution**:
1. Trigger a test document upload
2. Wait 5-10 minutes for metrics to appear
3. Verify Lambda function names match dashboard configuration

### Alarms Not Triggering

**Symptoms**: Alarm stays in "Insufficient Data" state

**Causes**:
1. No data points for the metric
2. Incorrect metric configuration
3. Evaluation period too short

**Resolution**:
1. Verify Lambda functions are being invoked
2. Check alarm metric configuration
3. Increase evaluation period if needed

### X-Ray Traces Not Appearing

**Symptoms**: No traces in X-Ray console

**Causes**:
1. X-Ray tracing not enabled on Lambda
2. X-Ray SDK not installed in Lambda package
3. IAM permissions missing for X-Ray

**Resolution**:
1. Verify `tracing: lambda.Tracing.ACTIVE` in CDK
2. Verify `aws-xray-sdk` in requirements.txt
3. Check Lambda execution role has X-Ray permissions

## References

- [AWS CloudWatch Documentation](https://docs.aws.amazon.com/cloudwatch/)
- [AWS X-Ray Documentation](https://docs.aws.amazon.com/xray/)
- [AWS Lambda Monitoring](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-functions.html)
- [DynamoDB Auto-Scaling](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/AutoScaling.html)
- [X-Ray Sampling Rules](./xray-sampling-rules.md)
