import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for property creation with idempotency
 * Creates a new property verification record in DynamoDB
 * Associates property with authenticated user from JWT claims
 * Uses idempotency to prevent duplicate property creation
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
