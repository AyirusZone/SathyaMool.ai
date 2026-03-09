/**
 * Lambda handler for searching and filtering audit logs
 * Admin-only endpoint with pagination support
 *
 * Requirements: 17.8
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for searching audit logs
 * Supports filtering by user, action, resource type, and date range
 * Implements pagination for large result sets
 * Requires Admin_User role
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
