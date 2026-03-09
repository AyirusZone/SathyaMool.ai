"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainApiGateway = void 0;
const cdk = require("aws-cdk-lib");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const logs = require("aws-cdk-lib/aws-logs");
const constructs_1 = require("constructs");
class MainApiGateway extends constructs_1.Construct {
    constructor(scope, id, props) {
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
        registerResource.addMethod('POST', new apigateway.LambdaIntegration(props.registerLambda));
        // POST /v1/auth/login
        const loginResource = authResource.addResource('login');
        loginResource.addMethod('POST', new apigateway.LambdaIntegration(props.loginLambda));
        // POST /v1/auth/verify-otp
        const verifyOtpResource = authResource.addResource('verify-otp');
        verifyOtpResource.addMethod('POST', new apigateway.LambdaIntegration(props.verifyOtpLambda));
        // POST /v1/auth/refresh
        const refreshResource = authResource.addResource('refresh');
        refreshResource.addMethod('POST', new apigateway.LambdaIntegration(props.refreshTokenLambda));
        // ========== Properties Endpoints ==========
        const propertiesResource = this.api.root.addResource('properties');
        // POST /v1/properties - Create property
        propertiesResource.addMethod('POST', new apigateway.LambdaIntegration(props.createPropertyLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // GET /v1/properties - List properties
        propertiesResource.addMethod('GET', new apigateway.LambdaIntegration(props.listPropertiesLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // GET /v1/properties/{propertyId}
        const propertyResource = propertiesResource.addResource('{propertyId}');
        propertyResource.addMethod('GET', new apigateway.LambdaIntegration(props.getPropertyLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // DELETE /v1/properties/{propertyId}
        propertyResource.addMethod('DELETE', new apigateway.LambdaIntegration(props.deletePropertyLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // GET /v1/properties/{propertyId}/lineage
        const lineageResource = propertyResource.addResource('lineage');
        lineageResource.addMethod('GET', new apigateway.LambdaIntegration(props.getLineageLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // GET /v1/properties/{propertyId}/trust-score
        const trustScoreResource = propertyResource.addResource('trust-score');
        trustScoreResource.addMethod('GET', new apigateway.LambdaIntegration(props.getTrustScoreLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // POST /v1/properties/{propertyId}/report
        const reportResource = propertyResource.addResource('report');
        reportResource.addMethod('POST', new apigateway.LambdaIntegration(props.generateReportLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // POST /v1/properties/{propertyId}/upload-url
        const uploadUrlResource = propertyResource.addResource('upload-url');
        uploadUrlResource.addMethod('POST', new apigateway.LambdaIntegration(props.generateUploadUrlLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // POST /v1/properties/{propertyId}/documents - Register document
        const documentsResource = propertyResource.addResource('documents');
        documentsResource.addMethod('POST', new apigateway.LambdaIntegration(props.registerDocumentLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // GET /v1/properties/{propertyId}/documents - Get documents
        documentsResource.addMethod('GET', new apigateway.LambdaIntegration(props.getDocumentsLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // ========== Notifications Endpoint ==========
        const notificationsResource = this.api.root.addResource('notifications');
        // GET /v1/notifications - Get user notifications
        notificationsResource.addMethod('GET', new apigateway.LambdaIntegration(props.getNotificationsLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
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
exports.MainApiGateway = MainApiGateway;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi1hcGktZ2F0ZXdheS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9tYWluLWFwaS1nYXRld2F5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQyx5REFBeUQ7QUFFekQsNkNBQTZDO0FBQzdDLDJDQUF1QztBQXdCdkMsTUFBYSxjQUFlLFNBQVEsc0JBQVM7SUFHM0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEwQjtRQUNsRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLDhCQUE4QjtRQUM5QixNQUFNLGNBQWMsR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUM5RCxZQUFZLEVBQUUsMkNBQTJDO1lBQ3pELFNBQVMsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVE7WUFDdEMsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztTQUN6QyxDQUFDLENBQUM7UUFFSCxrQkFBa0I7UUFDbEIsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzFELFdBQVcsRUFBRSxvQkFBb0I7WUFDakMsV0FBVyxFQUFFLG1DQUFtQztZQUNoRCxhQUFhLEVBQUU7Z0JBQ2IsU0FBUyxFQUFFLElBQUk7Z0JBQ2YsY0FBYyxFQUFFLElBQUk7Z0JBQ3BCLGdCQUFnQixFQUFFLElBQUk7Z0JBQ3RCLFlBQVksRUFBRSxVQUFVLENBQUMsa0JBQWtCLENBQUMsSUFBSTtnQkFDaEQsY0FBYyxFQUFFLElBQUk7Z0JBQ3BCLG9CQUFvQixFQUFFLElBQUksVUFBVSxDQUFDLHNCQUFzQixDQUFDLGNBQWMsQ0FBQztnQkFDM0UsZUFBZSxFQUFFLFVBQVUsQ0FBQyxlQUFlLENBQUMsc0JBQXNCLENBQUM7b0JBQ2pFLE1BQU0sRUFBRSxJQUFJO29CQUNaLFVB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RDtRQUM1RCxpQkFBaUIsQ0FBQyxTQUFTLENBQ3pCLEtBQUssRUFDTCxJQUFJLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsRUFDMUQ7WUFDRSxVQUFVLEVBQUUsVUFBVTtZQUN0QixpQkFBaUIsRUFBRSxVQUFVLENBQUMsaUJBQWlCLENBQUMsTUFBTTtTQUN2RCxDQUNGLENBQUM7UUFFRiwrQ0FBK0M7UUFDL0MsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFekUsaURBQWlEO1FBQ2pELHFCQUFxQixDQUFDLFNBQVMsQ0FDN0IsS0FBSyxFQUNMLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxFQUM5RDtZQUNFLFVBQVUsRUFBRSxVQUFVO1lBQ3RCLGlCQUFpQixFQUFFLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNO1NBQ3ZELENBQ0YsQ0FBQztRQUVGLFVBQVU7UUFDVixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHO1lBQ25CLFdBQVcsRUFBRSxzQkFBc0I7WUFDbkMsVUFBVSxFQUFFLHNCQUFzQjtTQUNuQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUNuQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTO1lBQ3pCLFdBQVcsRUFBRSxxQkFBcUI7WUFDbEMsVUFBVSxFQUFFLHFCQUFxQjtTQUNsQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFsT0Qsd0NBa09DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XHJcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcclxuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBNYWluQXBpR2F0ZXdheVByb3BzIHtcclxuICBhdXRob3JpemVyTGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIC8vIEF1dGggTGFtYmRhc1xyXG4gIHJlZ2lzdGVyTGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIGxvZ2luTGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIHZlcmlmeU90cExhbWJkYTogbGFtYmRhLklGdW5jdGlvbjtcclxuICByZWZyZXNoVG9rZW5MYW1iZGE6IGxhbWJkYS5JRnVuY3Rpb247XHJcbiAgLy8gUHJvcGVydHkgTGFtYmRhc1xyXG4gIGNyZWF0ZVByb3BlcnR5TGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIGxpc3RQcm9wZXJ0aWVzTGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIGdldFByb3BlcnR5TGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIGRlbGV0ZVByb3BlcnR5TGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIGdlbmVyYXRlVXBsb2FkVXJsTGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIHJlZ2lzdGVyRG9jdW1lbnRMYW1iZGE6IGxhbWJkYS5JRnVuY3Rpb247XHJcbiAgZ2V0RG9jdW1lbnRzTGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIGdldExpbmVhZ2VMYW1iZGE6IGxhbWJkYS5JRnVuY3Rpb247XHJcbiAgZ2V0VHJ1c3RTY29yZUxhbWJkYTogbGFtYmRhLklGdW5jdGlvbjtcclxuICBnZW5lcmF0ZVJlcG9ydExhbWJkYTogbGFtYmRhLklGdW5jdGlvbjtcclxuICAvLyBOb3RpZmljYXRpb24gTGFtYmRhXHJcbiAgZ2V0Tm90aWZpY2F0aW9uc0xhbWJkYTogbGFtYmRhLklGdW5jdGlvbjtcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIE1haW5BcGlHYXRld2F5IGV4dGVuZHMgQ29uc3RydWN0IHtcclxuICBwdWJsaWMgcmVhZG9ubHkgYXBpOiBhcGlnYXRld2F5LlJlc3RBcGk7XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBNYWluQXBpR2F0ZXdheVByb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQpO1xyXG5cclxuICAgIC8vIENyZWF0ZSBDbG91ZFdhdGNoIExvZyBHcm91cFxyXG4gICAgY29uc3QgYWNjZXNzTG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnQXBpQWNjZXNzTG9ncycsIHtcclxuICAgICAgbG9nR3JvdXBOYW1lOiAnL2F3cy9hcGlnYXRld2F5L3NhdHlhbW9vbC1tYWluLWFwaS1hY2Nlc3MnLFxyXG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSBSRVNUIEFQSVxyXG4gICAgdGhpcy5hcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdTYXR5YU1vb2xNYWluQXBpJywge1xyXG4gICAgICByZXN0QXBpTmFtZTogJ1NhdHlhTW9vbCBNYWluIEFQSScsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2F0eWFNb29sIFByb3BlcnR5IE1hbmFnZW1lbnQgQVBJJyxcclxuICAgICAgZGVwbG95T3B0aW9uczoge1xyXG4gICAgICAgIHN0YWdlTmFtZTogJ3YxJyxcclxuICAgICAgICB0cmFjaW5nRW5hYmxlZDogdHJ1ZSxcclxuICAgICAgICBkYXRhVHJhY2VFbmFibGVkOiB0cnVlLFxyXG4gICAgICAgIGxvZ2dpbmdMZXZlbDogYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuSU5GTyxcclxuICAgICAgICBtZXRyaWNzRW5hYmxlZDogdHJ1ZSxcclxuICAgICAgICBhY2Nlc3NMb2dEZXN0aW5hdGlvbjogbmV3IGFwaWdhdGV3YXkuTG9nR3JvdXBMb2dEZXN0aW5hdGlvbihhY2Nlc3NMb2dHcm91cCksXHJcbiAgICAgICAgYWNjZXNzTG9nRm9ybWF0OiBhcGlnYXRld2F5LkFjY2Vzc0xvZ0Zvcm1hdC5qc29uV2l0aFN0YW5kYXJkRmllbGRzKHtcclxuICAgICAgICAgIGNhbGxlcjogdHJ1ZSxcclxuICAgICAgICAgIGh0dHBNZXRob2Q6IHRydWUsXHJcbiAgICAgICAgICBpcDogdHJ1ZSxcclxuICAgICAgICAgIHByb3RvY29sOiB0cnVlLFxyXG4gICAgICAgICAgcmVxdWVzdFRpbWU6IHRydWUsXHJcbiAgICAgICAgICByZXNvdXJjZVBhdGg6IHRydWUsXHJcbiAgICAgICAgICByZXNwb25zZUxlbmd0aDogdHJ1ZSxcclxuICAgICAgICAgIHN0YXR1czogdHJ1ZSxcclxuICAgICAgICAgIHVzZXI6IHRydWUsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH0sXHJcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xyXG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxyXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxyXG4gICAgICAgIGFsbG93SGVhZGVyczogW1xyXG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZScsXHJcbiAgICAgICAgICAnWC1BbXotRGF0ZScsXHJcbiAgICAgICAgICAnQXV0aG9yaXphdGlvbicsXHJcbiAgICAgICAgICAnWC1BcGktS2V5JyxcclxuICAgICAgICAgICdYLUFtei1TZWN1cml0eS1Ub2tlbicsXHJcbiAgICAgICAgXSxcclxuICAgICAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxyXG4gICAgICAgIG1heEFnZTogY2RrLkR1cmF0aW9uLmhvdXJzKDEpLFxyXG4gICAgICB9LFxyXG4gICAgICBjbG91ZFdhdGNoUm9sZTogdHJ1ZSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSBMYW1iZGEgQXV0aG9yaXplclxyXG4gICAgY29uc3QgYXV0aG9yaXplciA9IG5ldyBhcGlnYXRld2F5LlRva2VuQXV0aG9yaXplcih0aGlzLCAnSnd0QXV0aG9yaXplcicsIHtcclxuICAgICAgaGFuZGxlcjogcHJvcHMuYXV0aG9yaXplckxhbWJkYSxcclxuICAgICAgaWRlbnRpdHlTb3VyY2U6ICdtZXRob2QucmVxdWVzdC5oZWFkZXIuQXV0aG9yaXphdGlvbicsXHJcbiAgICAgIGF1dGhvcml6ZXJOYW1lOiAnand0LWF1dGhvcml6ZXInLFxyXG4gICAgICByZXN1bHRzQ2FjaGVUdGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PSBBdXRoIEVuZHBvaW50cyAoTm8gQXV0aG9yaXphdGlvbiBSZXF1aXJlZCkgPT09PT09PT09PVxyXG4gICAgY29uc3QgYXV0aFJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnYXV0aCcpO1xyXG5cclxuICAgIC8vIFBPU1QgL3YxL2F1dGgvcmVnaXN0ZXJcclxuICAgIGNvbnN0IHJlZ2lzdGVyUmVzb3VyY2UgPSBhdXRoUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3JlZ2lzdGVyJyk7XHJcbiAgICByZWdpc3RlclJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgJ1BPU1QnLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy5yZWdpc3RlckxhbWJkYSlcclxuICAgICk7XHJcblxyXG4gICAgLy8gUE9TVCAvdjEvYXV0aC9sb2dpblxyXG4gICAgY29uc3QgbG9naW5SZXNvdXJjZSA9IGF1dGhSZXNvdXJjZS5hZGRSZXNvdXJjZSgnbG9naW4nKTtcclxuICAgIGxvZ2luUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICAnUE9TVCcsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb3BzLmxvZ2luTGFtYmRhKVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBQT1NUIC92MS9hdXRoL3ZlcmlmeS1vdHBcclxuICAgIGNvbnN0IHZlcmlmeU90cFJlc291cmNlID0gYXV0aFJlc291cmNlLmFkZFJlc291cmNlKCd2ZXJpZnktb3RwJyk7XHJcbiAgICB2ZXJpZnlPdHBSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgICdQT1NUJyxcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMudmVyaWZ5T3RwTGFtYmRhKVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBQT1NUIC92MS9hdXRoL3JlZnJlc2hcclxuICAgIGNvbnN0IHJlZnJlc2hSZXNvdXJjZSA9IGF1dGhSZXNvdXJjZS5hZGRSZXNvdXJjZSgncmVmcmVzaCcpO1xyXG4gICAgcmVmcmVzaFJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgJ1BPU1QnLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy5yZWZyZXNoVG9rZW5MYW1iZGEpXHJcbiAgICApO1xyXG5cclxuICAgIC8vID09PT09PT09PT0gUHJvcGVydGllcyBFbmRwb2ludHMgPT09PT09PT09PVxyXG4gICAgY29uc3QgcHJvcGVydGllc1Jlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgncHJvcGVydGllcycpO1xyXG5cclxuICAgIC8vIFBPU1QgL3YxL3Byb3BlcnRpZXMgLSBDcmVhdGUgcHJvcGVydHlcclxuICAgIHByb3BlcnRpZXNSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgICdQT1NUJyxcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMuY3JlYXRlUHJvcGVydHlMYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgLy8gR0VUIC92MS9wcm9wZXJ0aWVzIC0gTGlzdCBwcm9wZXJ0aWVzXHJcbiAgICBwcm9wZXJ0aWVzUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICAnR0VUJyxcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMubGlzdFByb3BlcnRpZXNMYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgLy8gR0VUIC92MS9wcm9wZXJ0aWVzL3twcm9wZXJ0eUlkfVxyXG4gICAgY29uc3QgcHJvcGVydHlSZXNvdXJjZSA9IHByb3BlcnRpZXNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3Byb3BlcnR5SWR9Jyk7XHJcbiAgICBwcm9wZXJ0eVJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgJ0dFVCcsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb3BzLmdldFByb3BlcnR5TGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIC8vIERFTEVURSAvdjEvcHJvcGVydGllcy97cHJvcGVydHlJZH1cclxuICAgIHByb3BlcnR5UmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICAnREVMRVRFJyxcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMuZGVsZXRlUHJvcGVydHlMYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgLy8gR0VUIC92MS9wcm9wZXJ0aWVzL3twcm9wZXJ0eUlkfS9saW5lYWdlXHJcbiAgICBjb25zdCBsaW5lYWdlUmVzb3VyY2UgPSBwcm9wZXJ0eVJlc291cmNlLmFkZFJlc291cmNlKCdsaW5lYWdlJyk7XHJcbiAgICBsaW5lYWdlUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICAnR0VUJyxcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMuZ2V0TGluZWFnZUxhbWJkYSksXHJcbiAgICAgIHtcclxuICAgICAgICBhdXRob3JpemVyOiBhdXRob3JpemVyLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcclxuICAgICAgfVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBHRVQgL3YxL3Byb3BlcnRpZXMve3Byb3BlcnR5SWR9L3RydXN0LXNjb3JlXHJcbiAgICBjb25zdCB0cnVzdFNjb3JlUmVzb3VyY2UgPSBwcm9wZXJ0eVJlc291cmNlLmFkZFJlc291cmNlKCd0cnVzdC1zY29yZScpO1xyXG4gICAgdHJ1c3RTY29yZVJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgJ0dFVCcsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb3BzLmdldFRydXN0U2NvcmVMYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgLy8gUE9TVCAvdjEvcHJvcGVydGllcy97cHJvcGVydHlJZH0vcmVwb3J0XHJcbiAgICBjb25zdCByZXBvcnRSZXNvdXJjZSA9IHByb3BlcnR5UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3JlcG9ydCcpO1xyXG4gICAgcmVwb3J0UmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICAnUE9TVCcsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb3BzLmdlbmVyYXRlUmVwb3J0TGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIC8vIFBPU1QgL3YxL3Byb3BlcnRpZXMve3Byb3BlcnR5SWR9L3VwbG9hZC11cmxcclxuICAgIGNvbnN0IHVwbG9hZFVybFJlc291cmNlID0gcHJvcGVydHlSZXNvdXJjZS5hZGRSZXNvdXJjZSgndXBsb2FkLXVybCcpO1xyXG4gICAgdXBsb2FkVXJsUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICAnUE9TVCcsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb3BzLmdlbmVyYXRlVXBsb2FkVXJsTGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIC8vIFBPU1QgL3YxL3Byb3BlcnRpZXMve3Byb3BlcnR5SWR9L2RvY3VtZW50cyAtIFJlZ2lzdGVyIGRvY3VtZW50XHJcbiAgICBjb25zdCBkb2N1bWVudHNSZXNvdXJjZSA9IHByb3BlcnR5UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2RvY3VtZW50cycpO1xyXG4gICAgZG9jdW1lbnRzUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICAnUE9TVCcsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb3BzLnJlZ2lzdGVyRG9jdW1lbnRMYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgLy8gR0VUIC92MS9wcm9wZXJ0aWVzL3twcm9wZXJ0eUlkfS9kb2N1bWVudHMgLSBHZXQgZG9jdW1lbnRzXHJcbiAgICBkb2N1bWVudHNSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgICdHRVQnLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy5nZXREb2N1bWVudHNMYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PSBOb3RpZmljYXRpb25zIEVuZHBvaW50ID09PT09PT09PT1cclxuICAgIGNvbnN0IG5vdGlmaWNhdGlvbnNSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ25vdGlmaWNhdGlvbnMnKTtcclxuXHJcbiAgICAvLyBHRVQgL3YxL25vdGlmaWNhdGlvbnMgLSBHZXQgdXNlciBub3RpZmljYXRpb25zXHJcbiAgICBub3RpZmljYXRpb25zUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICAnR0VUJyxcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMuZ2V0Tm90aWZpY2F0aW9uc0xhbWJkYSksXHJcbiAgICAgIHtcclxuICAgICAgICBhdXRob3JpemVyOiBhdXRob3JpemVyLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcclxuICAgICAgfVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBPdXRwdXRzXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTWFpbkFwaVVybCcsIHtcclxuICAgICAgdmFsdWU6IHRoaXMuYXBpLnVybCxcclxuICAgICAgZGVzY3JpcHRpb246ICdNYWluIEFQSSBHYXRld2F5IFVSTCcsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtTWFpbkFwaVVybCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTWFpbkFwaUlkJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5hcGkucmVzdEFwaUlkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ01haW4gQVBJIEdhdGV3YXkgSUQnLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLU1haW5BcGlJZCcsXHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuIl19