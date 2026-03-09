"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const audit_1 = require("../audit");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
const LINEAGE_TABLE_NAME = process.env.LINEAGE_TABLE_NAME || 'SatyaMool-Lineage';
const DOCUMENTS_TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'SatyaMool-Documents';
/**
 * Lambda handler for getting lineage graph data
 * Retrieves lineage graph and transforms it to React Flow compatible format
 * Implements authorization check (user owns property or is admin)
 */
const handler = async (event) => {
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
        const propertyId = event.pathParameters?.propertyId;
        if (!propertyId) {
            return createErrorResponse(400, 'MISSING_PROPERTY_ID', 'Property ID is required');
        }
        // Check property ownership
        const propertyQuery = new lib_dynamodb_1.QueryCommand({
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
            return createErrorResponse(403, 'FORBIDDEN', 'You do not have permission to access this property');
        }
        // Get lineage graph data
        const lineageCommand = new lib_dynamodb_1.GetCommand({
            TableName: LINEAGE_TABLE_NAME,
            Key: {
                propertyId: propertyId,
            },
        });
        const lineageResult = await docClient.send(lineageCommand);
        if (!lineageResult.Item) {
            return createErrorResponse(404, 'LINEAGE_NOT_FOUND', 'Lineage graph not yet constructed. Please wait for processing to complete.');
        }
        const lineageData = lineageResult.Item;
        // Get documents for additional metadata
        const documentsQuery = new lib_dynamodb_1.QueryCommand({
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
        await (0, audit_1.createAuditLog)({
            userId: userId,
            action: audit_1.AuditAction.LINEAGE_ACCESSED,
            resourceType: audit_1.ResourceType.PROPERTY,
            resourceId: propertyId,
            requestId: (0, audit_1.extractRequestId)(event),
            ipAddress: (0, audit_1.extractIpAddress)(event),
            userAgent: (0, audit_1.extractUserAgent)(event),
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
    }
    catch (error) {
        console.error('Get lineage error:', error);
        return createErrorResponse(500, 'INTERNAL_ERROR', 'An error occurred while retrieving lineage graph. Please try again.');
    }
};
exports.handler = handler;
/**
 * Transform lineage data to React Flow compatible format
 */
function transformToReactFlow(lineageData, documentMap) {
    const nodes = [];
    const edges = [];
    // Transform nodes
    const rawNodes = lineageData.nodes || [];
    rawNodes.forEach((node, index) => {
        // Determine verification status
        let verificationStatus = 'verified';
        if (node.isGap) {
            verificationStatus = 'gap';
        }
        else if (node.hasWarning || node.lowConfidence) {
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
    rawEdges.forEach((edge, index) => {
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
function createErrorResponse(statusCode, errorCode, message) {
    const errorResponse = {
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
//# sourceMappingURL=get-lineage.js.map