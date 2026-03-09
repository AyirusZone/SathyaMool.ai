"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const dynamodb_cache_1 = require("../utils/dynamodb-cache");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
const TRUST_SCORES_TABLE_NAME = process.env.TRUST_SCORES_TABLE_NAME || 'SatyaMool-TrustScores';
const DOCUMENTS_TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'SatyaMool-Documents';
/**
 * Lambda handler for getting Trust Score
 * Retrieves Trust Score and breakdown with explanations
 * Implements authorization check (user owns property or is admin)
 */
const handler = async (event) => {
    console.log('Get trust score request received:', JSON.stringify(event, null, 2));
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
        // Get Trust Score data
        // Try cache first (trust scores are immutable after calculation)
        const trustScoreCacheKey = dynamodb_cache_1.trustScoreCache.generateKey(TRUST_SCORES_TABLE_NAME, { propertyId });
        let trustScoreData = dynamodb_cache_1.trustScoreCache.get(trustScoreCacheKey);
        if (!trustScoreData) {
            const trustScoreCommand = new lib_dynamodb_1.GetCommand({
                TableName: TRUST_SCORES_TABLE_NAME,
                Key: {
                    propertyId: propertyId,
                },
            });
            const trustScoreResult = await docClient.send(trustScoreCommand);
            if (!trustScoreResult.Item) {
                return createErrorResponse(404, 'TRUST_SCORE_NOT_FOUND', 'Trust Score not yet calculated. Please wait for processing to complete.');
            }
            trustScoreData = trustScoreResult.Item;
            // Cache trust score with longer TTL (10 minutes) since it's immutable
            dynamodb_cache_1.trustScoreCache.set(trustScoreCacheKey, trustScoreData, 600000);
        }
        // Get documents for references
        // Try cache first
        const documentsCacheKey = dynamodb_cache_1.documentCache.generateKey(DOCUMENTS_TABLE_NAME, { propertyId });
        let documents = dynamodb_cache_1.documentCache.get(documentsCacheKey);
        if (!documents) {
            const documentsQuery = new lib_dynamodb_1.QueryCommand({
                TableName: DOCUMENTS_TABLE_NAME,
                IndexName: 'propertyId-uploadedAt-index',
                KeyConditionExpression: 'propertyId = :propertyId',
                ExpressionAttributeValues: {
                    ':propertyId': propertyId,
                },
            });
            const documentsResult = await docClient.send(documentsQuery);
            documents = documentsResult.Items || [];
            // Cache documents with shorter TTL (3 minutes)
            dynamodb_cache_1.documentCache.set(documentsCacheKey, documents, 180000);
        }
        // Create document lookup map
        const documentMap = new Map();
        documents.forEach((doc) => {
            documentMap.set(doc.documentId, {
                documentId: doc.documentId,
                documentType: doc.documentType,
                uploadedAt: doc.uploadedAt,
                s3Key: doc.s3Key,
                extractedData: doc.extractedData,
            });
        });
        // Format response with document references
        const response = formatTrustScoreResponse(trustScoreData, documentMap);
        console.log(`Retrieved Trust Score for property ${propertyId}: ${response.totalScore}`);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify(response),
        };
    }
    catch (error) {
        console.error('Get trust score error:', error);
        return createErrorResponse(500, 'INTERNAL_ERROR', 'An error occurred while retrieving Trust Score. Please try again.');
    }
};
exports.handler = handler;
/**
 * Format Trust Score response with document references
 */
function formatTrustScoreResponse(trustScoreData, documentMap) {
    const scoreBreakdown = trustScoreData.scoreBreakdown || { components: [] };
    // Enhance components with document references
    const enhancedComponents = scoreBreakdown.components.map((component) => {
        const documentRefs = [];
        // Extract document IDs from component metadata if available
        if (component.documentReferences) {
            documentRefs.push(...component.documentReferences);
        }
        return {
            ...component,
            documentReferences: documentRefs,
        };
    });
    // Convert Map to plain object for JSON serialization
    const documentReferences = {};
    documentMap.forEach((value, key) => {
        documentReferences[key] = value;
    });
    return {
        propertyId: trustScoreData.propertyId,
        totalScore: trustScoreData.totalScore,
        calculatedAt: trustScoreData.calculatedAt,
        scoreBreakdown: {
            components: enhancedComponents,
        },
        factors: trustScoreData.factors || [],
        documentReferences,
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
//# sourceMappingURL=get-trust-score.js.map