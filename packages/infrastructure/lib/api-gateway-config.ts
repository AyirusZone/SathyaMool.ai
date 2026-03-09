import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface ApiGatewayConfigProps {
  authorizerLambda: lambda.IFunction;
  userPool: cognito.IUserPool;
  // Auth endpoints
  registerLambda: lambda.IFunction;
  loginLambda: lambda.IFunction;
  verifyOtpLambda: lambda.IFunction;
  refreshTokenLambda: lambda.IFunction;
  // Property endpoints
  createPropertyLambda: lambda.IFunction;
  listPropertiesLambda: lambda.IFunction;
  getPropertyLambda: lambda.IFunction;
  deletePropertyLambda: lambda.IFunction;
  generateUploadUrlLambda: lambda.IFunction;
  registerDocumentLambda: lambda.IFunction;
  getLineageLambda: lambda.IFunction;
  getTrustScoreLambda: lambda.IFunction;
  generateReportLambda: lambda.IFunction;
  // Admin endpoints
  listUsersLambda: lambda.IFunction;
  updateUserRoleLambda: lambda.IFunction;
  deactivateUserLambda: lambda.IFunction;
  searchAuditLogsLambda: lambda.IFunction;
  exportAuditLogsLambda: lambda.IFunction;
  // User endpoints
  exportUserDataLambda: lambda.IFunction;
  getNotificationsLambda: lambda.IFunction;
}

