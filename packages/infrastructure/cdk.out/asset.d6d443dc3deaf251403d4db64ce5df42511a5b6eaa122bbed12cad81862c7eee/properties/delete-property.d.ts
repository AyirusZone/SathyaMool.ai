import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for deleting property
 * Marks documents for deletion in S3 (lifecycle policy handles actual deletion)
 * Removes metadata from DynamoDB tables
 * Logs deletion event to AuditLogs
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
