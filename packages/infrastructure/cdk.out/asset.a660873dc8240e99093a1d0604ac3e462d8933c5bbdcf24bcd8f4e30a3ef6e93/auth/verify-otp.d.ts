import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Lambda handler for OTP verification
 * Verifies phone OTP and completes user registration
 * Requirement 1.3: Verify OTP before account creation
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
