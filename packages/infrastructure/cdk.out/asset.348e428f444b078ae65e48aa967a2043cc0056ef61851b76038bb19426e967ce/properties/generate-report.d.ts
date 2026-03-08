import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for generating PDF reports
 * Generates PDF report on demand with property data, lineage graph, and Trust Score
 * Stores PDF in S3 with 7-day expiration and returns presigned URL (15-minute expiration)
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
