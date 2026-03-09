import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface MainApiGatewayProps {
  authorizerLambda: lambda.IFunction;
  // Auth Lambdas
  registerLambda: lambda.IFunction;
  loginLambda: lambda.IFunction;
  verifyOtpLambda: lambda.IFunction;
  refreshTokenLambda: lambda.IFunction;
  // Property Lambdas
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
  // Notification Lambda
  getNotificationsLambda: lambda.IFunction;
}

export class MainApiGateway extends Construct {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: MainApiGatewayProps) {
    super(scope, id);

    // Create CloudWatch Log Group
    const accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: '/aws/apigateway/satyamool-main-api-access',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create REST API
    this.api = new apigateway.RestApi(this, 'SatyaMoolMainApi', {
      restApiName: 'SatyaMool Main API',
      description: 'SatyaMool Property Management API',
      deployOptions: {
        stageName: 'v1',
        tracingEnabled: true,
        dataTraceEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        metricsEnabled: true,
        accessLogDestination: new apigateway.LogGroupLogDestination(accessLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
        allowCredentials: true,
        maxAge: cdk.Duration.hours(1),
      },
      cloudWatchRole: true,
    });

    // Create Lambda Authorizer
    const authorizer = new apigateway.TokenAuthorizer(this, 'JwtAuthorizer', {
      handler: props.authorizerLambda,
      identitySource: 'method.request.header.Authorization',
      authorizerName: 'jwt-authorizer',
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // ========== Auth Endpoints (No Authorization Required) ==========
    const authResource = this.api.root.addResource('auth');

    // POST /v1/auth/register
    const registerResource = authResource.addResource('register');
    registerResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.registerLambda)
    );

    // POST /v1/auth/login
    const loginResource = authResource.addResource('login');
    loginResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.loginLambda)
    );

    // POST /v1/auth/verify-otp
    const verifyOtpResource = authResource.addResource('verify-otp');
    verifyOtpResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.verifyOtpLambda)
    );

    // POST /v1/auth/refresh
    const refreshResource = authResource.addResource('refresh');
    refreshResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.refreshTokenLambda)
    );

    // ========== Properties Endpoints ==========
    const propertiesResource = this.api.root.addResource('properties');

    // POST /v1/properties - Create property
    propertiesResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.createPropertyLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      }
    );

    // GET /v1/properties - List properties
    propertiesResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.listPropertiesLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      }
    );

    // GET /v1/properties/{propertyId}
    const propertyResource = propertiesResource.addResource('{propertyId}');
    propertyResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.getPropertyLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      }
    );

    // DELETE /v1/properties/{propertyId}
    propertyResource.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(props.deletePropertyLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      }
    );

    // GET /v1/properties/{propertyId}/lineage
    const lineageResource = propertyResource.addResource('lineage');
    lineageResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.getLineageLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      }
    );

    // GET /v1/properties/{propertyId}/trust-score
    const trustScoreResource = propertyResource.addResource('trust-score');
    trustScoreResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.getTrustScoreLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      }
    );

    // POST /v1/properties/{propertyId}/report
    const reportResource = propertyResource.addResource('report');
    reportResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.generateReportLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      }
    );

    // POST /v1/properties/{propertyId}/upload-url
    const uploadUrlResource = propertyResource.addResource('upload-url');
    uploadUrlResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.generateUploadUrlLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      }
    );

    // POST /v1/properties/{propertyId}/documents - Register document
    const documentsResource = propertyResource.addResource('documents');
    documentsResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.registerDocumentLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      }
    );

    // GET /v1/properties/{propertyId}/documents - Get documents
    documentsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.getDocumentsLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      }
    );

    // ========== Notifications Endpoint ==========
    const notificationsResource = this.api.root.addResource('notifications');

    // GET /v1/notifications - Get user notifications
    notificationsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.getNotificationsLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      }
    );

    // Outputs
    new cdk.CfnOutput(this, 'MainApiUrl', {
      value: this.api.url,
      description: 'Main API Gateway URL',
      exportName: 'SatyaMool-MainApiUrl',
    });

    new cdk.CfnOutput(this, 'MainApiId', {
      value: this.api.restApiId,
      description: 'Main API Gateway ID',
      exportName: 'SatyaMool-MainApiId',
    });
  }
}
