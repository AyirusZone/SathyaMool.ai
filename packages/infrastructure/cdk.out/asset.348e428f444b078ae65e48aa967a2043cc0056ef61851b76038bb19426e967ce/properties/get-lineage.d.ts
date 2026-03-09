import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for getting lineage graph data
 * Retrieves lineage graph and transforms it to React Flow compatible format
 * Implements authorization check (user owns property or is admin)
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
