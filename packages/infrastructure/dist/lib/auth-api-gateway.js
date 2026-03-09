"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthApiGateway = void 0;
const cdk = require("aws-cdk-lib");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const logs = require("aws-cdk-lib/aws-logs");
const constructs_1 = require("constructs");
class AuthApiGateway extends constructs_1.Construct {
    constructor(scope, id, props) {
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
exports.AuthApiGateway = AuthApiGateway;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1hcGktZ2F0ZXdheS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9hdXRoLWFwaS1nYXRld2F5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQyx5REFBeUQ7QUFFekQsNkNBQTZDO0FBQzdDLDJDQUF1QztBQVN2QyxNQUFhLGNBQWUsU0FBUSxzQkFBUztJQUczQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTBCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsMERBQTBEO1FBQzFELE1BQU0sY0FBYyxHQUFHLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQzlELFlBQVksRUFBRSwyQ0FBMkM7WUFDekQsU0FBUyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUTtZQUN0QyxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1NBQ3pDLENBQUMsQ0FBQztRQUVILGtCQUFrQjtRQUNsQixJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUQsV0FBVyxFQUFFLG9CQUFvQjtZQUNqQyxXQUFXLEVBQUUsOEJBQThCO1lBQzNDLGFBQWEsRUFBRTtnQkFDYixTQUFTLEVBQUUsSUFBSTtnQkFDZixjQUFjLEVBQUUsSUFBSTtnQkFDcEIsZ0JBQWdCLEVBQUUsSUFBSTtnQkFDdEIsWUFBWSxFQUFFLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJO2dCQUNoRCxjQUFjLEVBQUUsSUFBSTtnQkFDcEIsb0JBQW9CLEVBQUUsSUFBSSxVQUFVLENBQUMsc0JBQXNCLENBQUMsY0FBYyxDQUFDO2dCQUMzRSxlQUFlLEVBQUUsVUFBVSxDQUFDLGVBQWUsQ0FBQyxzQkFBc0IsQ0FBQztvQkFDakUsTUFBTSxFQUFFLElBQUk7b0JBQ1osVUFB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QUFNLEVBQUUsVUFBVSxDQUFDLE1BQU0sQ0FBQyxLQUFLO2FBQ2hDO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsU0FBUyxDQUFDLFdBQVcsQ0FBQztZQUNwQixLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxlQUFlO1NBQ2hDLENBQUMsQ0FBQztRQUVILFNBQVMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFNUIsVUFBVTtRQUNWLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQ2hDLEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUc7WUFDbkIsV0FBVyxFQUFFLHNCQUFzQjtZQUNuQyxVQUFVLEVBQUUsc0JBQXNCO1NBQ25DLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFO1lBQy9CLEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVM7WUFDekIsV0FBVyxFQUFFLHFCQUFxQjtZQUNsQyxVQUFVLEVBQUUscUJBQXFCO1NBQ2xDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQS9ORCx3Q0ErTkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcclxuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhBcGlHYXRld2F5UHJvcHMge1xyXG4gIHJlZ2lzdGVyTGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIGxvZ2luTGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIHZlcmlmeU90cExhbWJkYTogbGFtYmRhLklGdW5jdGlvbjtcclxuICByZWZyZXNoVG9rZW5MYW1iZGE6IGxhbWJkYS5JRnVuY3Rpb247XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBBdXRoQXBpR2F0ZXdheSBleHRlbmRzIENvbnN0cnVjdCB7XHJcbiAgcHVibGljIHJlYWRvbmx5IGFwaTogYXBpZ2F0ZXdheS5SZXN0QXBpO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXV0aEFwaUdhdGV3YXlQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcclxuXHJcbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBMb2cgR3JvdXAgZm9yIEFQSSBHYXRld2F5IGFjY2VzcyBsb2dzXHJcbiAgICBjb25zdCBhY2Nlc3NMb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdBcGlBY2Nlc3NMb2dzJywge1xyXG4gICAgICBsb2dHcm91cE5hbWU6ICcvYXdzL2FwaWdhdGV3YXkvc2F0eWFtb29sLWF1dGgtYXBpLWFjY2VzcycsXHJcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIFJFU1QgQVBJXHJcbiAgICB0aGlzLmFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ1NhdHlhTW9vbEF1dGhBcGknLCB7XHJcbiAgICAgIHJlc3RBcGlOYW1lOiAnU2F0eWFNb29sIEF1dGggQVBJJyxcclxuICAgICAgZGVzY3JpcHRpb246ICdTYXR5YU1vb2wgQXV0aGVudGljYXRpb24gQVBJJyxcclxuICAgICAgZGVwbG95T3B0aW9uczoge1xyXG4gICAgICAgIHN0YWdlTmFtZTogJ3YxJyxcclxuICAgICAgICB0cmFjaW5nRW5hYmxlZDogdHJ1ZSxcclxuICAgICAgICBkYXRhVHJhY2VFbmFibGVkOiB0cnVlLFxyXG4gICAgICAgIGxvZ2dpbmdMZXZlbDogYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuSU5GTyxcclxuICAgICAgICBtZXRyaWNzRW5hYmxlZDogdHJ1ZSxcclxuICAgICAgICBhY2Nlc3NMb2dEZXN0aW5hdGlvbjogbmV3IGFwaWdhdGV3YXkuTG9nR3JvdXBMb2dEZXN0aW5hdGlvbihhY2Nlc3NMb2dHcm91cCksXHJcbiAgICAgICAgYWNjZXNzTG9nRm9ybWF0OiBhcGlnYXRld2F5LkFjY2Vzc0xvZ0Zvcm1hdC5qc29uV2l0aFN0YW5kYXJkRmllbGRzKHtcclxuICAgICAgICAgIGNhbGxlcjogdHJ1ZSxcclxuICAgICAgICAgIGh0dHBNZXRob2Q6IHRydWUsXHJcbiAgICAgICAgICBpcDogdHJ1ZSxcclxuICAgICAgICAgIHByb3RvY29sOiB0cnVlLFxyXG4gICAgICAgICAgcmVxdWVzdFRpbWU6IHRydWUsXHJcbiAgICAgICAgICByZXNvdXJjZVBhdGg6IHRydWUsXHJcbiAgICAgICAgICByZXNwb25zZUxlbmd0aDogdHJ1ZSxcclxuICAgICAgICAgIHN0YXR1czogdHJ1ZSxcclxuICAgICAgICAgIHVzZXI6IHRydWUsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH0sXHJcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xyXG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxyXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxyXG4gICAgICAgIGFsbG93SGVhZGVyczogW1xyXG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZScsXHJcbiAgICAgICAgICAnWC1BbXotRGF0ZScsXHJcbiAgICAgICAgICAnQXV0aG9yaXphdGlvbicsXHJcbiAgICAgICAgICAnWC1BcGktS2V5JyxcclxuICAgICAgICAgICdYLUFtei1TZWN1cml0eS1Ub2tlbicsXHJcbiAgICAgICAgXSxcclxuICAgICAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxyXG4gICAgICAgIG1heEFnZTogY2RrLkR1cmF0aW9uLmhvdXJzKDEpLFxyXG4gICAgICB9LFxyXG4gICAgICBjbG91ZFdhdGNoUm9sZTogdHJ1ZSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSByZXF1ZXN0IHZhbGlkYXRvclxyXG4gICAgY29uc3QgYm9keVZhbGlkYXRvciA9IG5ldyBhcGlnYXRld2F5LlJlcXVlc3RWYWxpZGF0b3IodGhpcywgJ0JvZHlWYWxpZGF0b3InLCB7XHJcbiAgICAgIHJlc3RBcGk6IHRoaXMuYXBpLFxyXG4gICAgICByZXF1ZXN0VmFsaWRhdG9yTmFtZTogJ2JvZHktdmFsaWRhdG9yJyxcclxuICAgICAgdmFsaWRhdGVSZXF1ZXN0Qm9keTogdHJ1ZSxcclxuICAgICAgdmFsaWRhdGVSZXF1ZXN0UGFyYW1ldGVyczogZmFsc2UsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBEZWZpbmUgZXJyb3IgcmVzcG9uc2UgbW9kZWxcclxuICAgIGNvbnN0IGVycm9yUmVzcG9uc2VNb2RlbCA9IHRoaXMuYXBpLmFkZE1vZGVsKCdFcnJvclJlc3BvbnNlJywge1xyXG4gICAgICBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICBtb2RlbE5hbWU6ICdFcnJvclJlc3BvbnNlJyxcclxuICAgICAgc2NoZW1hOiB7XHJcbiAgICAgICAgc2NoZW1hOiBhcGlnYXRld2F5Lkpzb25TY2hlbWFWZXJzaW9uLkRSQUZUNCxcclxuICAgICAgICB0aXRsZTogJ0Vycm9yIFJlc3BvbnNlJyxcclxuICAgICAgICB0eXBlOiBhcGlnYXRld2F5Lkpzb25TY2hlbWFUeXBlLk9CSkVDVCxcclxuICAgICAgICBwcm9wZXJ0aWVzOiB7XHJcbiAgICAgICAgICBlcnJvcjoge1xyXG4gICAgICAgICAgICB0eXBlOiBhcGlnYXRld2F5Lkpzb25TY2hlbWFUeXBlLlNUUklORyxcclxuICAgICAgICAgICAgZGVzY3JpcHRpb246ICdFcnJvciBjb2RlJyxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICBtZXNzYWdlOiB7XHJcbiAgICAgICAgICAgIHR5cGU6IGFwaWdhdGV3YXkuSnNvblNjaGVtYVR5cGUuU1RSSU5HLFxyXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1VzZXItZnJpZW5kbHkgZXJyb3IgbWVzc2FnZScsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgcmVxdWlyZWQ6IFsnZXJyb3InLCAnbWVzc2FnZSddLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ29uZmlndXJlIGdhdGV3YXkgcmVzcG9uc2VzXHJcbiAgICB0aGlzLmFwaS5hZGRHYXRld2F5UmVzcG9uc2UoJ1VuYXV0aG9yaXplZCcsIHtcclxuICAgICAgdHlwZTogYXBpZ2F0ZXdheS5SZXNwb25zZVR5cGUuVU5BVVRIT1JJWkVELFxyXG4gICAgICBzdGF0dXNDb2RlOiAnNDAxJyxcclxuICAgICAgcmVzcG9uc2VIZWFkZXJzOiB7XHJcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IFwiJyonXCIsXHJcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6IFwiJ2FwcGxpY2F0aW9uL2pzb24nXCIsXHJcbiAgICAgIH0sXHJcbiAgICAgIHRlbXBsYXRlczoge1xyXG4gICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgZXJyb3I6ICdVTkFVVEhPUklaRUQnLFxyXG4gICAgICAgICAgbWVzc2FnZTogJ0F1dGhlbnRpY2F0aW9uIHJlcXVpcmVkJyxcclxuICAgICAgICB9KSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuYXBpLmFkZEdhdGV3YXlSZXNwb25zZSgnVGhyb3R0bGVkJywge1xyXG4gICAgICB0eXBlOiBhcGlnYXRld2F5LlJlc3BvbnNlVHlwZS5USFJPVFRMRUQsXHJcbiAgICAgIHN0YXR1c0NvZGU6ICc0MjknLFxyXG4gICAgICByZXNwb25zZUhlYWRlcnM6IHtcclxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogXCInKidcIixcclxuICAgICAgICAnQ29udGVudC1UeXBlJzogXCInYXBwbGljYXRpb24vanNvbidcIixcclxuICAgICAgICAnUmV0cnktQWZ0ZXInOiBcIic2MCdcIixcclxuICAgICAgfSxcclxuICAgICAgdGVtcGxhdGVzOiB7XHJcbiAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICBlcnJvcjogJ1JBVEVfTElNSVRfRVhDRUVERUQnLFxyXG4gICAgICAgICAgbWVzc2FnZTogJ1JhdGUgbGltaXQgZXhjZWVkZWQuIFBsZWFzZSByZXRyeSBhZnRlciA2MCBzZWNvbmRzLicsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmFwaS5hZGRHYXRld2F5UmVzcG9uc2UoJ0RlZmF1bHQ0WFgnLCB7XHJcbiAgICAgIHR5cGU6IGFwaWdhdGV3YXkuUmVzcG9uc2VUeXBlLkRFRkFVTFRfNFhYLFxyXG4gICAgICByZXNwb25zZUhlYWRlcnM6IHtcclxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogXCInKidcIixcclxuICAgICAgICAnQ29udGVudC1UeXBlJzogXCInYXBwbGljYXRpb24vanNvbidcIixcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuYXBpLmFkZEdhdGV3YXlSZXNwb25zZSgnRGVmYXVsdDVYWCcsIHtcclxuICAgICAgdHlwZTogYXBpZ2F0ZXdheS5SZXNwb25zZVR5cGUuREVGQVVMVF81WFgsXHJcbiAgICAgIHJlc3BvbnNlSGVhZGVyczoge1xyXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBcIicqJ1wiLFxyXG4gICAgICAgICdDb250ZW50LVR5cGUnOiBcIidhcHBsaWNhdGlvbi9qc29uJ1wiLFxyXG4gICAgICB9LFxyXG4gICAgICB0ZW1wbGF0ZXM6IHtcclxuICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgIGVycm9yOiAnSU5URVJOQUxfU0VSVkVSX0VSUk9SJyxcclxuICAgICAgICAgIG1lc3NhZ2U6ICdBbiBpbnRlcm5hbCBzZXJ2ZXIgZXJyb3Igb2NjdXJyZWQnLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PSBBdXRoIEVuZHBvaW50cyAoUHVibGljIC0gTm8gQXV0aG9yaXplcikgPT09PT09PT09PVxyXG4gICAgY29uc3QgYXV0aFJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnYXV0aCcpO1xyXG5cclxuICAgIC8vIFBPU1QgL3YxL2F1dGgvcmVnaXN0ZXJcclxuICAgIGNvbnN0IHJlZ2lzdGVyUmVzb3VyY2UgPSBhdXRoUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3JlZ2lzdGVyJyk7XHJcbiAgICByZWdpc3RlclJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb3BzLnJlZ2lzdGVyTGFtYmRhKSwge1xyXG4gICAgICByZXF1ZXN0VmFsaWRhdG9yOiBib2R5VmFsaWRhdG9yLFxyXG4gICAgICBtZXRob2RSZXNwb25zZXM6IFtcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICcyMDAnIH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDAwJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzUwMCcsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFBPU1QgL3YxL2F1dGgvbG9naW5cclxuICAgIGNvbnN0IGxvZ2luUmVzb3VyY2UgPSBhdXRoUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2xvZ2luJyk7XHJcbiAgICBsb2dpblJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb3BzLmxvZ2luTGFtYmRhKSwge1xyXG4gICAgICByZXF1ZXN0VmFsaWRhdG9yOiBib2R5VmFsaWRhdG9yLFxyXG4gICAgICBtZXRob2RSZXNwb25zZXM6IFtcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICcyMDAnIH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDAwJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwMScsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc1MDAnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBQT1NUIC92MS9hdXRoL3ZlcmlmeS1vdHBcclxuICAgIGNvbnN0IHZlcmlmeU90cFJlc291cmNlID0gYXV0aFJlc291cmNlLmFkZFJlc291cmNlKCd2ZXJpZnktb3RwJyk7XHJcbiAgICB2ZXJpZnlPdHBSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy52ZXJpZnlPdHBMYW1iZGEpLCB7XHJcbiAgICAgIHJlcXVlc3RWYWxpZGF0b3I6IGJvZHlWYWxpZGF0b3IsXHJcbiAgICAgIG1ldGhvZFJlc3BvbnNlczogW1xyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzIwMCcgfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDAnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNTAwJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICBdLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gUE9TVCAvdjEvYXV0aC9yZWZyZXNoXHJcbiAgICBjb25zdCByZWZyZXNoUmVzb3VyY2UgPSBhdXRoUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3JlZnJlc2gnKTtcclxuICAgIHJlZnJlc2hSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy5yZWZyZXNoVG9rZW5MYW1iZGEpLCB7XHJcbiAgICAgIHJlcXVlc3RWYWxpZGF0b3I6IGJvZHlWYWxpZGF0b3IsXHJcbiAgICAgIG1ldGhvZFJlc3BvbnNlczogW1xyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzIwMCcgfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDAnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDAxJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzUwMCcsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vID09PT09PT09PT0gVXNhZ2UgUGxhbiBhbmQgUmF0ZSBMaW1pdGluZyA9PT09PT09PT09XHJcbiAgICBjb25zdCBhcGlLZXkgPSB0aGlzLmFwaS5hZGRBcGlLZXkoJ1NhdHlhTW9vbEF1dGhBcGlLZXknLCB7XHJcbiAgICAgIGFwaUtleU5hbWU6ICdTYXR5YU1vb2wtQXV0aC1LZXknLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBrZXkgZm9yIFNhdHlhTW9vbCBBdXRoIEFQSScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCB1c2FnZVBsYW4gPSB0aGlzLmFwaS5hZGRVc2FnZVBsYW4oJ1NhdHlhTW9vbEF1dGhVc2FnZVBsYW4nLCB7XHJcbiAgICAgIG5hbWU6ICdTYXR5YU1vb2wtQXV0aC1QbGFuJyxcclxuICAgICAgZGVzY3JpcHRpb246ICdVc2FnZSBwbGFuIHdpdGggcmF0ZSBsaW1pdGluZyBmb3IgYXV0aCBlbmRwb2ludHMnLFxyXG4gICAgICB0aHJvdHRsZToge1xyXG4gICAgICAgIHJhdGVMaW1pdDogMTAwLFxyXG4gICAgICAgIGJ1cnN0TGltaXQ6IDIwMCxcclxuICAgICAgfSxcclxuICAgICAgcXVvdGE6IHtcclxuICAgICAgICBsaW1pdDogMTAwMDAwLFxyXG4gICAgICAgIHBlcmlvZDogYXBpZ2F0ZXdheS5QZXJpb2QuTU9OVEgsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICB1c2FnZVBsYW4uYWRkQXBpU3RhZ2Uoe1xyXG4gICAgICBzdGFnZTogdGhpcy5hcGkuZGVwbG95bWVudFN0YWdlLFxyXG4gICAgfSk7XHJcblxyXG4gICAgdXNhZ2VQbGFuLmFkZEFwaUtleShhcGlLZXkpO1xyXG5cclxuICAgIC8vIE91dHB1dHNcclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlVcmwnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLmFwaS51cmwsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXV0aCBBUEkgR2F0ZXdheSBVUkwnLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLUF1dGhBcGlVcmwnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUlkJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5hcGkucmVzdEFwaUlkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0F1dGggQVBJIEdhdGV3YXkgSUQnLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLUF1dGhBcGlJZCcsXHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuIl19