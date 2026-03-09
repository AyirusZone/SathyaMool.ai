import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

export interface AuthLambdasProps {
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  usersTable: dynamodb.ITable;
  auditLogsTable: dynamodb.ITable;
  nodeLayer?: lambda.ILayerVersion;
}

export class AuthLambdas extends Construct {
  public readonly registerLambda: lambda.Function;
  public readonly loginLambda: lambda.Function;
  public readonly verifyOtpLambda: lambda.Function;
  public readonly refreshTokenLambda: lambda.Function;
  public readonly authorizerLambda: lambda.Function;

  constructor(scope: Construct, id: string, props: AuthLambdasProps) {
    super(scope, id);

    // Common environment variables for all auth Lambdas
    const commonEnv = {
      USER_POOL_ID: props.userPool.userPoolId,
      USER_POOL_CLIENT_ID: props.userPoolClient.userPoolClientId,
      USERS_TABLE_NAME: props.usersTable.tableName,
      AUDIT_LOGS_TABLE_NAME: props.auditLogsTable.tableName,
    };

    // Common Lambda configuration
    const commonConfig = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      layers: props.nodeLayer ? [props.nodeLayer] : [],
      tracing: lambda.Tracing.ACTIVE,
      logRetention: 7, // 7 days for development
    };

    // Register Lambda
    this.registerLambda = new lambda.Function(this, 'RegisterFunction', {
      ...commonConfig,
      functionName: 'SatyaMool-Auth-Register',
      description: 'Handle user registration with email/phone',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      handler: 'auth/register.handler',
    });

    // Login Lambda
    this.loginLambda = new lambda.Function(this, 'LoginFunction', {
      ...commonConfig,
      functionName: 'SatyaMool-Auth-Login',
      description: 'Handle user login and issue JWT tokens',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      handler: 'auth/login.handler',
    });

    // Verify OTP Lambda
    this.verifyOtpLambda = new lambda.Function(this, 'VerifyOtpFunction', {
      ...commonConfig,
      functionName: 'SatyaMool-Auth-VerifyOtp',
      description: 'Verify phone OTP and complete registration',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      handler: 'auth/verify-otp.handler',
    });

    // Refresh Token Lambda
    this.refreshTokenLambda = new lambda.Function(this, 'RefreshTokenFunction', {
      ...commonConfig,
      functionName: 'SatyaMool-Auth-RefreshToken',
      description: 'Refresh JWT access tokens',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      handler: 'auth/refresh-token.handler',
    });

    // Lambda Authorizer
    this.authorizerLambda = new lambda.Function(this, 'AuthorizerFunction', {
      ...commonConfig,
      functionName: 'SatyaMool-Auth-Authorizer',
      description: 'Validate JWT tokens and enforce RBAC',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      handler: 'authorizer/index.handler',
    });

    // Grant Cognito permissions to all auth Lambdas
    const cognitoPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:AdminInitiateAuth',
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:AdminGetUser',
        'cognito-idp:InitiateAuth',
        'cognito-idp:GetUser',
        'cognito-idp:SignUp',
        'cognito-idp:ConfirmSignUp',
        'cognito-idp:ResendConfirmationCode',
      ],
      resources: [props.userPool.userPoolArn],
    });

    this.registerLambda.addToRolePolicy(cognitoPolicy);
    this.loginLambda.addToRolePolicy(cognitoPolicy);
    this.verifyOtpLambda.addToRolePolicy(cognitoPolicy);
    this.refreshTokenLambda.addToRolePolicy(cognitoPolicy);
    this.authorizerLambda.addToRolePolicy(cognitoPolicy);

    // Grant DynamoDB permissions
    props.usersTable.grantReadWriteData(this.registerLambda);
    props.usersTable.grantReadWriteData(this.loginLambda);
    props.usersTable.grantReadWriteData(this.verifyOtpLambda);
    props.usersTable.grantReadWriteData(this.refreshTokenLambda);
    props.usersTable.grantReadData(this.authorizerLambda);

    props.auditLogsTable.grantWriteData(this.registerLambda);
    props.auditLogsTable.grantWriteData(this.loginLambda);
    props.auditLogsTable.grantWriteData(this.verifyOtpLambda);
    props.auditLogsTable.grantWriteData(this.refreshTokenLambda);

    // Outputs
    new cdk.CfnOutput(this, 'RegisterLambdaArn', {
      value: this.registerLambda.functionArn,
      description: 'Register Lambda Function ARN',
      exportName: 'SatyaMool-RegisterLambdaArn',
    });

    new cdk.CfnOutput(this, 'LoginLambdaArn', {
      value: this.loginLambda.functionArn,
      description: 'Login Lambda Function ARN',
      exportName: 'SatyaMool-LoginLambdaArn',
    });

    new cdk.CfnOutput(this, 'VerifyOtpLambdaArn', {
      value: this.verifyOtpLambda.functionArn,
      description: 'Verify OTP Lambda Function ARN',
      exportName: 'SatyaMool-VerifyOtpLambdaArn',
    });

    new cdk.CfnOutput(this, 'RefreshTokenLambdaArn', {
      value: this.refreshTokenLambda.functionArn,
      description: 'Refresh Token Lambda Function ARN',
      exportName: 'SatyaMool-RefreshTokenLambdaArn',
    });

    new cdk.CfnOutput(this, 'AuthorizerLambdaArn', {
      value: this.authorizerLambda.functionArn,
      description: 'Authorizer Lambda Function ARN',
      exportName: 'SatyaMool-AuthorizerLambdaArn',
    });
  }
}
