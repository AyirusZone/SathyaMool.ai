import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  createAuditLog,
  AuditAction,
  ResourceType,
  extractIpAddress,
  extractUserAgent,
  extractRequestId,
} from '../audit';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
const LINEAGE_TABLE_NAME = process.env.LINEAGE_TABLE_NAME || 'SatyaMool-Lineage';
const DOCUMENTS_TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'SatyaMool-Documents';

interface Node {
  id: string;
  type: string;
  data: {
    label: string;
    name: string;
    date?: string;
    verificationStatus: 'verified' | 'gap' | 'warning';
    documentId?: string;
    metadata?: any;
  };
  position: { x: number; y: number };
}

interface Edge {
  id: string;
  source: string;
  target: string;
  type?: string;
  data: {
    label?: string;
    transferType?: string;
    date?: string;
    documentId?: string;
    saleConsideration?: string;
    metadata?: any;
  };
}

interface ReactFlowGraph {
  nodes: Node[];
  edges: Edge[];
  metadata: {
    motherDeed?: any;
    gaps: any[];
    ownershipPaths: any[];
    circularPatterns: any[];
    nodeCount: number;
    edgeCount: number;
    gapCount: number;
  };
}

interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Lambda handler for getting lineage graph data
 * Retrieves lineage graph and transforms it to React Flow compatible format
 * Implements authorization check (user owns property or is admin)
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Get lineage request received:', JSON.stringify(event, null, 2));

  try {
    // Extract userId and role from authorizer context
    // The authorizer puts userId and role in the context, not in claims
    const userId = event.requestContext.authorizer?.userId || event.requestContext.authorizer?.claims?.sub;
    const userRole = event.requestContext.authorizer?.role || event.requestContext.authorizer?.claims?.['custom:role'];
    
    if (!userId) {
      return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
    }

    // Extract propertyId from path parameters
    const propertyId = event.pathParameters?.id;
    
    if (!propertyId) {
      return createErrorResponse(400, 'MISSING_PROPERTY_ID', 'Property ID is required');
    }

    // Check property ownership
    const propertyQuery = new QueryCommand({
      TableName: PROPERTIES_TABLE_NAME,
      KeyConditionExpression: 'propertyId = :propertyId',
      ExpressionAttributeValues: {
        ':propertyId': propertyId,
      },
      Limit: 1,
    });

    const propertyResult = await docClient.send(propertyQuery);

    if (!propertyResult.Items || propertyResult.Items.length === 0) {
      return createErrorResponse(404, 'PROPERTY_NOT_FOUND', 'Property not found');
    }

    const property = propertyResult.Items[0];

    // Authorization check: user owns property or is admin
    const isOwner = property.userId === userId;
    const isAdmin = userRole === 'Admin_User';

    if (!isOwner && !isAdmin) {
      return createErrorResponse(
        403,
        'FORBIDDEN',
        'You do not have permission to access this property'
      );
    }

    // Get lineage graph data
    const lineageCommand = new GetCommand({
      TableName: LINEAGE_TABLE_NAME,
      Key: {
        propertyId: propertyId,
      },
    });

    const lineageResult = await docClient.send(lineageCommand);

    if (!lineageResult.Item) {
      return createErrorResponse(
        404,
        'LINEAGE_NOT_FOUND',
        'Lineage graph not yet constructed. Please wait for processing to complete.'
      );
    }

    const lineageData = lineageResult.Item;

    // Get documents for additional metadata
    const documentsQuery = new QueryCommand({
      TableName: DOCUMENTS_TABLE_NAME,
      IndexName: 'propertyId-uploadedAt-index',
      KeyConditionExpression: 'propertyId = :propertyId',
      ExpressionAttributeValues: {
        ':propertyId': propertyId,
      },
    });

    const documentsResult = await docClient.send(documentsQuery);
    const documents = documentsResult.Items || [];

    // Create document lookup map
    const documentMap = new Map();
    documents.forEach(doc => {
      documentMap.set(doc.documentId, doc);
    });

    // Transform to React Flow format
    const reactFlowGraph = transformToReactFlow(lineageData, documentMap);

    // Log data access event
    await createAuditLog({
      userId: userId,
      action: AuditAction.LINEAGE_ACCESSED,
      resourceType: ResourceType.PROPERTY,
      resourceId: propertyId,
      requestId: extractRequestId(event),
      ipAddress: extractIpAddress(event),
      userAgent: extractUserAgent(event),
      metadata: {
        nodeCount: reactFlowGraph.metadata.nodeCount,
        edgeCount: reactFlowGraph.metadata.edgeCount,
      },
    });

    console.log(`Retrieved lineage graph for property ${propertyId}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify(reactFlowGraph),
    };
  } catch (error: any) {
    console.error('Get lineage error:', error);

    return createErrorResponse(
      500,
      'INTERNAL_ERROR',
      'An error occurred while retrieving lineage graph. Please try again.'
    );
  }
};

/**
 * Transform lineage data to React Flow compatible format
 */
function transformToReactFlow(lineageData: any, documentMap: Map<string, any>): ReactFlowGraph {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Transform nodes
  const rawNodes = lineageData.nodes || [];
  rawNodes.forEach((node: any, index: number) => {
    // Determine verification status
    let verificationStatus: 'verified' | 'gap' | 'warning' = 'verified';
    
    if (node.isGap) {
      verificationStatus = 'gap';
    } else if (node.hasWarning || node.lowConfidence) {
      verificationStatus = 'warning';
    }

    // Get document metadata if available
    const doc = node.documentId ? documentMap.get(node.documentId) : null;

    nodes.push({
      id: node.id || `node-${index}`,
      type: node.type || 'default',
      data: {
        label: node.name || node.label || 'Unknown',
        name: node.name || 'Unknown',
        date: node.date || node.transactionDate,
        verificationStatus,
        documentId: node.documentId,
        metadata: {
          ...node,
          documentType: doc?.documentType,
          confidence: doc?.confidence,
        },
      },
      position: node.position || { x: index * 200, y: 0 }, // Default layout
    });
  });

  // Transform edges
  const rawEdges = lineageData.edges || [];
  rawEdges.forEach((edge: any, index: number) => {
    const doc = edge.documentId ? documentMap.get(edge.documentId) : null;

    edges.push({
      id: edge.id || `edge-${index}`,
      source: edge.source || edge.from,
      target: edge.target || edge.to,
      type: edge.type || 'default',
      data: {
        label: edge.label || edge.transferType,
        transferType: edge.transferType || edge.relationshipType,
        date: edge.date || edge.transactionDate,
        documentId: edge.documentId,
        saleConsideration: edge.saleConsideration,
        metadata: {
          ...edge,
          documentType: doc?.documentType,
          documentReference: doc?.s3Key,
        },
      },
    });
  });

  // Build metadata
  const metadata = {
    motherDeed: lineageData.motherDeed || {},
    gaps: lineageData.gaps || [],
    ownershipPaths: lineageData.ownershipPaths || [],
    circularPatterns: lineageData.circularPatterns || [],
    nodeCount: nodes.length,
    edgeCount: edges.length,
    gapCount: (lineageData.gaps || []).length,
  };

  return {
    nodes,
    edges,
    metadata,
  };
}

/**
 * Create error response
 */
function createErrorResponse(
  statusCode: number,
  errorCode: string,
  message: string
): APIGatewayProxyResult {
  const errorResponse: ErrorResponse = {
    error: errorCode,
    message: message,
  };

  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(errorResponse),
  };
}
