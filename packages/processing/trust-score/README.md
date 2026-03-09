# Trust Score Calculation Lambda

This Lambda function calculates property Trust Scores for the SatyaMool platform.

## Overview

The Trust Score Lambda is triggered when lineage construction completes. It calculates a numerical score (0-100) indicating property title quality based on multiple factors including chain completeness, document consistency, and verification status.

## Requirements

**Implements Requirements:**
- 8.1: Calculate Trust_Score between 0 and 100
- 8.2: Assign base score of 80 for complete chains
- 8.3: Deduct 15 points per gap in ownership chain
- 8.4: Deduct 10 points per date inconsistency
- 8.5: Deduct 20 points for Survey_Number mismatches
- 8.6: Add 10 points if Encumbrance Certificate matches
- 8.7: Add 5 points if all documents < 30 years old
- 8.8: Add 5 points for documented family succession
- 8.9: Clamp score between 0 and 100
- 8.10: Provide detailed breakdown with explanations

## Trigger

- **Type**: DynamoDB Stream
- **Source**: SatyaMool-Lineage table
- **Filter**: Lineage construction complete
- **Batch Size**: 10 records

## Processing Flow

1. **Data Retrieval**: Retrieves lineage graph and document metadata
2. **Base Score**: Assigns 80 points for complete ownership chains
3. **Gap Penalty**: Deducts 15 points per gap in chain
4. **Inconsistency Penalty**: Deducts 10 points per date inconsistency
5. **Survey Number Penalty**: Deducts 20 points for mismatches
6. **EC Bonus**: Adds 10 points if Encumbrance Certificate matches
7. **Recency Bonus**: Adds 5 points if all documents < 30 years old
8. **Succession Bonus**: Adds 5 points for documented family succession
9. **Score Bounds**: Clamps final score to 0-100 range
10. **Storage**: Stores Trust Score and breakdown in TrustScores table
11. **Status Update**: Updates property status to "scoring_complete"

## Score Components

### Base Score (80 points)
- Assigned to all properties with complete ownership chains
- Starting point for all calculations

### Gap Penalty (-15 points per gap)
- Applied for disconnected ownership chains
- Applied for multiple terminal owners
- Does not apply to temporal gaps (handled separately)

### Inconsistency Penalty (-10 points per inconsistency)
- Future dates in documents
- Multiple documents of same type on same date
- Suspiciously old dates (before 1900)

### Survey Number Penalty (-20 points)
- Applied when documents reference different Survey Numbers
- Survey Numbers are normalized before comparison

### Encumbrance Certificate Bonus (+10 points)
- Applied when EC is provided and matches Sale Deed data
- Requires matching transaction dates

### Recency Bonus (+5 points)
- Applied when all documents are less than 30 years old
- Calculated from transaction/grant dates

### Succession Bonus (+5 points)
- Applied when family succession is properly documented
- Looks for legal heir certificates, succession certificates, wills

## Score Ratings

- **90-100**: Excellent - Very strong title with minimal risk
- **75-89**: Good - Strong title with low risk
- **60-74**: Fair - Acceptable title with moderate risk
- **40-59**: Poor - Weak title with significant risk
- **0-39**: Very Poor - Very weak title with high risk

## Output

The Lambda stores the following in the TrustScores table:

```json
{
  "propertyId": "uuid",
  "totalScore": 85,
  "scoreBreakdown": {
    "total_score": 85,
    "raw_score": 85,
    "clamped": false,
    "components": [
      {
        "component": "base_score",
        "value": 80,
        "explanation": "Complete ownership chain with no gaps detected"
      },
      {
        "component": "gap_penalty",
        "value": 0,
        "explanation": "No gaps detected in ownership chain"
      },
      {
        "component": "inconsistency_penalty",
        "value": 0,
        "explanation": "No date inconsistencies detected"
      },
      {
        "component": "survey_number_penalty",
        "value": 0,
        "explanation": "All documents reference the same Survey Number: 123/1"
      },
      {
        "component": "ec_bonus",
        "value": 10,
        "explanation": "Added 10 points for Encumbrance Certificate verification (matched 2 transaction(s))"
      },
      {
        "component": "recency_bonus",
        "value": 0,
        "explanation": "No recency bonus (oldest document is 35.2 years old, threshold is 30 years)"
      },
      {
        "component": "succession_bonus",
        "value": 5,
        "explanation": "Added 5 points for documented family succession (1 indicator(s) found)"
      }
    ],
    "summary": "Excellent (85/100): Property has a very strong title with minimal risk"
  },
  "calculatedAt": "2024-01-01T00:00:00Z",
  "factors": ["base_score", "gap_penalty", "inconsistency_penalty", "survey_number_penalty", "ec_bonus", "recency_bonus", "succession_bonus"]
}
```

## Configuration

See `config.json` for Lambda configuration:
- Memory: 256 MB
- Timeout: 30 seconds
- Architecture: ARM64 (Graviton2)

## Environment Variables

- `LINEAGE_TABLE_NAME`: DynamoDB Lineage table name
- `DOCUMENTS_TABLE_NAME`: DynamoDB Documents table name
- `PROPERTIES_TABLE_NAME`: DynamoDB Properties table name
- `TRUST_SCORES_TABLE_NAME`: DynamoDB TrustScores table name

## Error Handling

- Logs all errors with stack traces
- Continues processing other properties in batch
- Uses dead-letter queue for failed messages

## Testing

See `__tests__/test_handler.py` for unit tests covering:
- Base score calculation
- Gap penalty calculation
- Inconsistency penalty calculation
- Survey Number mismatch penalty
- All bonus calculations
- Score bounds (0-100)

## Dependencies

- boto3: AWS SDK for Python
- Python 3.12 standard library (json, logging, datetime, collections)
