# VPC Endpoints Configuration

## Overview

SatyaMool uses VPC endpoints to enable Lambda functions to access AWS services privately without requiring an internet gateway or NAT gateway. This improves security and reduces costs.

## Architecture

### Network Design

```
┌─────────────────────────────────────────────────────────────┐
│                        VPC (10.0.0.0/16)                     │
│                                                               │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │  Private Subnet  │         │  Private Subnet  │          │
│  │   (AZ-1)         │         │   (AZ-2)         │          │
│  │  10.0.0.0/24     │         │  10.0.1.0/24     │          │
│  │                  │         │                  │          │
│  │  ┌────────────┐  │         │  ┌────────────┐  │          │
│  │  │  Lambda    │  │         │  │  Lambda    │  │          │
│  │  │ Functions  │  │         │  │ Functions  │  │          │
│  │  └────────────┘  │         │  └────────────┘  │          │
│  │        │         │         │        │         │          │
│  └────────┼─────────┘         └────────┼─────────┘          │
│           │                            │                     │
│           └────────────┬───────────────┘                     │
│                        │                                     │
│           ┌────────────▼────────────┐                        │
│           │    VPC Endpoints        │                        │
│           │  ┌──────────────────┐   │                        │
│           │  │ S3 (Gateway)     │   │                        │
│           │  │ DynamoDB (Gateway)│  │                        │
│           │  │ SQS (Interface)  │   │                        │
│           │  │ KMS (Interface)  │   │                        │
│           │  │ Secrets Manager  │   │                        │
│           │  │ CloudWatch Logs  │   │                        │
│           │  │ Textract         │   │                        │
│           │  │ Translate        │   │                        │
│           │  │ Bedrock Runtime  │   │                        │
│           │  └──────────────────┘   │                        │
│           └─────────────────────────┘                        │
│                        │                                     │
└────────────────────────┼─────────────────────────────────────┘
                         │
                         ▼
                   AWS Services
```

## VPC Configuration

### VPC Settings

- **CIDR Block**: `10.0.0.0/16`
- **Availability Zones**: 2
- **Subnets**: Private isolated subnets only (no public subnets)
- **NAT Gateway**: None (cost optimization)
- **Internet Gateway**: None (security hardening)
- **DNS Hostnames**: Enabled
- **DNS Support**: Enabled

### Subnet Configuration

| Subnet Type | CIDR Block | Availability Zone | Purpose |
|-------------|------------|-------------------|---------|
| Private | 10.0.0.0/24 | AZ-1 | Lambda functions |
| Private | 10.0.1.0/24 | AZ-2 | Lambda functions |

## VPC Endpoints

### Gateway Endpoints (Free)

Gateway endpoints route traffic through the VPC route table and are free of charge.

#### S3 Gateway Endpoint

- **Service**: `com.amazonaws.region.s3`
- **Type**: Gateway
- **Purpose**: Access S3 buckets for document storage
- **Cost**: Free
- **Private DNS**: Not applicable (uses route table)

#### DynamoDB Gateway Endpoint

- **Service**: `com.amazonaws.region.dynamodb`
- **Type**: Gateway
- **Purpose**: Access DynamoDB tables
- **Cost**: Free
- **Private DNS**: Not applicable (uses route table)

### Interface Endpoints (Charged)

Interface endpoints create elastic network interfaces (ENIs) in your subnets and are charged per hour and per GB of data processed.

#### SQS Interface Endpoint

- **Service**: `com.amazonaws.region.sqs`
- **Type**: Interface
- **Purpose**: Access SQS queues for document processing
- **Cost**: ~$7.30/month per AZ + data processing
- **Private DNS**: Enabled

#### KMS Interface Endpoint

- **Service**: `com.amazonaws.region.kms`
- **Type**: Interface
- **Purpose**: Encrypt/decrypt data with KMS keys
- **Cost**: ~$7.30/month per AZ + data processing
- **Private DNS**: Enabled

#### Secrets Manager Interface Endpoint

