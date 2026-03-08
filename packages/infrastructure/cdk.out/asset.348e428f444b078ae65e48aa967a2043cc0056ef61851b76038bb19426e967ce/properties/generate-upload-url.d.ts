import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for generating S3 presigned URLs for document upload
 * Validates property exists, user has access, file format, and file size
 * Returns presigned URL with 15-minute expiration
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
