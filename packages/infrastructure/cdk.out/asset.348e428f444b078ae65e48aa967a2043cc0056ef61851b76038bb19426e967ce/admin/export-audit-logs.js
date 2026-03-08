"use strict";
/**
 * Lambda handler for exporting audit logs
 * Admin-only endpoint that generates JSON export and stores in S3
 *
 * Requirements: 17.9
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const uuid_1 = require("uuid");
const audit_1 = require("../audit");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
});
const AUDIT_LOGS_TABLE = process.env.AUDIT_LOGS_TABLE || 'AuditLogs';
const EXPORT_BUCKET = process.env.EXPORT_BUCKET || 'satyamool-exports';
/**
 * Lambda handler for exporting audit logs
 * Generates JSON format export, stores in S3, returns presigned URL
 * Requires Admin_User role
 */
const handler = async (event) => {
    console.log('Export audit logs request received:', JSON.stringify(event, null, 2));
    try {
        // Extract userId and role from authorizer context
        // The authorizer puts userId and role in the context, not in claims
        const userId = event.requestContext.authorizer?.userId || event.requestContext.authorizer?.claims?.sub;
        const userRole = event.requestContext.authorizer?.role || event.requestContext.authorizer?.claims?.['custom:role'];
        if (!userId) {
            return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
        }
        // Check if user is admin
        if (userRole !== 'Admin_User') {
            return createErrorResponse(403, 'FORBIDDEN', 'Only administrators can export audit logs');
        }
        // Parse query parameters for filtering
        const queryParams = event.queryStringParameters || {};
        const filterUserId = queryParams.userId;
        const filterAction = queryParams.action;
        const filterResourceType = queryParams.resourceType;
        const startDate = queryParams.startDate;
        const endDate = queryParams.endDate;
        // Build filter expression
        const filterExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        if (filterUserId) {
            filterExpressions.push('#userId = :userId');
            expressionAttributeNames['#userId'] = 'userId';
            expressionAttributeValues[':userId'] = filterUserId;
        }
        if (filterAction) {
            filterExpressions.push('#action = :action');
            expressionAttributeNames['#action'] = 'action';
            expressionAttributeValues[':action'] = filterAction;
        }
        if (filterResourceType) {
            filterExpressions.push('#resourceType = :resourceType');
            expressionAttributeNames['#resourceType'] = 'resourceType';
            expressionAttributeValues[':resourceType'] = filterResourceType;
        }
        if (startDate) {
            filterExpressions.push('#timestamp >= :startDate');
            expressionAttributeNames['#timestamp'] = 'timestamp';
            expressionAttributeValues[':startDate'] = startDate;
        }
        if (endDate) {
            filterExpressions.push('#timestamp <= :endDate');
            expressionAttributeNames['#timestamp'] = 'timestamp';
            expressionAttributeValues[':endDate'] = endDate;
        }
        // Collect all audit logs (paginate through all results)
        const allLogs = [];
        let lastEvaluatedKey = undefined;
        // If userId filter is provided, use GSI query for better performance
        if (filterUserId) {
            do {
                const queryCommand = new lib_dynamodb_1.QueryCommand({
                    TableName: AUDIT_LOGS_TABLE,
                    IndexName: 'userId-timestamp-index',
                    KeyConditionExpression: '#userId = :userId' +
                        (startDate && endDate ? ' AND #timestamp BETWEEN :startDate AND :endDate' :
                            startDate ? ' AND #timestamp >= :startDate' :
                                endDate ? ' AND #timestamp <= :endDate' : ''),
                    ExpressionAttributeNames: expressionAttributeNames,
                    ExpressionAttributeValues: expressionAttributeValues,
                    FilterExpression: filterExpressions.length > 1 ?
                        filterExpressions.slice(1).join(' AND ') : undefined,
                    ExclusiveStartKey: lastEvaluatedKey,
                });
                const result = await docClient.send(queryCommand);
                allLogs.push(...(result.Items || []));
                lastEvaluatedKey = result.LastEvaluatedKey;
            } while (lastEvaluatedKey);
        }
        else {
            // Use scan for other filters
            do {
                const scanCommand = new lib_dynamodb_1.ScanCommand({
                    TableName: AUDIT_LOGS_TABLE,
                    FilterExpression: filterExpressions.length > 0 ?
                        filterExpressions.join(' AND ') : undefined,
                    ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ?
                        expressionAttributeNames : undefined,
                    ExpressionAttributeValues: Object.keys(expressionAttributeValues).length > 0 ?
                        expressionAttributeValues : undefined,
                    ExclusiveStartKey: lastEvaluatedKey,
                });
                const result = await docClient.send(scanCommand);
                allLogs.push(...(result.Items || []));
                lastEvaluatedKey = result.LastEvaluatedKey;
            } while (lastEvaluatedKey);
        }
        // Sort by timestamp descending
        allLogs.sort((a, b) => {
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
        // Generate export file
        const exportId = (0, uuid_1.v4)();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `audit-logs-export-${timestamp}-${exportId}.json`;
        const s3Key = `exports/audit-logs/${fileName}`;
        // Create export data with metadata
        const exportData = {
            exportId: exportId,
            exportedAt: new Date().toISOString(),
            exportedBy: userId,
            filters: {
                userId: filterUserId,
                action: filterAction,
                resourceType: filterResourceType,
                startDate: startDate,
                endDate: endDate,
            },
            recordCount: allLogs.length,
            logs: allLogs,
        };
        // Upload to S3
        const putCommand = new client_s3_1.PutObjectCommand({
            Bucket: EXPORT_BUCKET,
            Key: s3Key,
            Body: JSON.stringify(exportData, null, 2),
            ContentType: 'application/json',
            Metadata: {
                exportId: exportId,
                exportedBy: userId,
                recordCount: allLogs.length.toString(),
            },
        });
        await s3Client.send(putCommand);
        // Generate presigned URL (valid for 1 hour)
        const downloadUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, new client_s3_1.PutObjectCommand({
            Bucket: EXPORT_BUCKET,
            Key: s3Key,
        }), { expiresIn: 3600 });
        // Log audit log export event
        await (0, audit_1.createAuditLog)({
            userId: userId,
            action: audit_1.AuditAction.AUDIT_LOGS_EXPORTED,
            resourceType: audit_1.ResourceType.AUDIT_LOG,
            resourceId: exportId,
            requestId: (0, audit_1.extractRequestId)(event),
            ipAddress: (0, audit_1.extractIpAddress)(event),
            userAgent: (0, audit_1.extractUserAgent)(event),
            metadata: {
                filters: {
                    userId: filterUserId,
                    action: filterAction,
                    resourceType: filterResourceType,
                    startDate: startDate,
                    endDate: endDate,
                },
                recordCount: allLogs.length,
                s3Key: s3Key,
            },
        });
        console.log(`Audit logs exported: ${allLogs.length} records, exportId: ${exportId}`);
        // Prepare response
        const response = {
            exportId: exportId,
            downloadUrl: downloadUrl,
            expiresIn: 3600,
            recordCount: allLogs.length,
            message: `Successfully exported ${allLogs.length} audit log records`,
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
        console.error('Export audit logs error:', error);
        return createErrorResponse(500, 'INTERNAL_ERROR', 'An error occurred while exporting audit logs. Please try again.');
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
//# sourceMappingURL=export-audit-logs.js.map