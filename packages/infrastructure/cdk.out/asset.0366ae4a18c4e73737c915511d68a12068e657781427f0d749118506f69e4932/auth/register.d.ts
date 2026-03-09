import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for user registration
 * Supports both email and phone number registration
 * Integrates with Cognito User Pool and DynamoDB Users table
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
