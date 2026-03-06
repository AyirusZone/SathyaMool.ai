# X-Ray Trace Sampling Rules Configuration

## Overview

This document describes the X-Ray trace sampling rules for the SatyaMool platform. Sampling rules control which requests are traced to optimize costs while maintaining visibility into system behavior.

## Default Sampling Strategy

AWS X-Ray uses a default sampling strategy:
- **Reservoir**: 1 request per second (always traced)
- **Fixed Rate**: 5% of additional requests

This provides a good balance between cost and visibility for most workloads.

## Custom Sampling Rules (Task 23.4)

For production environments, consider implementing custom sampling rules to optimize costs:

### High-Priority Traces (100% sampling)
- API Gateway errors (5xx responses)
- Lambda function errors
- Requests with custom header `X-Trace-Priority: high`

### Standard Traces (10% sampling)
- OCR processing pipeline
- Document analysis workflows
- Notification processing

### Low-Priority Traces (1% sampling)
- Health check endpoints
- Static asset requests
- Successful authentication requests

## Configuring Sampling Rules

### Via AWS Console

1. Navigate to AWS X-Ray Console
2. Go to "Sampling" section
3. Create custom sampling rules with the following structure:

```json
{
  "version": 2,
  "rules": [
    {
      "description": "High priority - API errors",
      "host": "*",
      "http_method": "*",
      "url_path": "/v1/*",
      "fixed_target": 1,
      "rate": 1.0,
      "attributes": {
        "http.status": "5*"
      }
    },
    {
      "description": "Standard - OCR processing",
      "host": "*",
      "http_method": "*",
      "url_path": "*",
      "fixed_target": 1,
      "rate": 0.1,
      "service_name": "SatyaMool-OCR"
    },
    {
      "description": "Low priority - health checks",
      "host": "*",
      "http_method": "GET",
      "url_path": "/health",
      "fixed_target": 0,
      "rate": 0.01
    }
  ],
  "default": {
    "fixed_target": 1,
    "rate": 0.05
  }
}
```

### Via AWS CDK

To configure sampling rules via CDK, use the `CfnSamplingRule` construct:

```typescript
import * as xray from 'aws-cdk-lib/aws-xray';

// High priority sampling for errors
new xray.CfnSamplingRule(this, 'HighPrioritySamplingRule', {
  ruleName: 'SatyaMool-High-Priority-Errors',
  priority: 1000,
  version: 1,
  reservoirSize: 1,
  fixedRate: 1.0,
  urlPath: '/v1/*',
  host: '*',
  httpMethod: '*',
  serviceName: '*',
  serviceType: '*',
  resourceArn: '*',
  attributes: {
    'http.status': '5*'
  }
});

// Standard sampling for OCR processing
new xray.CfnSamplingRule(this, 'StandardOcrSamplingRule', {
  ruleName: 'SatyaMool-Standard-OCR',
  priority: 5000,
  version: 1,
  reservoirSize: 1,
  fixedRate: 0.1,
  urlPath: '*',
  host: '*',
  httpMethod: '*',
  serviceName: 'SatyaMool-OCR',
  serviceType: '*',
  resourceArn: '*'
});

// Low priority sampling for health checks
new xray.CfnSamplingRule(this, 'LowPriorityHealthSamplingRule', {
  ruleName: 'SatyaMool-Low-Priority-Health',
  priority: 9000,
  version: 1,
  reservoirSize: 0,
  fixedRate: 0.01,
  urlPath: '/health',
  host: '*',
  httpMethod: 'GET',
  serviceName: '*',
  serviceType: '*',
  resourceArn: '*'
});
```

## Cost Optimization

### Estimated Costs

X-Ray pricing (as of 2024):
- **Traces recorded**: $5.00 per 1 million traces
- **Traces retrieved**: $0.50 per 1 million traces
- **Traces scanned**: $0.50 per 1 million traces

### Example Cost Calculation

For a system processing 1 million requests per month:

**Default Sampling (5%)**:
- Traces recorded: 50,000
- Cost: $0.25/month

**Custom Sampling (10% for critical paths, 1% for others)**:
- Critical paths (20% of traffic): 200,000 × 10% = 20,000 traces
- Other paths (80% of traffic): 800,000 × 1% = 8,000 traces
- Total traces: 28,000
- Cost: $0.14/month

**Savings**: 44% cost reduction with targeted sampling

## Monitoring Sampling Effectiveness

Use CloudWatch Insights to analyze trace coverage:

```sql
fields @timestamp, @message
| filter @type = "REPORT"
| stats count() as total_invocations,
        sum(xray_trace_id != "") as traced_invocations
| eval trace_percentage = (traced_invocations / total_invocations) * 100
```

## Best Practices

1. **Start with default sampling** in development/staging environments
2. **Implement custom rules** in production after understanding traffic patterns
3. **Always trace errors** (100% sampling for 5xx responses)
4. **Use reservoir size** to ensure at least 1 request per second is traced
5. **Monitor sampling costs** using AWS Cost Explorer
6. **Review sampling rules quarterly** to optimize based on usage patterns

## Custom Segments in Lambda Functions

The OCR Lambda function includes custom X-Ray segments for external API calls:

```python
from aws_xray_sdk.core import xray_recorder

# Textract API call with custom segment
with xray_recorder.capture('textract_analyze_document') as segment:
    segment.put_metadata('bucket', bucket_name)
    segment.put_metadata('key', object_key)
    segment.put_annotation('api_type', 'sync')
    
    response = textract_client.analyze_document(...)
    
    segment.put_metadata('page_count', page_count)
    segment.put_metadata('block_count', block_count)
```

This provides detailed visibility into:
- Textract API latency
- Document processing metrics
- Error rates by API type (sync vs async)

## References

- [AWS X-Ray Developer Guide](https://docs.aws.amazon.com/xray/latest/devguide/)
- [X-Ray Sampling Rules](https://docs.aws.amazon.com/xray/latest/devguide/xray-console-sampling.html)
- [X-Ray Pricing](https://aws.amazon.com/xray/pricing/)
