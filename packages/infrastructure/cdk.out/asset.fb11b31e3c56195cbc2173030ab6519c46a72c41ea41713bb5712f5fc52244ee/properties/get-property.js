"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
const DOCUMENTS_TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'SatyaMool-Documents';
/**
 * Lambda handler for getting property details
 * Retrieves property metadata, document count, and processing status
 * Implements authorization check (user owns property or is admin)
 */
const handler = async (event) => {
    console.log('Get property request received:', JSON.stringify(event, null, 2));
    try {
        // Extract userId and role from authorizer context
        const userId = event.requestContext.authorizer?.claims?.sub;
        const userRole = event.requestContext.authorizer?.claims?.['custom:role'];
        if (!userId) {
            return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
        }
        // Extract propertyId from path parameters
        const propertyId = event.pathParameters?.id;
        if (!propertyId) {
            return createErrorResponse(400, 'MISSING_PROPERTY_ID', 'Property ID is required');
        }
        // Query property using propertyId and userId as composite key
        // First, we need to get the property to check ownership
        const queryCommand = new lib_dynamodb_1.QueryCommand({
            TableName: PROPERTIES_TABLE_NAME,
            KeyConditionExpression: 'propertyId = :propertyId',
            ExpressionAttributeValues: {
                ':propertyId': propertyId,
            },
            Limit: 1,
        });
        const result = await docClient.send(queryCommand);
        if (!result.Items || result.Items.length === 0) {
            return createErrorResponse(404, 'PROPERTY_NOT_FOUND', 'Property not found');
        }
        const property = result.Items[0];
        // Authorization check: user owns property or is admin
        const isOwner = property.userId === userId;
        const isAdmin = userRole === 'Admin_User';
        if (!isOwner && !isAdmin) {
            return createErrorResponse(403, 'FORBIDDEN', 'You do not have permission to access this property');
        }
        // Get document count and processing status
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
        // Calculate processing status
        const processingStatus = calculateProcessingStatus(documents);
        // Update property with document count and processing status
        const propertyDetails = {
            ...property,
            documentCount: documents.length,
            processingStatus,
        };
        console.log(`Retrieved property ${propertyId} for user ${userId}`);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify(propertyDetails),
        };
    }
    catch (error) {
        console.error('Get property error:', error);
        // Generic error response
        return createErrorResponse(500, 'INTERNAL_ERROR', 'An error occurred while retrieving property details. Please try again.');
    }
};
exports.handler = handler;
/**
 * Calculate processing status from documents
 */
function calculateProcessingStatus(documents) {
    if (documents.length === 0) {
        return {
            ocr: 0,
            translation: 0,
            analysis: 0,
            lineage: false,
            scoring: false,
        };
    }
    let ocrComplete = 0;
    let translationComplete = 0;
    let analysisComplete = 0;
    for (const doc of documents) {
        const status = doc.processingStatus || 'pending';
        if (status === 'ocr_complete' || status === 'translation_complete' || status === 'analysis_complete') {
            ocrComplete++;
        }
        if (status === 'translation_complete' || status === 'analysis_complete') {
            translationComplete++;
        }
        if (status === 'analysis_complete') {
            analysisComplete++;
        }
    }
    const total = documents.length;
    const allAnalysisComplete = analysisComplete === total;
    return {
        ocr: Math.round((ocrComplete / total) * 100),
        translation: Math.round((translationComplete / total) * 100),
        analysis: Math.round((analysisComplete / total) * 100),
        lineage: allAnalysisComplete, // Lineage can only be constructed when all docs are analyzed
        scoring: allAnalysisComplete, // Scoring can only be done when lineage is complete
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
//# sourceMappingURL=get-property.js.map