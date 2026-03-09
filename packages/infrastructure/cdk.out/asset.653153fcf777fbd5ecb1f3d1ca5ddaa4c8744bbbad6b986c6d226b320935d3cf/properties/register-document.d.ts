import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for registering uploaded documents with idempotency
 * Validates property exists, user has access, document was uploaded to S3
 * Stores document metadata in DynamoDB with initial status "pending"
 * Uses idempotency to prevent duplicate document registration
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
