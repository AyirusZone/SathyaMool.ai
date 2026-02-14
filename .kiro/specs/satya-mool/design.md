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
