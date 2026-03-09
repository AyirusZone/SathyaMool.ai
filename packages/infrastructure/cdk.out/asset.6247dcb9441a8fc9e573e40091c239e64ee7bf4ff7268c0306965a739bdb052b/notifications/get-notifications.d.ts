import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Get notification history for authenticated user
 * GET /v1/notifications
 * Query parameters:
 * - limit: number of notifications to return (default: 50, max: 100)
 * - unreadOnly: filter for unread notifications only (default: false)
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
/**
 * Mark notification as read
 * PUT /v1/notifications/{notificationId}/read
 */
export declare const markAsReadHandler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
