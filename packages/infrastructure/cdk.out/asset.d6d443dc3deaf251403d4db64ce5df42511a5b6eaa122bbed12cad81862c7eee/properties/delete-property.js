"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const audit_1 = require("../audit");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
});
const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
const DOCUMENTS_TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'SatyaMool-Documents';
const LINEAGE_TABLE_NAME = process.env.LINEAGE_TABLE_NAME || 'SatyaMool-Lineage';
const TRUST_SCORES_TABLE_NAME = process.env.TRUST_SCORES_TABLE_NAME || 'SatyaMool-TrustScores';
const DOCUMENT_BUCKET_NAME = process.env.DOCUMENT_BUCKET_NAME || 'satyamool-documents';
/**
 * Lambda handler for deleting property
 * Marks documents for deletion in S3 (lifecycle policy handles actual deletion)
 * Removes metadata from DynamoDB tables
 * Logs deletion event to AuditLogs
 */
const handler = async (event) => {
    console.log('Delete property request received:', JSON.stringify(event, null, 2));
    try {
        // Extract userId from authorizer context
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
        // Query property to verify ownership
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
            return createErrorResponse(403, 'FORBIDDEN', 'You do not have permission to delete this property');
        }
        // Get all documents for this property
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
        // Delete documents from S3
        if (documents.length > 0) {
            const s3Keys = documents
                .filter(doc => doc.s3Key)
                .map(doc => ({ Key: doc.s3Key }));
            if (s3Keys.length > 0) {
                // List objects to verify they exist
                const listCommand = new client_s3_1.ListObjectsV2Command({
                    Bucket: DOCUMENT_BUCKET_NAME,
                    Prefix: `properties/${propertyId}/`,
                });
                const listResult = await s3Client.send(listCommand);
                if (listResult.Contents && listResult.Contents.length > 0) {
                    const objectsToDelete = listResult.Contents.map(obj => ({ Key: obj.Key }));
                    // Delete objects in batches of 1000 (S3 limit)
                    for (let i = 0; i < objectsToDelete.length; i += 1000) {
                        const batch = objectsToDelete.slice(i, i + 1000);
                        const deleteCommand = new client_s3_1.DeleteObjectsCommand({
                            Bucket: DOCUMENT_BUCKET_NAME,
                            Delete: {
                                Objects: batch,
                                Quiet: true,
                            },
                        });
                        await s3Client.send(deleteCommand);
                    }
                }
            }
            // Delete document metadata from DynamoDB
            const deleteRequests = documents.map(doc => ({
                DeleteRequest: {
                    Key: {
                        documentId: doc.documentId,
                        propertyId: doc.propertyId,
                    },
                },
            }));
            // Batch delete in chunks of 25 (DynamoDB limit)
            for (let i = 0; i < deleteRequests.length; i += 25) {
                const batch = deleteRequests.slice(i, i + 25);
                const batchWriteCommand = new lib_dynamodb_1.BatchWriteCommand({
                    RequestItems: {
                        [DOCUMENTS_TABLE_NAME]: batch,
                    },
                });
                await docClient.send(batchWriteCommand);
            }
        }
        // Delete lineage data
        const deleteLineageCommand = new lib_dynamodb_1.DeleteCommand({
            TableName: LINEAGE_TABLE_NAME,
            Key: {
                propertyId: propertyId,
            },
        });
        await docClient.send(deleteLineageCommand);
        // Delete trust score data
        const deleteTrustScoreCommand = new lib_dynamodb_1.DeleteCommand({
            TableName: TRUST_SCORES_TABLE_NAME,
            Key: {
                propertyId: propertyId,
            },
        });
        await docClient.send(deleteTrustScoreCommand);
        // Delete property record
        const deletePropertyCommand = new lib_dynamodb_1.DeleteCommand({
            TableName: PROPERTIES_TABLE_NAME,
            Key: {
                propertyId: propertyId,
                userId: property.userId,
            },
        });
        await docClient.send(deletePropertyCommand);
        // Log deletion event using audit module
        await (0, audit_1.createAuditLog)({
            userId: userId,
            action: audit_1.AuditAction.PROPERTY_DELETED,
            resourceType: audit_1.ResourceType.PROPERTY,
            resourceId: propertyId,
            requestId: (0, audit_1.extractRequestId)(event),
            ipAddress: (0, audit_1.extractIpAddress)(event),
            userAgent: (0, audit_1.extractUserAgent)(event),
            metadata: {
                propertyAddress: property.address,
                surveyNumber: property.surveyNumber,
                documentsDeleted: documents.length,
            },
        });
        console.log(`Property ${propertyId} deleted by user ${userId}`);
        // Prepare response
        const response = {
            message: 'Property verification deleted successfully',
            propertyId: propertyId,
            deletedDocuments: documents.length,
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
        console.error('Delete property error:', error);
        // Generic error response
        return createErrorResponse(500, 'INTERNAL_ERROR', 'An error occurred while deleting the property. Please try again.');
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
//# sourceMappingURL=delete-property.js.map