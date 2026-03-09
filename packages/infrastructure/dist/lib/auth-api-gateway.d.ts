import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
export interface AuthApiGatewayProps {
    registerLambda: lambda.IFunction;
    loginLambda: lambda.IFunction;
    verifyOtpLambda: lambda.IFunction;
    refreshTokenLambda: lambda.IFunction;
}
export declare class AuthApiGateway extends Construct {
    readonly api: apigateway.RestApi;
    constructor(scope: Construct, id: string, props: AuthApiGatewayProps);
}
