import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
export interface ApiGatewayConfigProps {
    authorizerLambda: lambda.IFunction;
    userPool: cognito.IUserPool;
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
    getLineageLambda: lambda.IFunction;
    getTrustScoreLambda: lambda.IFunction;
    generateReportLambda: lambda.IFunction;
    listUsersLambda: lambda.IFunction;
    updateUserRoleLambda: lambda.IFunction;
    deactivateUserLambda: lambda.IFunction;
    searchAuditLogsLambda: lambda.IFunction;
    exportAuditLogsLambda: lambda.IFunction;
    exportUserDataLambda: lambda.IFunction;
    getNotificationsLambda: lambda.IFunction;
}
export declare class ApiGatewayConfig extends Construct {
    readonly api: apigateway.RestApi;
    readonly usagePlan: apigateway.UsagePlan;
    constructor(scope: Construct, id: string, props: ApiGatewayConfigProps);
}
