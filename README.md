# SatyaMool

AWS-native serverless platform for automated legal verification of Indian property documents using Generative AI.

## Project Structure

```
satyamool/
├── packages/
│   ├── infrastructure/    # AWS CDK infrastructure code
│   ├── backend/          # Node.js Lambda functions for APIs
│   ├── processing/       # Python Lambda functions for AI processing
│   └── frontend/         # React 18 frontend application
└── package.json          # Root package.json for monorepo
```

## Prerequisites

- Node.js 20+
- Python 3.12+
- AWS CLI configured
- AWS CDK CLI installed (`npm install -g aws-cdk`)

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Build all packages:
```bash
npm run build
```

3. Deploy infrastructure:
```bash
npm run deploy
```

## Architecture

SatyaMool uses a fully serverless architecture:
- **API Layer**: AWS API Gateway + Lambda (Node.js 20)
- **Processing**: Lambda (Python 3.12) + SQS + DynamoDB Streams
- **AI Services**: Amazon Textract, Translate, Bedrock (Claude 3.5 Sonnet)
- **Storage**: S3 with KMS encryption
- **Database**: DynamoDB with on-demand pricing
- **Authentication**: AWS Cognito

## Development

See individual package READMEs for development instructions:
- [Infrastructure](./packages/infrastructure/README.md)
- [Backend](./packages/backend/README.md)
- [Processing](./packages/processing/README.md)
- [Frontend](./packages/frontend/README.md)