- **Service**: `com.amazonaws.region.secretsmanager`
- **Type**: Interface
- **Purpose**: Retrieve secrets for API keys
- **Cost**: ~$7.30/month per AZ + data processing
- **Private DNS**: Enabled

#### CloudWatch Logs Interface Endpoint

- **Service**: `com.amazonaws.region.logs`
- **Type**: Interface
- **Purpose**: Send Lambda logs to CloudWatch
- **Cost**: ~$7.30/month per AZ + data processing
- **Private DNS**: Enabled

#### STS Interface Endpoint

- **Service**: `com.amazonaws.region.sts`
- **Type**: Interface
- **Purpose**: IAM role assumption for Lambda functions
- **Cost**: ~$7.30/month per AZ + data processing
- **Private DNS**: Enabled

#### Textract Interface Endpoint

- **Service**: `com.amazonaws.region.textract`
- **Type**: Interface
- **Purpose**: OCR processing with Amazon Textract
- **Cost**: ~$7.30/month per AZ + data processing
- **Private DNS**: Enabled
- **Note**: May not be available in all regions

#### Translate Interface Endpoint

- **Service**: `com.amazonaws.region.translate`
- **Type**: Interface
- **Purpose**: Translation with Amazon Translate
- **Cost**: ~$7.30/month per AZ + data processing
- **Private DNS**: Enabled
- **Note**: May not be available in all regions

#### Bedrock Runtime Interface Endpoint

- **Service**: `com.amazonaws.region.bedrock-runtime`
- **Type**: Interface
- **Purpose**: AI analysis with Amazon Bedrock
- **Cost**: ~$7.30/month per AZ + data processing
- **Private DNS**: Enabled
- **Note**: May not be available in all regions

### Total Estimated Cost

- **Gateway Endpoints**: $0/month (free)
- **Interface Endpoints**: ~$73/month (10 endpoints × 2 AZs × $7.30/month)
- **Data Processing**: Variable based on usage

## Security Groups

### Lambda Security Group

- **Name**: `SatyaMool-Lambda-SG`
- **Purpose**: Applied to all Lambda functions
- **Inbound Rules**:
  - Allow all traffic from itself (Lambda-to-Lambda communication)
- **Outbound Rules**:
  - Allow all traffic (to VPC endpoints)

### VPC Endpoint Security Group

- **Name**: `SatyaMool-VPC-Endpoint-SG`
- **Purpose**: Applied to all interface VPC endpoints
- **Inbound Rules**:
  - Allow HTTPS (port 443) from Lambda security group
