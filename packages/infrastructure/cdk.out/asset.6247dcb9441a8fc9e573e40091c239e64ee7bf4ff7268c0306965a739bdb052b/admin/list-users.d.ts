import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * List all users in the system (Admin only)
 * GET /v1/admin/users
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
