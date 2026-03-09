# Lineage Construction Lambda

This Lambda function constructs property ownership lineage graphs for the SatyaMool platform.

## Overview

The Lineage Lambda is triggered when all documents for a property reach "analysis_complete" status. It builds a directed acyclic graph (DAG) representing the ownership chain, identifies the Mother Deed, detects gaps, handles multiple ownership paths, and detects circular ownership patterns.

## Requirements

**Implements Requirements:**
- 7.1: Build DAG with owners as nodes and transfers as edges
- 7.2: Retrieve all extracted structured data
- 7.3: Link buyer-seller pairs to create transfer edges
- 7.4: Identify missing links and temporal gaps
- 7.5: Identify Mother Deed as root node
- 7.6: Detect and display all ownership paths
- 7.7: Detect circular patterns in ownership graph
- 7.8: Add transaction dates and document references to edges
- 7.9: Annotate edges with relationship types (sale, inheritance, gift)

## Trigger

- **Type**: DynamoDB Stream
- **Source**: SatyaMool-Documents table
- **Filter**: Documents with `processingStatus = "analysis_complete"`
- **Batch Size**: 10 records

## Processing Flow

1. **Document Status Check**: Verifies all documents for a property are analyzed
2. **Data Retrieval**: Retrieves all extracted structured data from Documents table
3. **Graph Construction**: Builds DAG with owners as nodes and transfers as edges
4. **Mother Deed Identification**: Identifies the root node of the ownership chain
5. **Gap Detection**: Detects missing links and temporal gaps
6. **Path Finding**: Finds all ownership paths from Mother Deed to current owner
7. **Circular Detection**: Detects circular ownership patterns
8. **Storage**: Stores lineage graph in Lineage table
9. **Status Update**: Updates property status to "lineage_complete"

## Graph Structure

### Nodes
Each node represents an owner with the following properties:
- `id`: Unique node identifier
- `name`: Owner name
- `normalized_name`: Normalized name for matching
- `type`: Node type ('owner', 'original_owner')
- `is_mother_deed`: Boolean flag for Mother Deed

### Edges
Each edge represents a property transfer with the following properties:
- `from`: Source node ID (seller)
- `to`: Target node ID (buyer)
- `transaction_date`: Date of transfer
- `document_id`: Reference to source document
- `document_type`: Type of document
- `relationship_type`: Type of transfer ('sale', 'inheritance', 'gift')
- `sale_consideration`: Sale amount (if applicable)
- `registration_details`: Registration information
- `time_span_to_next`: Time span to next transfer (days and years)

## Mother Deed Identification

The Lambda uses multiple strategies to identify the Mother Deed:

1. **Explicit Marking**: Nodes marked as Mother Deed in extracted data
2. **Single Root Node**: Node with no incoming edges
3. **Earliest Root**: Among multiple roots, the one with the earliest date

## Gap Detection

The Lambda detects two types of gaps:

1. **Disconnected Chain**: Multiple disconnected components in the graph
2. **Temporal Gap**: Large time spans (> 5 years) between consecutive transfers
3. **Multiple Terminal Owners**: Multiple potential current owners

## Multiple Path Handling

The Lambda handles complex ownership scenarios:

- **Inheritance Splits**: One owner transferring to multiple heirs
- **Inheritance Merges**: Multiple owners consolidating to one
- **All Paths**: Finds all paths from Mother Deed to current owner(s)

## Circular Ownership Detection

The Lambda detects circular patterns using DFS with recursion stack:

- Identifies cycles in the ownership graph
- Flags as critical errors
- Provides cycle details (node IDs and owner names)

## Output

The Lambda stores the following in the Lineage table:

```json
{
  "propertyId": "uuid",
  "nodes": [...],
  "edges": [...],
  "motherDeed": {
    "node_id": 0,
    "owner_name": "Original Owner",
    "identification_method": "explicit_mother_deed"
  },
  "gaps": [
    {
      "type": "temporal_gap",
      "severity": "medium",
      "description": "Large time gap of 7 years between transfers",
      "years": 7
    }
  ],
  "ownershipPaths": [[0, 1, 2, 3]],
  "circularPatterns": [],
  "metadata": {
    "node_count": 4,
    "edge_count": 3,
    "gap_count": 1,
    "path_count": 1,
    "has_circular_ownership": false
  },
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

## Configuration

See `config.json` for Lambda configuration:
- Memory: 512 MB
- Timeout: 60 seconds
- Architecture: ARM64 (Graviton2)

## Environment Variables

- `DOCUMENTS_TABLE_NAME`: DynamoDB Documents table name
- `PROPERTIES_TABLE_NAME`: DynamoDB Properties table name
- `LINEAGE_TABLE_NAME`: DynamoDB Lineage table name

## Error Handling

- Logs all errors with stack traces
- Updates property status to "lineage_failed" on errors
- Continues processing other properties in batch
- Uses dead-letter queue for failed messages

## Testing

See `__tests__/test_handler.py` for unit tests covering:
- Simple linear ownership chains
- Gap detection
- Circular ownership detection
- Multiple path handling
- Mother Deed identification

## Dependencies

- boto3: AWS SDK for Python
- Python 3.12 standard library (json, logging, datetime, collections)