export class ApiGatewayConfig extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly usagePlan: apigateway.UsagePlan;

  constructor(scope: Construct, id: string, props: ApiGatewayConfigProps) {
    super(scope, id);

    // Create CloudWatch Log Group for API Gateway access logs
    const accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: '/aws/apigateway/satyamool-api-access',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Create REST API with logging and tracing enabled
    this.api = new apigateway.RestApi(this, 'SatyaMoolApi', {
      restApiName: 'SatyaMool API',
      description: 'SatyaMool Property Verification Platform API',
      deployOptions: {
        stageName: 'v1',
        tracingEnabled: true, // Enable X-Ray tracing
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
        allowOrigins: apigateway.Cors.ALL_ORIGINS, // TODO: Restrict to specific domains in production
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

    // Create Lambda authorizer for JWT token validation
    const authorizer = new apigateway.TokenAuthorizer(this, 'JwtAuthorizer', {
      handler: props.authorizerLambda,
      identitySource: 'method.request.header.Authorization',
      authorizerName: 'SatyaMoolJwtAuthorizer',
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // Create request validators
    const bodyValidator = new apigateway.RequestValidator(this, 'BodyValidator', {
      restApi: this.api,
      requestValidatorName: 'body-validator',
      validateRequestBody: true,
      validateRequestParameters: false,
    });

    const paramsValidator = new apigateway.RequestValidator(this, 'ParamsValidator', {
      restApi: this.api,
      requestValidatorName: 'params-validator',
      validateRequestBody: false,
      validateRequestParameters: true,
    });

    // Define error response models
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
          details: {
            type: apigateway.JsonSchemaType.OBJECT,
            description: 'Additional error details',
          },
        },
        required: ['error', 'message'],
      },
    });

    // Configure gateway responses for standardized error handling
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

    this.api.addGatewayResponse('AccessDenied', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      statusCode: '403',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Content-Type': "'application/json'",
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'FORBIDDEN',
          message: 'Access denied',
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

    this.api.addGatewayResponse('BadRequestBody', {
      type: apigateway.ResponseType.BAD_REQUEST_BODY,
      statusCode: '400',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Content-Type': "'application/json'",
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'INVALID_REQUEST',
          message: 'Invalid request body',
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

    // ========== Property Endpoints (Protected) ==========
    const propertiesResource = this.api.root.addResource('properties');

    // POST /v1/properties
    propertiesResource.addMethod('POST', new apigateway.LambdaIntegration(props.createPropertyLambda), {
      authorizer,
      requestValidator: bodyValidator,
      methodResponses: [
        { statusCode: '201' },
        { statusCode: '400', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // GET /v1/properties
    propertiesResource.addMethod('GET', new apigateway.LambdaIntegration(props.listPropertiesLambda), {
      authorizer,
      requestParameters: {
        'method.request.querystring.status': false,
        'method.request.querystring.startDate': false,
        'method.request.querystring.endDate': false,
        'method.request.querystring.limit': false,
        'method.request.querystring.nextToken': false,
      },
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // Property by ID resource
    const propertyResource = propertiesResource.addResource('{id}');

    // GET /v1/properties/{id}
    propertyResource.addMethod('GET', new apigateway.LambdaIntegration(props.getPropertyLambda), {
      authorizer,
      requestParameters: {
        'method.request.path.id': true,
      },
      requestValidator: paramsValidator,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '403', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '404', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // DELETE /v1/properties/{id}
    propertyResource.addMethod('DELETE', new apigateway.LambdaIntegration(props.deletePropertyLambda), {
      authorizer,
      requestParameters: {
        'method.request.path.id': true,
      },
      requestValidator: paramsValidator,
      methodResponses: [
        { statusCode: '204' },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '403', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '404', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // POST /v1/properties/{id}/upload-url
    const uploadUrlResource = propertyResource.addResource('upload-url');
    uploadUrlResource.addMethod('POST', new apigateway.LambdaIntegration(props.generateUploadUrlLambda), {
      authorizer,
      requestValidator: bodyValidator,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '403', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // POST /v1/properties/{id}/documents
    const documentsResource = propertyResource.addResource('documents');
    documentsResource.addMethod('POST', new apigateway.LambdaIntegration(props.registerDocumentLambda), {
      authorizer,
      requestValidator: bodyValidator,
      methodResponses: [
        { statusCode: '201' },
        { statusCode: '400', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '403', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // GET /v1/properties/{id}/lineage
    const lineageResource = propertyResource.addResource('lineage');
    lineageResource.addMethod('GET', new apigateway.LambdaIntegration(props.getLineageLambda), {
      authorizer,
      requestParameters: {
        'method.request.path.id': true,
      },
      requestValidator: paramsValidator,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '403', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '404', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // GET /v1/properties/{id}/trust-score
    const trustScoreResource = propertyResource.addResource('trust-score');
    trustScoreResource.addMethod('GET', new apigateway.LambdaIntegration(props.getTrustScoreLambda), {
      authorizer,
      requestParameters: {
        'method.request.path.id': true,
      },
      requestValidator: paramsValidator,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '403', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '404', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // GET /v1/properties/{id}/report
    const reportResource = propertyResource.addResource('report');
    reportResource.addMethod('GET', new apigateway.LambdaIntegration(props.generateReportLambda), {
      authorizer,
      requestParameters: {
        'method.request.path.id': true,
      },
      requestValidator: paramsValidator,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '403', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '404', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // ========== Admin Endpoints (Protected - Admin Only) ==========
    const adminResource = this.api.root.addResource('admin');

    // GET /v1/admin/users
    const usersResource = adminResource.addResource('users');
    usersResource.addMethod('GET', new apigateway.LambdaIntegration(props.listUsersLambda), {
      authorizer,
      requestParameters: {
        'method.request.querystring.limit': false,
        'method.request.querystring.nextToken': false,
      },
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '403', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // PUT /v1/admin/users/{id}/role
    const userResource = usersResource.addResource('{id}');
    const roleResource = userResource.addResource('role');
    roleResource.addMethod('PUT', new apigateway.LambdaIntegration(props.updateUserRoleLambda), {
      authorizer,
      requestValidator: bodyValidator,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '403', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '404', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // PUT /v1/admin/users/{id}/deactivate
    const deactivateResource = userResource.addResource('deactivate');
    deactivateResource.addMethod('PUT', new apigateway.LambdaIntegration(props.deactivateUserLambda), {
      authorizer,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '403', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '404', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // GET /v1/admin/audit-logs
    const auditLogsResource = adminResource.addResource('audit-logs');
    auditLogsResource.addMethod('GET', new apigateway.LambdaIntegration(props.searchAuditLogsLambda), {
      authorizer,
      requestParameters: {
        'method.request.querystring.userId': false,
        'method.request.querystring.action': false,
        'method.request.querystring.resourceType': false,
        'method.request.querystring.startDate': false,
        'method.request.querystring.endDate': false,
        'method.request.querystring.limit': false,
        'method.request.querystring.nextToken': false,
      },
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '403', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // GET /v1/admin/audit-logs/export
    const exportAuditLogsResource = auditLogsResource.addResource('export');
    exportAuditLogsResource.addMethod('GET', new apigateway.LambdaIntegration(props.exportAuditLogsLambda), {
      authorizer,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '403', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // ========== User Endpoints (Protected) ==========
    const usersRootResource = this.api.root.addResource('users');

    // GET /v1/users/export
    const exportUserDataResource = usersRootResource.addResource('export');
    exportUserDataResource.addMethod('GET', new apigateway.LambdaIntegration(props.exportUserDataLambda), {
      authorizer,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // GET /v1/users/notifications
    const notificationsResource = usersRootResource.addResource('notifications');
    notificationsResource.addMethod('GET', new apigateway.LambdaIntegration(props.getNotificationsLambda), {
      authorizer,
      requestParameters: {
        'method.request.querystring.limit': false,
        'method.request.querystring.nextToken': false,
        'method.request.querystring.unreadOnly': false,
      },
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '401', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // ========== Usage Plan and Rate Limiting ==========
    // Create API key for usage plan
    const apiKey = this.api.addApiKey('SatyaMoolApiKey', {
      apiKeyName: 'SatyaMool-Default-Key',
      description: 'Default API key for SatyaMool',
    });

    // Create usage plan with rate limiting (100 requests per minute per user)
    this.usagePlan = this.api.addUsagePlan('SatyaMoolUsagePlan', {
      name: 'SatyaMool-Standard-Plan',
      description: 'Standard usage plan with rate limiting',
      throttle: {
        rateLimit: 100, // 100 requests per second
        burstLimit: 200, // Allow burst of 200 requests
      },
      quota: {
        limit: 100000, // 100,000 requests per month
        period: apigateway.Period.MONTH,
      },
    });

    // Associate usage plan with API stage
    this.usagePlan.addApiStage({
      stage: this.api.deploymentStage,
    });

    // Associate API key with usage plan
    this.usagePlan.addApiKey(apiKey);

    // Output API Gateway details
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
      exportName: 'SatyaMool-ApiUrl',
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      description: 'API Gateway ID',
      exportName: 'SatyaMool-ApiId',
    });

    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'API Key ID',
      exportName: 'SatyaMool-ApiKeyId',
    });
  }
}
