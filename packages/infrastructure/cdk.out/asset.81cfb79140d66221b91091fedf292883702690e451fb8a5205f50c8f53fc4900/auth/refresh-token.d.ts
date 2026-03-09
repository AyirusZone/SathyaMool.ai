import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for token refresh
 * Validates refresh tokens and issues new access tokens
 * Requirement 1.8: Automatically refresh JWT tokens before expiration during active sessions
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
