import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
export interface AuthLambdasProps {
    userPool: cognito.IUserPool;
    userPoolClient: cognito.IUserPoolClient;
    usersTable: dynamodb.ITable;
    auditLogsTable: dynamodb.ITable;
    nodeLayer?: lambda.ILayerVersion;
}
export declare class AuthLambdas extends Construct {
    readonly registerLambda: lambda.Function;
    readonly loginLambda: lambda.Function;
    readonly verifyOtpLambda: lambda.Function;
    readonly refreshTokenLambda: lambda.Function;
    readonly authorizerLambda: lambda.Function;
    constructor(scope: Construct, id: string, props: AuthLambdasProps);
}
