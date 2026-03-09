import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for getting property details
 * Retrieves property metadata, document count, and processing status
 * Implements authorization check (user owns property or is admin)
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
