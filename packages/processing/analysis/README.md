# Analysis Lambda Function

This Lambda function performs AI-powered document analysis using Amazon Bedrock with Claude 3.5 Sonnet. It extracts structured data from Indian property documents based on document type.

## Overview

The Analysis Lambda is triggered by DynamoDB Streams when documents reach `translation_complete` status. It:

1. Detects document type (Sale Deed, Mother Deed, Encumbrance Certificate)
2. Constructs appropriate extraction prompts for Claude 3.5 Sonnet
3. Invokes Amazon Bedrock for structured data extraction
4. Detects inconsistencies across documents
5. Stores extracted data in DynamoDB
6. Updates processing status to `analysis_complete`

## Document Types

### Sale Deed
Extracts:
- Buyer and seller names
- Transaction date (normalized to ISO 8601)
- Sale consideration amount
- Survey Numbers
- Property schedule and boundaries
- Measurements and area
- Family relationships
- Registration details

### Mother Deed
Extracts:
- Original owner name
- Grant date (normalized to ISO 8601)
- Survey Numbers
- Property description
- Grant authority
- Boundaries and measurements

### Encumbrance Certificate
Extracts:
- Survey Numbers
- Certificate period
- Transaction history (all entries)
- Sub-registrar office
- Issue date
- Encumbrance status

## Inconsistency Detection

The function detects:
- **Survey Number mismatches**: Flags when Survey Numbers don't match across documents
- **Name variations**: Identifies potential name spelling differences
- **Date inconsistencies**: Detects illogical date sequences (e.g., registration before transaction)

## Requirements Mapping

- **6.1**: Uses Claude 3.5 Sonnet via Amazon Bedrock
- **6.2**: Extracts Sale Deed fields
- **6.3**: Extracts Mother Deed fields
- **6.4**: Extracts Encumbrance Certificate transaction history
- **6.5**: Normalizes dates to ISO 8601 format
- **6.6**: Detects family relationships
- **6.8**: Extracts property boundaries and measurements
- **6.9**: Detects and flags inconsistencies
- **3.5, 3.7**: Updates processing status

## Environment Variables

- `DOCUMENTS_TABLE_NAME`: DynamoDB table name for documents (default: `SatyaMool-Documents`)

## IAM Permissions Required

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetRecords",
        "dynamodb:GetShardIterator",
        "dynamodb:DescribeStream",
        "dynamodb:ListStreams"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/SatyaMool-Documents/stream/*"
    }
  ]
}
```

## Deployment

This Lambda function is deployed using AWS CDK. Configuration:

- **Runtime**: Python 3.12
- **Memory**: 1024 MB (for Bedrock API calls with large prompts)
- **Timeout**: 3 minutes
- **Trigger**: DynamoDB Streams (Documents table)
- **Architecture**: ARM64 (Graviton2 for cost and energy efficiency)

## Testing

Unit tests are located in `__tests__/test_handler.py`. Run tests with:

```bash
cd packages/processing/analysis
pytest __tests__/
```

## Error Handling

- Bedrock API errors are logged and the document status is set to `analysis_failed`
- JSON parsing errors from Claude responses are logged with the raw response
- Inconsistency detection errors don't fail the entire process
- All errors are logged with full stack traces for debugging

## Performance Considerations

- Uses lazy initialization for AWS clients to reduce cold start time
- Temperature set to 0.0 for deterministic extraction
- Max tokens set to 4096 to handle large documents
- Inconsistency detection queries use GSI for efficient lookups
