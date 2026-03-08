import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for exporting all user data
 * Generates JSON format with all properties and documents
 * Stores export in S3 with presigned URL
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
