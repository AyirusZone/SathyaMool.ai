"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const audit_1 = require("../audit");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
});
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'SatyaMool-Users';
const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
const DOCUMENTS_TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'SatyaMool-Documents';
const LINEAGE_TABLE_NAME = process.env.LINEAGE_TABLE_NAME || 'SatyaMool-Lineage';
const TRUST_SCORES_TABLE_NAME = process.env.TRUST_SCORES_TABLE_NAME || 'SatyaMool-TrustScores';
const NOTIFICATIONS_TABLE_NAME = process.env.NOTIFICATIONS_TABLE_NAME || 'SatyaMool-Notifications';
const DOCUMENT_BUCKET_NAME = process.env.DOCUMENT_BUCKET_NAME || 'satyamool-documents';
/**
 * Lambda handler for exporting all user data
 * Generates JSON format with all properties and documents
 * Stores export in S3 with presigned URL
 */
const handler = async (event) => {
    console.log('User data export request received:', JSON.stringify(event, null, 2));
    try {
        // Extract userId from authorizer context
        const userId = event.requestContext.authorizer?.claims?.sub;
        if (!userId) {
            return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
        }
        console.log(`Exporting data for user: ${userId}`);
        // 1. Get user data
        const getUserCommand = new lib_dynamodb_1.GetCommand({
            TableName: USERS_TABLE_NAME,
            Key: {
                userId: userId,
            },
        });
        const userResult = await docClient.send(getUserCommand);
        if (!userResult.Item) {
            return createErrorResponse(404, 'USER_NOT_FOUND', 'User not found');
        }
        const userData = userResult.Item;
        // 2. Get all properties for the user
        const propertiesQuery = new lib_dynamodb_1.QueryCommand({
            TableName: PROPERTIES_TABLE_NAME,
            IndexName: 'userId-createdAt-index',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId,
            },
        });
        const propertiesResult = await docClient.send(propertiesQuery);
        const properties = propertiesResult.Items || [];
        console.log(`Found ${properties.length} properties for user ${userId}`);
        // 3. Get all documents for each property
        const allDocuments = [];
        const allLineage = [];
        const allTrustScores = [];
        for (const property of properties) {
            // Get documents
            const documentsQuery = new lib_dynamodb_1.QueryCommand({
                TableName: DOCUMENTS_TABLE_NAME,
                IndexName: 'propertyId-uploadedAt-index',
                KeyConditionExpression: 'propertyId = :propertyId',
                ExpressionAttributeValues: {
                    ':propertyId': property.propertyId,
                },
            });
            const documentsResult = await docClient.send(documentsQuery);
            const documents = documentsResult.Items || [];
            // Remove sensitive S3 keys and large OCR text from export
            const sanitizedDocuments = documents.map(doc => ({
                ...doc,
                ocrText: doc.ocrText ? '[OCR text available]' : undefined,
                translatedText: doc.translatedText ? '[Translated text available]' : undefined,
            }));
            allDocuments.push(...sanitizedDocuments);
            // Get lineage
            const lineageCommand = new lib_dynamodb_1.GetCommand({
                TableName: LINEAGE_TABLE_NAME,
                Key: {
                    propertyId: property.propertyId,
                },
            });
            const lineageResult = await docClient.send(lineageCommand);
            if (lineageResult.Item) {
                allLineage.push(lineageResult.Item);
            }
            // Get trust score
            const trustScoreCommand = new lib_dynamodb_1.GetCommand({
                TableName: TRUST_SCORES_TABLE_NAME,
                Key: {
                    propertyId: property.propertyId,
                },
            });
            const trustScoreResult = await docClient.send(trustScoreCommand);
            if (trustScoreResult.Item) {
                allTrustScores.push(trustScoreResult.Item);
            }
        }
        // 4. Get all notifications for the user
        const notificationsQuery = new lib_dynamodb_1.QueryCommand({
            TableName: NOTIFICATIONS_TABLE_NAME,
            IndexName: 'userId-createdAt-index',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId,
            },
        });
        const notificationsResult = await docClient.send(notificationsQuery);
        const notifications = notificationsResult.Items || [];
        // 5. Compile export data
        const exportData = {
            user: {
                userId: userData.userId,
                email: userData.email,
                phoneNumber: userData.phoneNumber,
                role: userData.role,
                status: userData.status,
                createdAt: userData.createdAt,
                lastLogin: userData.lastLogin,
            },
            properties: properties,
            documents: allDocuments,
            lineage: allLineage,
            trustScores: allTrustScores,
            notifications: notifications,
            exportedAt: new Date().toISOString(),
        };
        // 6. Store export in S3
        const exportKey = `exports/${userId}/user-data-${Date.now()}.json`;
        const exportJson = JSON.stringify(exportData, null, 2);
        const putCommand = new client_s3_1.PutObjectCommand({
            Bucket: DOCUMENT_BUCKET_NAME,
            Key: exportKey,
            Body: exportJson,
            ContentType: 'application/json',
            Metadata: {
                userId: userId,
                exportedAt: new Date().toISOString(),
            },
        });
        await s3Client.send(putCommand);
        // 7. Generate presigned URL (valid for 1 hour)
        const presignedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, new client_s3_1.PutObjectCommand({
            Bucket: DOCUMENT_BUCKET_NAME,
            Key: exportKey,
        }), { expiresIn: 3600 } // 1 hour
        );
        // Convert PUT presigned URL to GET presigned URL
        const getPresignedUrl = presignedUrl.replace('X-Amz-Algorithm', 'x-amz-algorithm');
        // 8. Log export event
        await (0, audit_1.createAuditLog)({
            userId: userId,
            action: audit_1.AuditAction.DATA_EXPORTED,
            resourceType: audit_1.ResourceType.USER,
            resourceId: userId,
            requestId: (0, audit_1.extractRequestId)(event),
            ipAddress: (0, audit_1.extractIpAddress)(event),
            userAgent: (0, audit_1.extractUserAgent)(event),
            metadata: {
                propertiesCount: properties.length,
                documentsCount: allDocuments.length,
                exportKey: exportKey,
            },
        });
        console.log(`User data export completed for: ${userId}`);
        // Prepare response
        const response = {
            message: 'User data exported successfully',
            downloadUrl: getPresignedUrl,
            expiresIn: 3600,
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
        console.error('User data export error:', error);
        // Generic error response
        return createErrorResponse(500, 'INTERNAL_ERROR', 'An error occurred while exporting user data. Please try again.');
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
//# sourceMappingURL=export-user-data.js.map