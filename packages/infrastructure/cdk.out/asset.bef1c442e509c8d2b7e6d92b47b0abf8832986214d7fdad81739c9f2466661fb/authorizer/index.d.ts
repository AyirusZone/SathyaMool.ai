import { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
/**
 * Lambda authorizer handler
 */
export declare function handler(event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult>;