- **Outbound Rules**:
  - None (endpoints don't initiate connections)

## Network ACLs

### Private Subnet Network ACL

- **Name**: `SatyaMool-Private-NACL`
- **Purpose**: Additional layer of security for private subnets

#### Inbound Rules

| Rule # | Type | Protocol | Port Range | Source | Action |
|--------|------|----------|------------|--------|--------|
| 100 | HTTPS | TCP | 443 | 10.0.0.0/16 | ALLOW |
| 110 | Ephemeral | TCP | 1024-65535 | 10.0.0.0/16 | ALLOW |

#### Outbound Rules

| Rule # | Type | Protocol | Port Range | Destination | Action |
|--------|------|----------|------------|-------------|--------|
| 100 | HTTPS | TCP | 443 | 10.0.0.0/16 | ALLOW |
| 110 | Ephemeral | TCP | 1024-65535 | 10.0.0.0/16 | ALLOW |

## VPC Flow Logs

### Configuration

- **Destination**: CloudWatch Logs
- **Log Group**: `/aws/vpc/satyamool-flow-logs`
- **Traffic Type**: All (accepted and rejected)
- **Retention**: 7 days
- **Purpose**: Network traffic monitoring and security analysis

### Log Format

```
version account-id interface-id srcaddr dstaddr srcport dstport protocol packets bytes start end action log-status
```

### Use Cases

1. **Security Analysis**: Identify unauthorized access attempts
2. **Troubleshooting**: Debug connectivity issues
3. **Compliance**: Audit network traffic for compliance requirements
4. **Cost Optimization**: Identify high-traffic endpoints

## Lambda VPC Configuration

### Attaching Lambda to VPC

```typescript
const lambda = new lambda.Function(this, 'MyFunction', {
  // ... other properties
  vpc: vpcConfig.vpc,
  vpcSubnets: {
    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
  },
  securityGroups: [vpcConfig.lambdaSecurityGroup],
});
```

### Environment Variables

Lambda functions in VPC should set:

```typescript
environment: {
  AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1', // Reuse connections
}
```

## Benefits

### Security

1. **No Internet Exposure**: Lambda functions don't need internet access
2. **Private Communication**: All AWS service calls stay within AWS network
3. **Network Isolation**: Private subnets with no public access
4. **Defense in Depth**: Multiple layers (security groups, NACLs, VPC endpoints)

### Cost Optimization

1. **No NAT Gateway**: Save ~$32/month per AZ (~$64/month total)
2. **No Data Transfer**: No NAT Gateway data processing charges
3. **Gateway Endpoints**: Free for S3 and DynamoDB

### Performance

1. **Lower Latency**: Direct connection to AWS services
2. **Higher Throughput**: No NAT Gateway bottleneck
3. **Better Reliability**: No single point of failure

## Monitoring

### CloudWatch Metrics

Monitor VPC endpoint usage:

- **VPC Endpoint Bytes**: Data transferred through endpoints
- **VPC Endpoint Packets**: Packets transferred through endpoints
- **VPC Endpoint Connections**: Active connections to endpoints

### Alarms

Set up alarms for:

- High data transfer through endpoints (> 100 GB/day)
- VPC Flow Logs showing rejected traffic
- Lambda function connectivity issues

## Troubleshooting

### Lambda Cannot Access AWS Services

1. **Check VPC Configuration**: Verify Lambda is in private subnet
2. **Check Security Groups**: Verify Lambda SG allows outbound HTTPS
3. **Check VPC Endpoints**: Verify endpoints exist and are available
4. **Check Endpoint Security Groups**: Verify endpoint SG allows inbound from Lambda SG
5. **Check Private DNS**: Verify private DNS is enabled for interface endpoints
6. **Check VPC Flow Logs**: Look for rejected traffic

### High VPC Endpoint Costs

1. **Review Data Transfer**: Check which endpoints have high data transfer
2. **Optimize API Calls**: Reduce unnecessary API calls
3. **Use Gateway Endpoints**: Prefer S3 and DynamoDB gateway endpoints
4. **Consider Regional Endpoints**: Use endpoints in same region as resources

## Best Practices

1. **Use Gateway Endpoints**: Always use gateway endpoints for S3 and DynamoDB (free)
2. **Enable Private DNS**: Enable private DNS for interface endpoints
3. **Least Privilege Security Groups**: Only allow necessary traffic
4. **Monitor Costs**: Track VPC endpoint costs in Cost Explorer
5. **Enable Flow Logs**: Enable VPC Flow Logs for security monitoring
6. **Multi-AZ Deployment**: Deploy endpoints in multiple AZs for high availability
7. **Test Connectivity**: Test Lambda connectivity to all AWS services

## Compliance

### Requirements

- **Requirement 13.6**: Configure VPC endpoints for S3, DynamoDB, SQS
- **Requirement 13.6**: Configure security groups and network ACLs
- **Requirement 13.6**: Ensure Lambda functions use VPC endpoints

### Audit

- VPC configuration documented
- Security groups configured with least privilege
- Network ACLs configured for private subnets
- VPC Flow Logs enabled for monitoring
- All Lambda functions attached to VPC

## References

- [VPC Endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints.html)
- [Gateway Endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/vpce-gateway.html)
- [Interface Endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/vpce-interface.html)
- [VPC Flow Logs](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html)
- [Lambda VPC Networking](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html)
