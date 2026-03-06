"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAsReadHandler = exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE_NAME || 'SatyaMool-Notifications';
/**
 * Get notification history for authenticated user
 * GET /v1/notifications
 * Query parameters:
 * - limit: number of notifications to return (default: 50, max: 100)
 * - unreadOnly: filter for unread notifications only (default: false)
 */
const handler = async (event) => {
    console.log('Get notifications request:', JSON.stringify(event, null, 2));
    try {
        // Extract userId from authorizer context
        const userId = event.requestContext.authorizer?.claims?.sub;
        if (!userId) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    error: 'Unauthorized',
                    message: 'User ID not found in request context',
                }),
            };
        }
        // Parse query parameters
        const limit = Math.min(parseInt(event.queryStringParameters?.limit || '50'), 100);
        const unreadOnly = event.queryStringParameters?.unreadOnly === 'true';
        // Query notifications for user
        const command = new lib_dynamodb_1.QueryCommand({
            TableName: NOTIFICATIONS_TABLE,
            IndexName: 'userId-createdAt-index',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId,
            },
            ScanIndexForward: false, // Sort by createdAt descending (newest first)
            Limit: limit,
        });
        const response = await docClient.send(command);
        let notifications = (response.Items || []);
        // Filter for unread only if requested
        if (unreadOnly) {
            notifications = notifications.filter(n => !n.read);
        }
        // Count unread notifications
        const unreadCount = notifications.filter(n => !n.read).length;
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                notifications,
                unreadCount,
                total: notifications.length,
            }),
        };
    }
    catch (error) {
        console.error('Error getting notifications:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                error: 'InternalServerError',
                message: 'Failed to retrieve notifications',
            }),
        };
    }
};
exports.handler = handler;
/**
 * Mark notification as read
 * PUT /v1/notifications/{notificationId}/read
 */
const markAsReadHandler = async (event) => {
    console.log('Mark notification as read request:', JSON.stringify(event, null, 2));
    try {
        // Extract userId from authorizer context
        const userId = event.requestContext.authorizer?.claims?.sub;
        if (!userId) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    error: 'Unauthorized',
                    message: 'User ID not found in request context',
                }),
            };
        }
        // Extract notificationId from path parameters
        const notificationId = event.pathParameters?.notificationId;
        if (!notificationId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    error: 'BadRequest',
                    message: 'Notification ID is required',
                }),
            };
        }
        // Update notification read status
        const command = new lib_dynamodb_1.UpdateCommand({
            TableName: NOTIFICATIONS_TABLE,
            Key: {
                notificationId,
                userId,
            },
            UpdateExpression: 'SET #read = :read, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#read': 'read',
            },
            ExpressionAttributeValues: {
                ':read': true,
                ':updatedAt': new Date().toISOString(),
            },
            ConditionExpression: 'userId = :userId', // Ensure user owns the notification
            ReturnValues: 'ALL_NEW',
        });
        const response = await docClient.send(command);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                notification: response.Attributes,
            }),
        };
    }
    catch (error) {
        console.error('Error marking notification as read:', error);
        if (error.name === 'ConditionalCheckFailedException') {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    error: 'NotFound',
                    message: 'Notification not found or access denied',
                }),
            };
        }
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                error: 'InternalServerError',
                message: 'Failed to update notification',
            }),
        };
    }
};
exports.markAsReadHandler = markAsReadHandler;
//# sourceMappingURL=get-notifications.js.map