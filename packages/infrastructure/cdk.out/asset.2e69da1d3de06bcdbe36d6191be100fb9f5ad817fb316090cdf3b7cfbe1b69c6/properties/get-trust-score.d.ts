import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for getting Trust Score
 * Retrieves Trust Score and breakdown with explanations
 * Implements authorization check (user owns property or is admin)
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
