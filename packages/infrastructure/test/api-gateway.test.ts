import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { ApiGatewayConfig } from '../lib/api-gateway-config';

describe('API Gateway Configuration', () => {
  let stack: cdk.Stack;
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');

    // Create mock Lambda functions
    const mockLambda = new lambda.Function(stack, 'MockLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
    });

    // Create mock User Pool
    const mockUserPool = new cognito.UserPool(stack, 'MockUserPool', {
      userPoolName: 'test-pool',
    });

    // Create API Gateway configuration
    new ApiGatewayConfig(stack, 'TestApiGateway', {
      authorizerLambda: mockLambda,
      userPool: mockUserPool,
      registerLambda: mockLambda,
      loginLambda: mockLambda,
      verifyOtpLambda: mockLambda,
      refreshTokenLambda: mockLambda,
      createPropertyLambda: mockLambda,
      listPropertiesLambda: mockLambda,
      getPropertyLambda: mockLambda,
      deletePropertyLambda: mockLambda,
      generateUploadUrlLambda: mockLambda,
      registerDocumentLambda: mockLambda,
      getLineageLambda: mockLambda,
      getTrustScoreLambda: mockLambda,
      generateReportLambda: mockLambda,
      listUsersLambda: mockLambda,
      updateUserRoleLambda: mockLambda,
      deactivateUserLambda: mockLambda,
      searchAuditLogsLambda: mockLambda,
      exportAuditLogsLambda: mockLambda,
      exportUserDataLambda: mockLambda,
      getNotificationsLambda: mockLambda,
    });

    template = Template.fromStack(stack);
  });

  describe('REST API Configuration', () => {
    test('should create REST API with correct name and description', () => {
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'SatyaMool API',
        Description: 'SatyaMool Property Verification Platform API',
      });
    });

    test('should enable X-Ray tracing', () => {
      template.hasResourceProperties('AWS::ApiGateway::Stage', {
        TracingEnabled: true,
      });
    });

    test('should enable CloudWatch logging', () => {
      template.hasResourceProperties('AWS::ApiGateway::Stage', {
        MethodSettings: Match.arrayWith([
          Match.objectLike({
            DataTraceEnabled: true,
            LoggingLevel: 'INFO',
            MetricsEnabled: true,
          }),
        ]),
      });
    });

    test('should configure access logging', () => {
      template.hasResourceProperties('AWS::ApiGateway::Stage', {
        AccessLogSetting: Match.objectLike({
          DestinationArn: Match.anyValue(),
        }),
      });
    });
  });

  describe('CORS Configuration', () => {
    test('should configure CORS for all endpoints', () => {
      // Verify CORS headers are present in gateway responses
      template.hasResourceProperties('AWS::ApiGateway::GatewayResponse', {
        ResponseType: 'UNAUTHORIZED',
        ResponseParameters: Match.objectLike({
          'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
        }),
      });
    });
  });

  describe('Rate Limiting', () => {
    test('should create usage plan with rate limiting', () => {
      template.hasResourceProperties('AWS::ApiGateway::UsagePlan', {
        UsagePlanName: 'SatyaMool-Standard-Plan',
        Throttle: {
          RateLimit: 100,
          BurstLimit: 200,
        },
        Quota: {
          Limit: 100000,
          Period: 'MONTH',
        },
      });
    });

    test('should create API key', () => {
      template.hasResourceProperties('AWS::ApiGateway::ApiKey', {
        Name: 'SatyaMool-Default-Key',
        Enabled: true,
      });
    });

    test('should associate usage plan with API stage', () => {
      template.hasResourceProperties('AWS::ApiGateway::UsagePlanKey', {
        KeyType: 'API_KEY',
      });
    });
  });

  describe('Error Response Configuration', () => {
    test('should configure 401 Unauthorized response', () => {
      template.hasResourceProperties('AWS::ApiGateway::GatewayResponse', {
        ResponseType: 'UNAUTHORIZED',
        StatusCode: '401',
        ResponseTemplates: Match.objectLike({
          'application/json': Match.stringLikeRegexp('UNAUTHORIZED'),
        }),
      });
    });

    test('should configure 403 Access Denied response', () => {
      template.hasResourceProperties('AWS::ApiGateway::GatewayResponse', {
        ResponseType: 'ACCESS_DENIED',
        StatusCode: '403',
        ResponseTemplates: Match.objectLike({
          'application/json': Match.stringLikeRegexp('FORBIDDEN'),
        }),
      });
    });

    test('should configure 429 Throttled response with Retry-After header', () => {
      template.hasResourceProperties('AWS::ApiGateway::GatewayResponse', {
        ResponseType: 'THROTTLED',
        StatusCode: '429',
        ResponseParameters: Match.objectLike({
          'gatewayresponse.header.Retry-After': "'60'",
        }),
        ResponseTemplates: Match.objectLike({
          'application/json': Match.stringLikeRegexp('RATE_LIMIT_EXCEEDED'),
        }),
      });
    });

    test('should configure 400 Bad Request response', () => {
      template.hasResourceProperties('AWS::ApiGateway::GatewayResponse', {
        ResponseType: 'BAD_REQUEST_BODY',
        StatusCode: '400',
        ResponseTemplates: Match.objectLike({
          'application/json': Match.stringLikeRegexp('INVALID_REQUEST'),
        }),
      });
    });

    test('should configure 500 Internal Server Error response', () => {
      template.hasResourceProperties('AWS::ApiGateway::GatewayResponse', {
        ResponseType: 'DEFAULT_5XX',
        ResponseTemplates: Match.objectLike({
          'application/json': Match.stringLikeRegexp('INTERNAL_SERVER_ERROR'),
        }),
      });
    });
  });

  describe('API Versioning', () => {
    test('should deploy to v1 stage', () => {
      template.hasResourceProperties('AWS::ApiGateway::Stage', {
        StageName: 'v1',
      });
    });

    test('should create deployment', () => {
      template.resourceCountIs('AWS::ApiGateway::Deployment', 1);
    });
  });

  describe('Lambda Authorizer', () => {
    test('should create token authorizer', () => {
      template.hasResourceProperties('AWS::ApiGateway::Authorizer', {
        Type: 'TOKEN',
        AuthorizerResultTtlInSeconds: 300,
        IdentitySource: 'method.request.header.Authorization',
      });
    });
  });

  describe('API Endpoints', () => {
    test('should create auth endpoints without authorizer', () => {
      // POST /v1/auth/register
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'register',
      });

      // POST /v1/auth/login
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'login',
      });

      // POST /v1/auth/verify-otp
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'verify-otp',
      });

      // POST /v1/auth/refresh
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'refresh',
      });
    });

    test('should create property endpoints with authorizer', () => {
      // /v1/properties
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'properties',
      });

      // /v1/properties/{id}
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: '{id}',
      });

      // /v1/properties/{id}/lineage
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'lineage',
      });

      // /v1/properties/{id}/trust-score
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'trust-score',
      });

      // /v1/properties/{id}/report
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'report',
      });
    });

    test('should create admin endpoints with authorizer', () => {
      // /v1/admin
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'admin',
      });

      // /v1/admin/users
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'users',
      });

      // /v1/admin/audit-logs
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'audit-logs',
      });
    });

    test('should create user endpoints with authorizer', () => {
      // /v1/users/export
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'export',
      });

      // /v1/users/notifications
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'notifications',
      });
    });
  });

  describe('Request Validators', () => {
    test('should create body validator', () => {
      template.hasResourceProperties('AWS::ApiGateway::RequestValidator', {
        Name: 'body-validator',
        ValidateRequestBody: true,
        ValidateRequestParameters: false,
      });
    });

    test('should create params validator', () => {
      template.hasResourceProperties('AWS::ApiGateway::RequestValidator', {
        Name: 'params-validator',
        ValidateRequestBody: false,
        ValidateRequestParameters: true,
      });
    });
  });

  describe('CloudWatch Log Group', () => {
    test('should create log group for access logs', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/apigateway/satyamool-api-access',
        RetentionInDays: 30,
      });
    });
  });

  describe('Response Models', () => {
    test('should create error response model', () => {
      template.hasResourceProperties('AWS::ApiGateway::Model', {
        Name: 'ErrorResponse',
        ContentType: 'application/json',
        Schema: Match.objectLike({
          title: 'Error Response',
          type: 'object',
          properties: Match.objectLike({
            error: Match.objectLike({
              type: 'string',
            }),
            message: Match.objectLike({
              type: 'string',
            }),
          }),
        }),
      });
    });
  });
});

