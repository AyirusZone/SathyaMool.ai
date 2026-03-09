import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface AuthApiGatewayProps {
  registerLambda: lambda.IFunction;
  loginLambda: lambda.IFunction;
  verifyOtpLambda: lambda.IFunction;
  refreshTokenLambda: lambda.IFunction;
}

export class AuthApiGateway extends Construct {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: AuthApiGatewayProps) {
    super(scope, id);

    // Create CloudWatch Log Group for API Gateway access logs
    const accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: '/aws/apigateway/satyamool-auth-api-access',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create REST API
    this.api = new apigateway.RestApi(this, 'SatyaMoolAuthApi', {
      restApiName: 'SatyaMool Auth API',
      description: 'SatyaMool Authentication API',
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

    // Create request validator
    const bodyValidator = new apigateway.RequestValidator(this, 'BodyValidator', {
      restApi: this.api,
      requestValidatorName: 'body-validator',
      validateRequestBody: true,
      validateRequestParameters: false,
    });

    // Define error response model
    const errorResponseModel = this.api.addModel('ErrorResponse', {
      contentType: 'application/json',
      modelName: 'ErrorResponse',
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT4,
        title: 'Error Response',
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          error: {
            type: apigateway.JsonSchemaType.STRING,
            description: 'Error code',
          },
          message: {
            type: apigateway.JsonSchemaType.STRING,
            description: 'User-friendly error message',
          },
        },
        required: ['error', 'message'],
      },
    });

    // Configure gateway responses
    this.api.addGatewayResponse('Unauthorized', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      statusCode: '401',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Content-Type': "'application/json'",
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'UNAUTHORIZED',
          message: 'Authentication required',
        }),
      },
    });

    this.api.addGatewayResponse('Throttled', {
      type: apigateway.ResponseType.THROTTLED,
      statusCode: '429',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Content-Type': "'application/json'",
        'Retry-After': "'60'",
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded. Please retry after 60 seconds.',
        }),
      },
    });

    this.api.addGatewayResponse('Default4XX', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Content-Type': "'application/json'",
      },
    });

    this.api.addGatewayResponse('Default5XX', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Content-Type': "'application/json'",
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'INTERNAL_SERVER_ERROR',
          message: 'An internal server error occurred',
        }),
      },
    });

    // ========== Auth Endpoints (Public - No Authorizer) ==========
    const authResource = this.api.root.addResource('auth');

    // POST /v1/auth/register
    const registerResource = authResource.addResource('register');
    registerResource.addMethod('POST', new apigateway.LambdaIntegration(props.registerLambda), {
      requestValidator: bodyValidator,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // POST /v1/auth/login
    const loginResource = authResource.addResource('login');
    loginResource.addMethod('POST', new apigateway.LambdaIntegration(props.loginLambda), {
      requestValidator: bodyValidator,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // POST /v1/auth/verify-otp
    const verifyOtpResource = authResource.addResource('verify-otp');
    verifyOtpResource.addMethod('POST', new apigateway.LambdaIntegration(props.verifyOtpLambda), {
      requestValidator: bodyValidator,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // POST /v1/auth/refresh
    const refreshResource = authResource.addResource('refresh');
    refreshResource.addMethod('POST', new apigateway.LambdaIntegration(props.refreshTokenLambda), {
      requestValidator: bodyValidator,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // ========== Usage Plan and Rate Limiting ==========
    const apiKey = this.api.addApiKey('SatyaMoolAuthApiKey', {
      apiKeyName: 'SatyaMool-Auth-Key',
      description: 'API key for SatyaMool Auth API',
    });

    const usagePlan = this.api.addUsagePlan('SatyaMoolAuthUsagePlan', {
      name: 'SatyaMool-Auth-Plan',
      description: 'Usage plan with rate limiting for auth endpoints',
      throttle: {
        rateLimit: 100,
        burstLimit: 200,
      },
      quota: {
        limit: 100000,
        period: apigateway.Period.MONTH,
      },
    });

    usagePlan.addApiStage({
      stage: this.api.deploymentStage,
    });

    usagePlan.addApiKey(apiKey);

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'Auth API Gateway URL',
      exportName: 'SatyaMool-AuthApiUrl',
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      description: 'Auth API Gateway ID',
      exportName: 'SatyaMool-AuthApiId',
    });
  }
}
