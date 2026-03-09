"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const DOCUMENTS_TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'SatyaMool-Documents';
/**
 * Lambda handler for retrieving documents for a property
 * Returns all documents associated with the property, ordered by upload date
 */
const handler = async (event) => {
    console.log('Get documents request received:', JSON.stringify(event, null, 2));
    try {
        // Extract userId from authorizer context
        const userId = event.requestContext.authorizer?.userId || event.requestContext.authorizer?.claims?.sub;
        if (!userId) {
            return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
        }
        // Extract propertyId from path parameters
        const propertyId = event.pathParameters?.propertyId;
        if (!propertyId) {
            return createErrorResponse(400, 'MISSING_PROPERTY_ID', 'Property ID is required');
        }
        // Query documents by propertyId using GSI
        const queryCommand = new lib_dynamodb_1.QueryCommand({
            TableName: DOCUMENTS_TABLE_NAME,
            IndexName: 'propertyId-uploadedAt-index',
            KeyConditionExpression: 'propertyId = :propertyId',
            ExpressionAttributeValues: {
                ':propertyId': propertyId,
            },
            ScanIndexForward: false, // Sort by uploadedAt descending (newest first)
        });
        const result = await docClient.send(queryCommand);
        const documents = result.Items || [];
        console.log(`Found ${documents.length} documents for property ${propertyId}`);
        const response = {
            documents: documents,
            count: documents.length,
        };
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
        console.error('Get documents error:', error);
        return createErrorResponse(500, 'INTERNAL_ERROR', 'An error occurred while retrieving documents. Please try again.');
    }
};
exports.handler = handler;
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
//# sourceMappingURL=get-documents.js.map