import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
export interface MainApiGatewayProps {
    authorizerLambda: lambda.IFunction;
    registerLambda: lambda.IFunction;
    loginLambda: lambda.IFunction;
    verifyOtpLambda: lambda.IFunction;
    refreshTokenLambda: lambda.IFunction;
    createPropertyLambda: lambda.IFunction;
    listPropertiesLambda: lambda.IFunction;
    getPropertyLambda: lambda.IFunction;
    deletePropertyLambda: lambda.IFunction;
    generateUploadUrlLambda: lambda.IFunction;
    registerDocumentLambda: lambda.IFunction;
    getDocumentsLambda: lambda.IFunction;
    getLineageLambda: lambda.IFunction;
    getTrustScoreLambda: lambda.IFunction;
    generateReportLambda: lambda.IFunction;
    getNotificationsLambda: lambda.IFunction;
}
export declare class MainApiGateway extends Construct {
    readonly api: apigateway.RestApi;
    constructor(scope: Construct, id: string, props: MainApiGatewayProps);
}
