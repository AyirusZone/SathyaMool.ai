"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiGatewayConfig = void 0;
const cdk = require("aws-cdk-lib");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const logs = require("aws-cdk-lib/aws-logs");
const constructs_1 = require("constructs");
class ApiGatewayConfig extends constructs_1.Construct {
    constructor(scope, id, props) {
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
exports.ApiGatewayConfig = ApiGatewayConfig;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWdhdGV3YXktY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2FwaS1nYXRld2F5LWNvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMseURBQXlEO0FBRXpELDZDQUE2QztBQUU3QywyQ0FBdUM7QUErQnZDLE1BQWEsZ0JBQWlCLFNBQVEsc0JBQVM7SUFJN0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE0QjtRQUNwRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLDBEQUEwRDtRQUMxRCxNQUFNLGNBQWMsR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUM5RCxZQUFZLEVBQUUsc0NBQXNDO1lBQ3BELFNBQVMsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVM7WUFDdkMsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtTQUN4QyxDQUFDLENBQUM7UUFFSCxtREFBbUQ7UUFDbkQsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUN0RCxXQUFXLEVBQUUsZUFBZTtZQUM1QixXQUFXLEVBQUUsOENBQThDO1lBQzNELGFBQWEsRUFBRTtnQkFDYixTQUFTLEVBQUUsSUFBSTtnQkFDZixjQUFjLEVBQUUsSUFBSSxFQUFFLHVCQUF1QjtnQkFDN0MsZ0JBQWdCLEVBQUUsSUFBSTtnQkFDdEIsWUFBWSxFQUFFLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJO2dCQUNoRCxjQUFjLEVBQUUsSUFBSTtnQkFDcEIsb0JBQW9CLEVBQUUsSUFBSSxVQUFVLENBQUMsc0JBQXNCLENBQUMsY0FBYyxDQUFDO2dCQUMzRSxlQUFlLEVBQUUsVUFBVSxDQUFDLGVBQWUsQ0FBQyxzQkFBc0IsQ0FBQztvQkFDakUsTUFBTSxFQUFF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LEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTO1lBQ3pCLFdBQVcsRUFBRSxnQkFBZ0I7WUFDN0IsVUFBVSxFQUFFLGlCQUFpQjtTQUM5QixDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRTtZQUNsQyxLQUFLLEVBQUUsTUFBTSxDQUFDLEtBQUs7WUFDbkIsV0FBVyxFQUFFLFlBQVk7WUFDekIsVUFBVSxFQUFFLG9CQUFvQjtTQUNqQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE1aEJELDRDQTRoQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcclxuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcclxuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBBcGlHYXRld2F5Q29uZmlnUHJvcHMge1xyXG4gIGF1dGhvcml6ZXJMYW1iZGE6IGxhbWJkYS5JRnVuY3Rpb247XHJcbiAgdXNlclBvb2w6IGNvZ25pdG8uSVVzZXJQb29sO1xyXG4gIC8vIEF1dGggZW5kcG9pbnRzXHJcbiAgcmVnaXN0ZXJMYW1iZGE6IGxhbWJkYS5JRnVuY3Rpb247XHJcbiAgbG9naW5MYW1iZGE6IGxhbWJkYS5JRnVuY3Rpb247XHJcbiAgdmVyaWZ5T3RwTGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIHJlZnJlc2hUb2tlbkxhbWJkYTogbGFtYmRhLklGdW5jdGlvbjtcclxuICAvLyBQcm9wZXJ0eSBlbmRwb2ludHNcclxuICBjcmVhdGVQcm9wZXJ0eUxhbWJkYTogbGFtYmRhLklGdW5jdGlvbjtcclxuICBsaXN0UHJvcGVydGllc0xhbWJkYTogbGFtYmRhLklGdW5jdGlvbjtcclxuICBnZXRQcm9wZXJ0eUxhbWJkYTogbGFtYmRhLklGdW5jdGlvbjtcclxuICBkZWxldGVQcm9wZXJ0eUxhbWJkYTogbGFtYmRhLklGdW5jdGlvbjtcclxuICBnZW5lcmF0ZVVwbG9hZFVybExhbWJkYTogbGFtYmRhLklGdW5jdGlvbjtcclxuICByZWdpc3RlckRvY3VtZW50TGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIGdldExpbmVhZ2VMYW1iZGE6IGxhbWJkYS5JRnVuY3Rpb247XHJcbiAgZ2V0VHJ1c3RTY29yZUxhbWJkYTogbGFtYmRhLklGdW5jdGlvbjtcclxuICBnZW5lcmF0ZVJlcG9ydExhbWJkYTogbGFtYmRhLklGdW5jdGlvbjtcclxuICAvLyBBZG1pbiBlbmRwb2ludHNcclxuICBsaXN0VXNlcnNMYW1iZGE6IGxhbWJkYS5JRnVuY3Rpb247XHJcbiAgdXBkYXRlVXNlclJvbGVMYW1iZGE6IGxhbWJkYS5JRnVuY3Rpb247XHJcbiAgZGVhY3RpdmF0ZVVzZXJMYW1iZGE6IGxhbWJkYS5JRnVuY3Rpb247XHJcbiAgc2VhcmNoQXVkaXRMb2dzTGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIGV4cG9ydEF1ZGl0TG9nc0xhbWJkYTogbGFtYmRhLklGdW5jdGlvbjtcclxuICAvLyBVc2VyIGVuZHBvaW50c1xyXG4gIGV4cG9ydFVzZXJEYXRhTGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIGdldE5vdGlmaWNhdGlvbnNMYW1iZGE6IGxhbWJkYS5JRnVuY3Rpb247XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBBcGlHYXRld2F5Q29uZmlnIGV4dGVuZHMgQ29uc3RydWN0IHtcclxuICBwdWJsaWMgcmVhZG9ubHkgYXBpOiBhcGlnYXRld2F5LlJlc3RBcGk7XHJcbiAgcHVibGljIHJlYWRvbmx5IHVzYWdlUGxhbjogYXBpZ2F0ZXdheS5Vc2FnZVBsYW47XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBcGlHYXRld2F5Q29uZmlnUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggTG9nIEdyb3VwIGZvciBBUEkgR2F0ZXdheSBhY2Nlc3MgbG9nc1xyXG4gICAgY29uc3QgYWNjZXNzTG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnQXBpQWNjZXNzTG9ncycsIHtcclxuICAgICAgbG9nR3JvdXBOYW1lOiAnL2F3cy9hcGlnYXRld2F5L3NhdHlhbW9vbC1hcGktYWNjZXNzJyxcclxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgUkVTVCBBUEkgd2l0aCBsb2dnaW5nIGFuZCB0cmFjaW5nIGVuYWJsZWRcclxuICAgIHRoaXMuYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnU2F0eWFNb29sQXBpJywge1xyXG4gICAgICByZXN0QXBpTmFtZTogJ1NhdHlhTW9vbCBBUEknLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1NhdHlhTW9vbCBQcm9wZXJ0eSBWZXJpZmljYXRpb24gUGxhdGZvcm0gQVBJJyxcclxuICAgICAgZGVwbG95T3B0aW9uczoge1xyXG4gICAgICAgIHN0YWdlTmFtZTogJ3YxJyxcclxuICAgICAgICB0cmFjaW5nRW5hYmxlZDogdHJ1ZSwgLy8gRW5hYmxlIFgtUmF5IHRyYWNpbmdcclxuICAgICAgICBkYXRhVHJhY2VFbmFibGVkOiB0cnVlLFxyXG4gICAgICAgIGxvZ2dpbmdMZXZlbDogYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuSU5GTyxcclxuICAgICAgICBtZXRyaWNzRW5hYmxlZDogdHJ1ZSxcclxuICAgICAgICBhY2Nlc3NMb2dEZXN0aW5hdGlvbjogbmV3IGFwaWdhdGV3YXkuTG9nR3JvdXBMb2dEZXN0aW5hdGlvbihhY2Nlc3NMb2dHcm91cCksXHJcbiAgICAgICAgYWNjZXNzTG9nRm9ybWF0OiBhcGlnYXRld2F5LkFjY2Vzc0xvZ0Zvcm1hdC5qc29uV2l0aFN0YW5kYXJkRmllbGRzKHtcclxuICAgICAgICAgIGNhbGxlcjogdHJ1ZSxcclxuICAgICAgICAgIGh0dHBNZXRob2Q6IHRydWUsXHJcbiAgICAgICAgICBpcDogdHJ1ZSxcclxuICAgICAgICAgIHByb3RvY29sOiB0cnVlLFxyXG4gICAgICAgICAgcmVxdWVzdFRpbWU6IHRydWUsXHJcbiAgICAgICAgICByZXNvdXJjZVBhdGg6IHRydWUsXHJcbiAgICAgICAgICByZXNwb25zZUxlbmd0aDogdHJ1ZSxcclxuICAgICAgICAgIHN0YXR1czogdHJ1ZSxcclxuICAgICAgICAgIHVzZXI6IHRydWUsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH0sXHJcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xyXG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLCAvLyBUT0RPOiBSZXN0cmljdCB0byBzcGVjaWZpYyBkb21haW5zIGluIHByb2R1Y3Rpb25cclxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcclxuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcclxuICAgICAgICAgICdDb250ZW50LVR5cGUnLFxyXG4gICAgICAgICAgJ1gtQW16LURhdGUnLFxyXG4gICAgICAgICAgJ0F1dGhvcml6YXRpb24nLFxyXG4gICAgICAgICAgJ1gtQXBpLUtleScsXHJcbiAgICAgICAgICAnWC1BbXotU2VjdXJpdHktVG9rZW4nLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgYWxsb3dDcmVkZW50aWFsczogdHJ1ZSxcclxuICAgICAgICBtYXhBZ2U6IGNkay5EdXJhdGlvbi5ob3VycygxKSxcclxuICAgICAgfSxcclxuICAgICAgY2xvdWRXYXRjaFJvbGU6IHRydWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgTGFtYmRhIGF1dGhvcml6ZXIgZm9yIEpXVCB0b2tlbiB2YWxpZGF0aW9uXHJcbiAgICBjb25zdCBhdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuVG9rZW5BdXRob3JpemVyKHRoaXMsICdKd3RBdXRob3JpemVyJywge1xyXG4gICAgICBoYW5kbGVyOiBwcm9wcy5hdXRob3JpemVyTGFtYmRhLFxyXG4gICAgICBpZGVudGl0eVNvdXJjZTogJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5BdXRob3JpemF0aW9uJyxcclxuICAgICAgYXV0aG9yaXplck5hbWU6ICdTYXR5YU1vb2xKd3RBdXRob3JpemVyJyxcclxuICAgICAgcmVzdWx0c0NhY2hlVHRsOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSByZXF1ZXN0IHZhbGlkYXRvcnNcclxuICAgIGNvbnN0IGJvZHlWYWxpZGF0b3IgPSBuZXcgYXBpZ2F0ZXdheS5SZXF1ZXN0VmFsaWRhdG9yKHRoaXMsICdCb2R5VmFsaWRhdG9yJywge1xyXG4gICAgICByZXN0QXBpOiB0aGlzLmFwaSxcclxuICAgICAgcmVxdWVzdFZhbGlkYXRvck5hbWU6ICdib2R5LXZhbGlkYXRvcicsXHJcbiAgICAgIHZhbGlkYXRlUmVxdWVzdEJvZHk6IHRydWUsXHJcbiAgICAgIHZhbGlkYXRlUmVxdWVzdFBhcmFtZXRlcnM6IGZhbHNlLFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgcGFyYW1zVmFsaWRhdG9yID0gbmV3IGFwaWdhdGV3YXkuUmVxdWVzdFZhbGlkYXRvcih0aGlzLCAnUGFyYW1zVmFsaWRhdG9yJywge1xyXG4gICAgICByZXN0QXBpOiB0aGlzLmFwaSxcclxuICAgICAgcmVxdWVzdFZhbGlkYXRvck5hbWU6ICdwYXJhbXMtdmFsaWRhdG9yJyxcclxuICAgICAgdmFsaWRhdGVSZXF1ZXN0Qm9keTogZmFsc2UsXHJcbiAgICAgIHZhbGlkYXRlUmVxdWVzdFBhcmFtZXRlcnM6IHRydWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBEZWZpbmUgZXJyb3IgcmVzcG9uc2UgbW9kZWxzXHJcbiAgICBjb25zdCBlcnJvclJlc3BvbnNlTW9kZWwgPSB0aGlzLmFwaS5hZGRNb2RlbCgnRXJyb3JSZXNwb25zZScsIHtcclxuICAgICAgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgbW9kZWxOYW1lOiAnRXJyb3JSZXNwb25zZScsXHJcbiAgICAgIHNjaGVtYToge1xyXG4gICAgICAgIHNjaGVtYTogYXBpZ2F0ZXdheS5Kc29uU2NoZW1hVmVyc2lvbi5EUkFGVDQsXHJcbiAgICAgICAgdGl0bGU6ICdFcnJvciBSZXNwb25zZScsXHJcbiAgICAgICAgdHlwZTogYXBpZ2F0ZXdheS5Kc29uU2NoZW1hVHlwZS5PQkpFQ1QsXHJcbiAgICAgICAgcHJvcGVydGllczoge1xyXG4gICAgICAgICAgZXJyb3I6IHtcclxuICAgICAgICAgICAgdHlwZTogYXBpZ2F0ZXdheS5Kc29uU2NoZW1hVHlwZS5TVFJJTkcsXHJcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnRXJyb3IgY29kZScsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgbWVzc2FnZToge1xyXG4gICAgICAgICAgICB0eXBlOiBhcGlnYXRld2F5Lkpzb25TY2hlbWFUeXBlLlNUUklORyxcclxuICAgICAgICAgICAgZGVzY3JpcHRpb246ICdVc2VyLWZyaWVuZGx5IGVycm9yIG1lc3NhZ2UnLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIGRldGFpbHM6IHtcclxuICAgICAgICAgICAgdHlwZTogYXBpZ2F0ZXdheS5Kc29uU2NoZW1hVHlwZS5PQkpFQ1QsXHJcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQWRkaXRpb25hbCBlcnJvciBkZXRhaWxzJyxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgICByZXF1aXJlZDogWydlcnJvcicsICdtZXNzYWdlJ10sXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDb25maWd1cmUgZ2F0ZXdheSByZXNwb25zZXMgZm9yIHN0YW5kYXJkaXplZCBlcnJvciBoYW5kbGluZ1xyXG4gICAgdGhpcy5hcGkuYWRkR2F0ZXdheVJlc3BvbnNlKCdVbmF1dGhvcml6ZWQnLCB7XHJcbiAgICAgIHR5cGU6IGFwaWdhdGV3YXkuUmVzcG9uc2VUeXBlLlVOQVVUSE9SSVpFRCxcclxuICAgICAgc3RhdHVzQ29kZTogJzQwMScsXHJcbiAgICAgIHJlc3BvbnNlSGVhZGVyczoge1xyXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBcIicqJ1wiLFxyXG4gICAgICAgICdDb250ZW50LVR5cGUnOiBcIidhcHBsaWNhdGlvbi9qc29uJ1wiLFxyXG4gICAgICB9LFxyXG4gICAgICB0ZW1wbGF0ZXM6IHtcclxuICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgIGVycm9yOiAnVU5BVVRIT1JJWkVEJyxcclxuICAgICAgICAgIG1lc3NhZ2U6ICdBdXRoZW50aWNhdGlvbiByZXF1aXJlZCcsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmFwaS5hZGRHYXRld2F5UmVzcG9uc2UoJ0FjY2Vzc0RlbmllZCcsIHtcclxuICAgICAgdHlwZTogYXBpZ2F0ZXdheS5SZXNwb25zZVR5cGUuQUNDRVNTX0RFTklFRCxcclxuICAgICAgc3RhdHVzQ29kZTogJzQwMycsXHJcbiAgICAgIHJlc3BvbnNlSGVhZGVyczoge1xyXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBcIicqJ1wiLFxyXG4gICAgICAgICdDb250ZW50LVR5cGUnOiBcIidhcHBsaWNhdGlvbi9qc29uJ1wiLFxyXG4gICAgICB9LFxyXG4gICAgICB0ZW1wbGF0ZXM6IHtcclxuICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgIGVycm9yOiAnRk9SQklEREVOJyxcclxuICAgICAgICAgIG1lc3NhZ2U6ICdBY2Nlc3MgZGVuaWVkJyxcclxuICAgICAgICB9KSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuYXBpLmFkZEdhdGV3YXlSZXNwb25zZSgnVGhyb3R0bGVkJywge1xyXG4gICAgICB0eXBlOiBhcGlnYXRld2F5LlJlc3BvbnNlVHlwZS5USFJPVFRMRUQsXHJcbiAgICAgIHN0YXR1c0NvZGU6ICc0MjknLFxyXG4gICAgICByZXNwb25zZUhlYWRlcnM6IHtcclxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogXCInKidcIixcclxuICAgICAgICAnQ29udGVudC1UeXBlJzogXCInYXBwbGljYXRpb24vanNvbidcIixcclxuICAgICAgICAnUmV0cnktQWZ0ZXInOiBcIic2MCdcIixcclxuICAgICAgfSxcclxuICAgICAgdGVtcGxhdGVzOiB7XHJcbiAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICBlcnJvcjogJ1JBVEVfTElNSVRfRVhDRUVERUQnLFxyXG4gICAgICAgICAgbWVzc2FnZTogJ1JhdGUgbGltaXQgZXhjZWVkZWQuIFBsZWFzZSByZXRyeSBhZnRlciA2MCBzZWNvbmRzLicsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmFwaS5hZGRHYXRld2F5UmVzcG9uc2UoJ0JhZFJlcXVlc3RCb2R5Jywge1xyXG4gICAgICB0eXBlOiBhcGlnYXRld2F5LlJlc3BvbnNlVHlwZS5CQURfUkVRVUVTVF9CT0RZLFxyXG4gICAgICBzdGF0dXNDb2RlOiAnNDAwJyxcclxuICAgICAgcmVzcG9uc2VIZWFkZXJzOiB7XHJcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IFwiJyonXCIsXHJcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6IFwiJ2FwcGxpY2F0aW9uL2pzb24nXCIsXHJcbiAgICAgIH0sXHJcbiAgICAgIHRlbXBsYXRlczoge1xyXG4gICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgZXJyb3I6ICdJTlZBTElEX1JFUVVFU1QnLFxyXG4gICAgICAgICAgbWVzc2FnZTogJ0ludmFsaWQgcmVxdWVzdCBib2R5JyxcclxuICAgICAgICB9KSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuYXBpLmFkZEdhdGV3YXlSZXNwb25zZSgnRGVmYXVsdDRYWCcsIHtcclxuICAgICAgdHlwZTogYXBpZ2F0ZXdheS5SZXNwb25zZVR5cGUuREVGQVVMVF80WFgsXHJcbiAgICAgIHJlc3BvbnNlSGVhZGVyczoge1xyXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBcIicqJ1wiLFxyXG4gICAgICAgICdDb250ZW50LVR5cGUnOiBcIidhcHBsaWNhdGlvbi9qc29uJ1wiLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5hcGkuYWRkR2F0ZXdheVJlc3BvbnNlKCdEZWZhdWx0NVhYJywge1xyXG4gICAgICB0eXBlOiBhcGlnYXRld2F5LlJlc3BvbnNlVHlwZS5ERUZBVUxUXzVYWCxcclxuICAgICAgcmVzcG9uc2VIZWFkZXJzOiB7XHJcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IFwiJyonXCIsXHJcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6IFwiJ2FwcGxpY2F0aW9uL2pzb24nXCIsXHJcbiAgICAgIH0sXHJcbiAgICAgIHRlbXBsYXRlczoge1xyXG4gICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgZXJyb3I6ICdJTlRFUk5BTF9TRVJWRVJfRVJST1InLFxyXG4gICAgICAgICAgbWVzc2FnZTogJ0FuIGludGVybmFsIHNlcnZlciBlcnJvciBvY2N1cnJlZCcsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09IEF1dGggRW5kcG9pbnRzIChQdWJsaWMgLSBObyBBdXRob3JpemVyKSA9PT09PT09PT09XHJcbiAgICBjb25zdCBhdXRoUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdhdXRoJyk7XHJcblxyXG4gICAgLy8gUE9TVCAvdjEvYXV0aC9yZWdpc3RlclxyXG4gICAgY29uc3QgcmVnaXN0ZXJSZXNvdXJjZSA9IGF1dGhSZXNvdXJjZS5hZGRSZXNvdXJjZSgncmVnaXN0ZXInKTtcclxuICAgIHJlZ2lzdGVyUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMucmVnaXN0ZXJMYW1iZGEpLCB7XHJcbiAgICAgIHJlcXVlc3RWYWxpZGF0b3I6IGJvZHlWYWxpZGF0b3IsXHJcbiAgICAgIG1ldGhvZFJlc3BvbnNlczogW1xyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzIwMCcgfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDAnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNTAwJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICBdLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gUE9TVCAvdjEvYXV0aC9sb2dpblxyXG4gICAgY29uc3QgbG9naW5SZXNvdXJjZSA9IGF1dGhSZXNvdXJjZS5hZGRSZXNvdXJjZSgnbG9naW4nKTtcclxuICAgIGxvZ2luUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMubG9naW5MYW1iZGEpLCB7XHJcbiAgICAgIHJlcXVlc3RWYWxpZGF0b3I6IGJvZHlWYWxpZGF0b3IsXHJcbiAgICAgIG1ldGhvZFJlc3BvbnNlczogW1xyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzIwMCcgfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDAnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDAxJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzUwMCcsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFBPU1QgL3YxL2F1dGgvdmVyaWZ5LW90cFxyXG4gICAgY29uc3QgdmVyaWZ5T3RwUmVzb3VyY2UgPSBhdXRoUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3ZlcmlmeS1vdHAnKTtcclxuICAgIHZlcmlmeU90cFJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb3BzLnZlcmlmeU90cExhbWJkYSksIHtcclxuICAgICAgcmVxdWVzdFZhbGlkYXRvcjogYm9keVZhbGlkYXRvcixcclxuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnMjAwJyB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwMCcsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc1MDAnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBQT1NUIC92MS9hdXRoL3JlZnJlc2hcclxuICAgIGNvbnN0IHJlZnJlc2hSZXNvdXJjZSA9IGF1dGhSZXNvdXJjZS5hZGRSZXNvdXJjZSgncmVmcmVzaCcpO1xyXG4gICAgcmVmcmVzaFJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb3BzLnJlZnJlc2hUb2tlbkxhbWJkYSksIHtcclxuICAgICAgcmVxdWVzdFZhbGlkYXRvcjogYm9keVZhbGlkYXRvcixcclxuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnMjAwJyB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwMCcsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDEnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNTAwJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICBdLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PSBQcm9wZXJ0eSBFbmRwb2ludHMgKFByb3RlY3RlZCkgPT09PT09PT09PVxyXG4gICAgY29uc3QgcHJvcGVydGllc1Jlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgncHJvcGVydGllcycpO1xyXG5cclxuICAgIC8vIFBPU1QgL3YxL3Byb3BlcnRpZXNcclxuICAgIHByb3BlcnRpZXNSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy5jcmVhdGVQcm9wZXJ0eUxhbWJkYSksIHtcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgICAgcmVxdWVzdFZhbGlkYXRvcjogYm9keVZhbGlkYXRvcixcclxuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnMjAxJyB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwMCcsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDEnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNTAwJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICBdLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gR0VUIC92MS9wcm9wZXJ0aWVzXHJcbiAgICBwcm9wZXJ0aWVzUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy5saXN0UHJvcGVydGllc0xhbWJkYSksIHtcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcclxuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucXVlcnlzdHJpbmcuc3RhdHVzJzogZmFsc2UsXHJcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnF1ZXJ5c3RyaW5nLnN0YXJ0RGF0ZSc6IGZhbHNlLFxyXG4gICAgICAgICdtZXRob2QucmVxdWVzdC5xdWVyeXN0cmluZy5lbmREYXRlJzogZmFsc2UsXHJcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnF1ZXJ5c3RyaW5nLmxpbWl0JzogZmFsc2UsXHJcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnF1ZXJ5c3RyaW5nLm5leHRUb2tlbic6IGZhbHNlLFxyXG4gICAgICB9LFxyXG4gICAgICBtZXRob2RSZXNwb25zZXM6IFtcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICcyMDAnIH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDAxJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzUwMCcsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFByb3BlcnR5IGJ5IElEIHJlc291cmNlXHJcbiAgICBjb25zdCBwcm9wZXJ0eVJlc291cmNlID0gcHJvcGVydGllc1Jlc291cmNlLmFkZFJlc291cmNlKCd7aWR9Jyk7XHJcblxyXG4gICAgLy8gR0VUIC92MS9wcm9wZXJ0aWVzL3tpZH1cclxuICAgIHByb3BlcnR5UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy5nZXRQcm9wZXJ0eUxhbWJkYSksIHtcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcclxuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucGF0aC5pZCc6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIHJlcXVlc3RWYWxpZGF0b3I6IHBhcmFtc1ZhbGlkYXRvcixcclxuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnMjAwJyB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwMScsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDMnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDA0JywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzUwMCcsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIERFTEVURSAvdjEvcHJvcGVydGllcy97aWR9XHJcbiAgICBwcm9wZXJ0eVJlc291cmNlLmFkZE1ldGhvZCgnREVMRVRFJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMuZGVsZXRlUHJvcGVydHlMYW1iZGEpLCB7XHJcbiAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XHJcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnBhdGguaWQnOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICByZXF1ZXN0VmFsaWRhdG9yOiBwYXJhbXNWYWxpZGF0b3IsXHJcbiAgICAgIG1ldGhvZFJlc3BvbnNlczogW1xyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzIwNCcgfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDEnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDAzJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwNCcsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc1MDAnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBQT1NUIC92MS9wcm9wZXJ0aWVzL3tpZH0vdXBsb2FkLXVybFxyXG4gICAgY29uc3QgdXBsb2FkVXJsUmVzb3VyY2UgPSBwcm9wZXJ0eVJlc291cmNlLmFkZFJlc291cmNlKCd1cGxvYWQtdXJsJyk7XHJcbiAgICB1cGxvYWRVcmxSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy5nZW5lcmF0ZVVwbG9hZFVybExhbWJkYSksIHtcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgICAgcmVxdWVzdFZhbGlkYXRvcjogYm9keVZhbGlkYXRvcixcclxuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnMjAwJyB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwMCcsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDEnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDAzJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzUwMCcsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFBPU1QgL3YxL3Byb3BlcnRpZXMve2lkfS9kb2N1bWVudHNcclxuICAgIGNvbnN0IGRvY3VtZW50c1Jlc291cmNlID0gcHJvcGVydHlSZXNvdXJjZS5hZGRSZXNvdXJjZSgnZG9jdW1lbnRzJyk7XHJcbiAgICBkb2N1bWVudHNSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy5yZWdpc3RlckRvY3VtZW50TGFtYmRhKSwge1xyXG4gICAgICBhdXRob3JpemVyLFxyXG4gICAgICByZXF1ZXN0VmFsaWRhdG9yOiBib2R5VmFsaWRhdG9yLFxyXG4gICAgICBtZXRob2RSZXNwb25zZXM6IFtcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICcyMDEnIH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDAwJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwMScsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDMnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNTAwJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICBdLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gR0VUIC92MS9wcm9wZXJ0aWVzL3tpZH0vbGluZWFnZVxyXG4gICAgY29uc3QgbGluZWFnZVJlc291cmNlID0gcHJvcGVydHlSZXNvdXJjZS5hZGRSZXNvdXJjZSgnbGluZWFnZScpO1xyXG4gICAgbGluZWFnZVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMuZ2V0TGluZWFnZUxhbWJkYSksIHtcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcclxuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucGF0aC5pZCc6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIHJlcXVlc3RWYWxpZGF0b3I6IHBhcmFtc1ZhbGlkYXRvcixcclxuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnMjAwJyB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwMScsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDMnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDA0JywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzUwMCcsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdFVCAvdjEvcHJvcGVydGllcy97aWR9L3RydXN0LXNjb3JlXHJcbiAgICBjb25zdCB0cnVzdFNjb3JlUmVzb3VyY2UgPSBwcm9wZXJ0eVJlc291cmNlLmFkZFJlc291cmNlKCd0cnVzdC1zY29yZScpO1xyXG4gICAgdHJ1c3RTY29yZVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMuZ2V0VHJ1c3RTY29yZUxhbWJkYSksIHtcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcclxuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucGF0aC5pZCc6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIHJlcXVlc3RWYWxpZGF0b3I6IHBhcmFtc1ZhbGlkYXRvcixcclxuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnMjAwJyB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwMScsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDMnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDA0JywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzUwMCcsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdFVCAvdjEvcHJvcGVydGllcy97aWR9L3JlcG9ydFxyXG4gICAgY29uc3QgcmVwb3J0UmVzb3VyY2UgPSBwcm9wZXJ0eVJlc291cmNlLmFkZFJlc291cmNlKCdyZXBvcnQnKTtcclxuICAgIHJlcG9ydFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMuZ2VuZXJhdGVSZXBvcnRMYW1iZGEpLCB7XHJcbiAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XHJcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnBhdGguaWQnOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICByZXF1ZXN0VmFsaWRhdG9yOiBwYXJhbXNWYWxpZGF0b3IsXHJcbiAgICAgIG1ldGhvZFJlc3BvbnNlczogW1xyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzIwMCcgfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDEnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDAzJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwNCcsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc1MDAnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09IEFkbWluIEVuZHBvaW50cyAoUHJvdGVjdGVkIC0gQWRtaW4gT25seSkgPT09PT09PT09PVxyXG4gICAgY29uc3QgYWRtaW5SZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2FkbWluJyk7XHJcblxyXG4gICAgLy8gR0VUIC92MS9hZG1pbi91c2Vyc1xyXG4gICAgY29uc3QgdXNlcnNSZXNvdXJjZSA9IGFkbWluUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3VzZXJzJyk7XHJcbiAgICB1c2Vyc1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMubGlzdFVzZXJzTGFtYmRhKSwge1xyXG4gICAgICBhdXRob3JpemVyLFxyXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xyXG4gICAgICAgICdtZXRob2QucmVxdWVzdC5xdWVyeXN0cmluZy5saW1pdCc6IGZhbHNlLFxyXG4gICAgICAgICdtZXRob2QucmVxdWVzdC5xdWVyeXN0cmluZy5uZXh0VG9rZW4nOiBmYWxzZSxcclxuICAgICAgfSxcclxuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnMjAwJyB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwMScsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDMnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNTAwJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICBdLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gUFVUIC92MS9hZG1pbi91c2Vycy97aWR9L3JvbGVcclxuICAgIGNvbnN0IHVzZXJSZXNvdXJjZSA9IHVzZXJzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3tpZH0nKTtcclxuICAgIGNvbnN0IHJvbGVSZXNvdXJjZSA9IHVzZXJSZXNvdXJjZS5hZGRSZXNvdXJjZSgncm9sZScpO1xyXG4gICAgcm9sZVJlc291cmNlLmFkZE1ldGhvZCgnUFVUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMudXBkYXRlVXNlclJvbGVMYW1iZGEpLCB7XHJcbiAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICAgIHJlcXVlc3RWYWxpZGF0b3I6IGJvZHlWYWxpZGF0b3IsXHJcbiAgICAgIG1ldGhvZFJlc3BvbnNlczogW1xyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzIwMCcgfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDAnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDAxJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwMycsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDQnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNTAwJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICBdLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gUFVUIC92MS9hZG1pbi91c2Vycy97aWR9L2RlYWN0aXZhdGVcclxuICAgIGNvbnN0IGRlYWN0aXZhdGVSZXNvdXJjZSA9IHVzZXJSZXNvdXJjZS5hZGRSZXNvdXJjZSgnZGVhY3RpdmF0ZScpO1xyXG4gICAgZGVhY3RpdmF0ZVJlc291cmNlLmFkZE1ldGhvZCgnUFVUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMuZGVhY3RpdmF0ZVVzZXJMYW1iZGEpLCB7XHJcbiAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICAgIG1ldGhvZFJlc3BvbnNlczogW1xyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzIwMCcgfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDEnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDAzJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwNCcsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc1MDAnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHRVQgL3YxL2FkbWluL2F1ZGl0LWxvZ3NcclxuICAgIGNvbnN0IGF1ZGl0TG9nc1Jlc291cmNlID0gYWRtaW5SZXNvdXJjZS5hZGRSZXNvdXJjZSgnYXVkaXQtbG9ncycpO1xyXG4gICAgYXVkaXRMb2dzUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy5zZWFyY2hBdWRpdExvZ3NMYW1iZGEpLCB7XHJcbiAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XHJcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnF1ZXJ5c3RyaW5nLnVzZXJJZCc6IGZhbHNlLFxyXG4gICAgICAgICdtZXRob2QucmVxdWVzdC5xdWVyeXN0cmluZy5hY3Rpb24nOiBmYWxzZSxcclxuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucXVlcnlzdHJpbmcucmVzb3VyY2VUeXBlJzogZmFsc2UsXHJcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnF1ZXJ5c3RyaW5nLnN0YXJ0RGF0ZSc6IGZhbHNlLFxyXG4gICAgICAgICdtZXRob2QucmVxdWVzdC5xdWVyeXN0cmluZy5lbmREYXRlJzogZmFsc2UsXHJcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnF1ZXJ5c3RyaW5nLmxpbWl0JzogZmFsc2UsXHJcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnF1ZXJ5c3RyaW5nLm5leHRUb2tlbic6IGZhbHNlLFxyXG4gICAgICB9LFxyXG4gICAgICBtZXRob2RSZXNwb25zZXM6IFtcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICcyMDAnIH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDAxJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwMycsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc1MDAnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHRVQgL3YxL2FkbWluL2F1ZGl0LWxvZ3MvZXhwb3J0XHJcbiAgICBjb25zdCBleHBvcnRBdWRpdExvZ3NSZXNvdXJjZSA9IGF1ZGl0TG9nc1Jlc291cmNlLmFkZFJlc291cmNlKCdleHBvcnQnKTtcclxuICAgIGV4cG9ydEF1ZGl0TG9nc1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMuZXhwb3J0QXVkaXRMb2dzTGFtYmRhKSwge1xyXG4gICAgICBhdXRob3JpemVyLFxyXG4gICAgICBtZXRob2RSZXNwb25zZXM6IFtcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICcyMDAnIH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDAxJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwMycsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc1MDAnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09IFVzZXIgRW5kcG9pbnRzIChQcm90ZWN0ZWQpID09PT09PT09PT1cclxuICAgIGNvbnN0IHVzZXJzUm9vdFJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgndXNlcnMnKTtcclxuXHJcbiAgICAvLyBHRVQgL3YxL3VzZXJzL2V4cG9ydFxyXG4gICAgY29uc3QgZXhwb3J0VXNlckRhdGFSZXNvdXJjZSA9IHVzZXJzUm9vdFJlc291cmNlLmFkZFJlc291cmNlKCdleHBvcnQnKTtcclxuICAgIGV4cG9ydFVzZXJEYXRhUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy5leHBvcnRVc2VyRGF0YUxhbWJkYSksIHtcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnMjAwJyB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzQwMScsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICc1MDAnLCByZXNwb25zZU1vZGVsczogeyAnYXBwbGljYXRpb24vanNvbic6IGVycm9yUmVzcG9uc2VNb2RlbCB9IH0sXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHRVQgL3YxL3VzZXJzL25vdGlmaWNhdGlvbnNcclxuICAgIGNvbnN0IG5vdGlmaWNhdGlvbnNSZXNvdXJjZSA9IHVzZXJzUm9vdFJlc291cmNlLmFkZFJlc291cmNlKCdub3RpZmljYXRpb25zJyk7XHJcbiAgICBub3RpZmljYXRpb25zUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy5nZXROb3RpZmljYXRpb25zTGFtYmRhKSwge1xyXG4gICAgICBhdXRob3JpemVyLFxyXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xyXG4gICAgICAgICdtZXRob2QucmVxdWVzdC5xdWVyeXN0cmluZy5saW1pdCc6IGZhbHNlLFxyXG4gICAgICAgICdtZXRob2QucmVxdWVzdC5xdWVyeXN0cmluZy5uZXh0VG9rZW4nOiBmYWxzZSxcclxuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucXVlcnlzdHJpbmcudW5yZWFkT25seSc6IGZhbHNlLFxyXG4gICAgICB9LFxyXG4gICAgICBtZXRob2RSZXNwb25zZXM6IFtcclxuICAgICAgICB7IHN0YXR1c0NvZGU6ICcyMDAnIH0sXHJcbiAgICAgICAgeyBzdGF0dXNDb2RlOiAnNDAxJywgcmVzcG9uc2VNb2RlbHM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiBlcnJvclJlc3BvbnNlTW9kZWwgfSB9LFxyXG4gICAgICAgIHsgc3RhdHVzQ29kZTogJzUwMCcsIHJlc3BvbnNlTW9kZWxzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogZXJyb3JSZXNwb25zZU1vZGVsIH0gfSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vID09PT09PT09PT0gVXNhZ2UgUGxhbiBhbmQgUmF0ZSBMaW1pdGluZyA9PT09PT09PT09XHJcbiAgICAvLyBDcmVhdGUgQVBJIGtleSBmb3IgdXNhZ2UgcGxhblxyXG4gICAgY29uc3QgYXBpS2V5ID0gdGhpcy5hcGkuYWRkQXBpS2V5KCdTYXR5YU1vb2xBcGlLZXknLCB7XHJcbiAgICAgIGFwaUtleU5hbWU6ICdTYXR5YU1vb2wtRGVmYXVsdC1LZXknLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0RlZmF1bHQgQVBJIGtleSBmb3IgU2F0eWFNb29sJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSB1c2FnZSBwbGFuIHdpdGggcmF0ZSBsaW1pdGluZyAoMTAwIHJlcXVlc3RzIHBlciBtaW51dGUgcGVyIHVzZXIpXHJcbiAgICB0aGlzLnVzYWdlUGxhbiA9IHRoaXMuYXBpLmFkZFVzYWdlUGxhbignU2F0eWFNb29sVXNhZ2VQbGFuJywge1xyXG4gICAgICBuYW1lOiAnU2F0eWFNb29sLVN0YW5kYXJkLVBsYW4nLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1N0YW5kYXJkIHVzYWdlIHBsYW4gd2l0aCByYXRlIGxpbWl0aW5nJyxcclxuICAgICAgdGhyb3R0bGU6IHtcclxuICAgICAgICByYXRlTGltaXQ6IDEwMCwgLy8gMTAwIHJlcXVlc3RzIHBlciBzZWNvbmRcclxuICAgICAgICBidXJzdExpbWl0OiAyMDAsIC8vIEFsbG93IGJ1cnN0IG9mIDIwMCByZXF1ZXN0c1xyXG4gICAgICB9LFxyXG4gICAgICBxdW90YToge1xyXG4gICAgICAgIGxpbWl0OiAxMDAwMDAsIC8vIDEwMCwwMDAgcmVxdWVzdHMgcGVyIG1vbnRoXHJcbiAgICAgICAgcGVyaW9kOiBhcGlnYXRld2F5LlBlcmlvZC5NT05USCxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFzc29jaWF0ZSB1c2FnZSBwbGFuIHdpdGggQVBJIHN0YWdlXHJcbiAgICB0aGlzLnVzYWdlUGxhbi5hZGRBcGlTdGFnZSh7XHJcbiAgICAgIHN0YWdlOiB0aGlzLmFwaS5kZXBsb3ltZW50U3RhZ2UsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBc3NvY2lhdGUgQVBJIGtleSB3aXRoIHVzYWdlIHBsYW5cclxuICAgIHRoaXMudXNhZ2VQbGFuLmFkZEFwaUtleShhcGlLZXkpO1xyXG5cclxuICAgIC8vIE91dHB1dCBBUEkgR2F0ZXdheSBkZXRhaWxzXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpVXJsJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5hcGkudXJsLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IFVSTCcsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtQXBpVXJsJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlJZCcsIHtcclxuICAgICAgdmFsdWU6IHRoaXMuYXBpLnJlc3RBcGlJZCxcclxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBJRCcsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtQXBpSWQnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUtleUlkJywge1xyXG4gICAgICB2YWx1ZTogYXBpS2V5LmtleUlkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBLZXkgSUQnLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLUFwaUtleUlkJyxcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG4iXX0=