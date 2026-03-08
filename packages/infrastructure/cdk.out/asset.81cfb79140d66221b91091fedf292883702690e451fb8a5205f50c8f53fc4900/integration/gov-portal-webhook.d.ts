/**
 * Government Portal Webhook Handler
 *
 * Receives asynchronous responses from government portals for EC retrieval.
 * Validates requests, authenticates sources, and stores responses for processing.
 *
 * Requirements: 19.5, 19.6, 19.7
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for government portal webhook
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
