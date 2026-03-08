import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for user login
 * Authenticates users via Cognito and issues JWT tokens with role claims
 * Logs authentication events to AuditLogs table
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
