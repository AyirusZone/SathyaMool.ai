/**
 * Lambda handler for exporting audit logs
 * Admin-only endpoint that generates JSON export and stores in S3
 *
 * Requirements: 17.9
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for exporting audit logs
 * Generates JSON format export, stores in S3, returns presigned URL
 * Requires Admin_User role
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