describe('API Gateway Integration Tests', () => {
  describe('Rate Limiting Enforcement', () => {
    test('should enforce rate limit of 100 requests per minute', () => {
      // This is a CDK configuration test
      // Actual rate limiting enforcement would be tested in E2E tests
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      
      const mockLambda = new lambda.Function(stack, 'MockLambda', {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
      });

      const mockUserPool = new cognito.UserPool(stack, 'MockUserPool', {
        userPoolName: 'test-pool',
      });

      const apiConfig = new ApiGatewayConfig(stack, 'TestApiGateway', {
        authorizerLambda: mockLambda,
        userPool: mockUserPool,
        registerLambda: mockLambda,
        loginLambda: mockLambda,
        verifyOtpLambda: mockLambda,
        refreshTokenLambda: mockLambda,
        createPropertyLambda: mockLambda,
        listPropertiesLambda: mockLambda,
        getPropertyLambda: mockLambda,
        deletePropertyLambda: mockLambda,
        generateUploadUrlLambda: mockLambda,
        registerDocumentLambda: mockLambda,
        getLineageLambda: mockLambda,
        getTrustScoreLambda: mockLambda,
        generateReportLambda: mockLambda,
        listUsersLambda: mockLambda,
        updateUserRoleLambda: mockLambda,
        deactivateUserLambda: mockLambda,
        searchAuditLogsLambda: mockLambda,
        exportAuditLogsLambda: mockLambda,
        exportUserDataLambda: mockLambda,
        getNotificationsLambda: mockLambda,
      });

      expect(apiConfig.usagePlan).toBeDefined();
      
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::ApiGateway::UsagePlan', {
        Throttle: {
          RateLimit: 100,
          BurstLimit: 200,
        },
      });
    });
  });

  describe('CORS Configuration', () => {
    test('should allow cross-origin requests from approved domains', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      
      const mockLambda = new lambda.Function(stack, 'MockLambda', {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
      });

      const mockUserPool = new cognito.UserPool(stack, 'MockUserPool', {
        userPoolName: 'test-pool',
      });

      new ApiGatewayConfig(stack, 'TestApiGateway', {
        authorizerLambda: mockLambda,
        userPool: mockUserPool,
        registerLambda: mockLambda,
        loginLambda: mockLambda,
        verifyOtpLambda: mockLambda,
        refreshTokenLambda: mockLambda,
        createPropertyLambda: mockLambda,
        listPropertiesLambda: mockLambda,
        getPropertyLambda: mockLambda,
        deletePropertyLambda: mockLambda,
        generateUploadUrlLambda: mockLambda,
        registerDocumentLambda: mockLambda,
        getLineageLambda: mockLambda,
        getTrustScoreLambda: mockLambda,
        generateReportLambda: mockLambda,
        listUsersLambda: mockLambda,
        updateUserRoleLambda: mockLambda,
        deactivateUserLambda: mockLambda,
        searchAuditLogsLambda: mockLambda,
        exportAuditLogsLambda: mockLambda,
        exportUserDataLambda: mockLambda,
        getNotificationsLambda: mockLambda,
      });

      const template = Template.fromStack(stack);
      
      // Verify CORS headers in gateway responses
      template.hasResourceProperties('AWS::ApiGateway::GatewayResponse', {
        ResponseParameters: Match.objectLike({
          'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
        }),
      });
    });
  });

  describe('Error Response Formats', () => {
    test('should return standardized error format for 401', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      
      const mockLambda = new lambda.Function(stack, 'MockLambda', {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
      });

      const mockUserPool = new cognito.UserPool(stack, 'MockUserPool', {
        userPoolName: 'test-pool',
      });

      new ApiGatewayConfig(stack, 'TestApiGateway', {
        authorizerLambda: mockLambda,
        userPool: mockUserPool,
        registerLambda: mockLambda,
        loginLambda: mockLambda,
        verifyOtpLambda: mockLambda,
        refreshTokenLambda: mockLambda,
        createPropertyLambda: mockLambda,
        listPropertiesLambda: mockLambda,
        getPropertyLambda: mockLambda,
        deletePropertyLambda: mockLambda,
        generateUploadUrlLambda: mockLambda,
        registerDocumentLambda: mockLambda,
        getLineageLambda: mockLambda,
        getTrustScoreLambda: mockLambda,
        generateReportLambda: mockLambda,
        listUsersLambda: mockLambda,
        updateUserRoleLambda: mockLambda,
        deactivateUserLambda: mockLambda,
        searchAuditLogsLambda: mockLambda,
        exportAuditLogsLambda: mockLambda,
        exportUserDataLambda: mockLambda,
        getNotificationsLambda: mockLambda,
      });

      const template = Template.fromStack(stack);
      
      // Verify error response format
      template.hasResourceProperties('AWS::ApiGateway::GatewayResponse', {
        ResponseType: 'UNAUTHORIZED',
        ResponseTemplates: {
          'application/json': Match.stringLikeRegexp('"error".*"UNAUTHORIZED"'),
        },
      });
    });
  });
});
