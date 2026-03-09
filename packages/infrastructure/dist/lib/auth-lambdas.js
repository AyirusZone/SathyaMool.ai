"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthLambdas = void 0;
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const iam = require("aws-cdk-lib/aws-iam");
const constructs_1 = require("constructs");
const path = require("path");
class AuthLambdas extends constructs_1.Construct {
    constructor(scope, id, props) {
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
exports.AuthLambdas = AuthLambdas;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1sYW1iZGFzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2F1dGgtbGFtYmRhcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMsaURBQWlEO0FBR2pELDJDQUEyQztBQUMzQywyQ0FBdUM7QUFDdkMsNkJBQTZCO0FBVTdCLE1BQWEsV0FBWSxTQUFRLHNCQUFTO0lBT3hDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBdUI7UUFDL0QsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixvREFBb0Q7UUFDcEQsTUFBTSxTQUFTLEdBQUc7WUFDaEIsWUFBWSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsVUFBVTtZQUN2QyxtQkFBbUIsRUFBRSxLQUFLLENBQUMsY0FBYyxDQUFDLGdCQUFnQjtZQUMxRCxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsVUFBVSxDQUFDLFNBQVM7WUFDNUMscUJBQXFCLEVBQUUsS0FBSyxDQUFDLGNBQWMsQ0FBQyxTQUFTO1NBQ3RELENBQUM7UUFFRiw4QkFBOEI7UUFDOUIsTUFBTSxZQUFZLEdBQUc7WUFDbkIsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxZQUFZLEVBQUUsTUFBTSxDQUFDLFlBQVksQ0FBQyxNQUFNO1lBQ3hDLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsVUFBVSxFQUFFLEdBQUc7WUFDZixXQUFXLEVBQUUsU0FBUztZQUN0QixNQUFNLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDaEQsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTTtZQUM5QixZQUFZLEVBQUUsQ0FBQyxFQUFFLHlCQUF5QjtTQUMzQyxDQUFDO1FBRUYsa0JBQWtCO1FBQ2xCLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUNsRSxHQUFHLFlBQVk7WUFDZixZQUFZLEVBQUUseUJBQXlCO1lBQ3ZDLFdBQVcsRUFBRSwyQ0FBMkM7WUFDeEQsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLG9CQUFvQixDQUFDLENBQUM7WUFDdkUsT0FBTyxFQUFFLHVCQUF1QjtTQUNqQyxDQUFDLENBQUM7UUFFSCxlQUFlO1FBQ2YsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUM1RCxHQUFHLFlBQVk7WUFDZixZQUFZLEVBQUUsc0JBQXNCO1lBQ3BDLFdBQVcsRUFBRSx3Q0FBd0M7WUFDckQsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLG9CQUFvQixDQUFDLENBQUM7WUFDdkUsT0FBTyxFQUFFLG9CQUFvQjtTQUM5QixDQUFDLENBQUM7UUFFSCxvQkFBb0I7UUFDcEIsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQ3BFLEdBQUcsWUFBWTtZQUNmLFlBQVksRUFBRSwwQkFBMEI7WUFDeEMsV0FBVyxFQUFFLDRDQUE0QztZQUN6RCxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztZQUN2RSxPQUFPLEVBQUUseUJBQXlCO1NBQ25DLENBQUMsQ0FBQztRQUVILHVCQUF1QjtRQUN2QixJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUMxRSxHQUFHLFlBQVk7WUFDZixZQUFZLEVBQUUsNkJBQTZCO1lBQzNDLFdBQVcsRUFBRSwyQkFBMkI7WUFDeEMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLG9CQUFvQixDQUFDLENBQUM7WUFDdkUsT0FBTyxFQUFFLDRCQUE0QjtTQUN0QyxDQUFDLENBQUM7UUFFSCxvQkFBb0I7UUFDcEIsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDdEUsR0FBRyxZQUFZO1lBQ2YsWUFBWSxFQUFFLDJCQUEyQjtZQUN6QyxXQUFXLEVBQUUsc0NBQXNDO1lBQ25ELElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1lBQ3ZFLE9BQU8sRUFBRSwwQkFBMEI7U0FDcEMsQ0FBQyxDQUFDO1FBRUgsZ0RBQWdEO1FBQ2hELE1BQU0sYUFBYSxHQUFHLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUM1QyxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO1lBQ3hCLE9BQU8sRUFBRTtnQkFDUCwrQkFBK0I7Z0JBQy9CLDZCQUE2QjtnQkFDN0Isa0NBQWtDO2dCQUNsQyx1Q0FBdUM7Z0JBQ3ZDLDBCQUEwQjtnQkFDMUIsMEJBQTBCO2dCQUMxQixxQkFBcUI7Z0JBQ3JCLG9CQUFvQjtnQkFDcEIsMkJBQTJCO2dCQUMzQixvQ0FBb0M7YUFDckM7WUFDRCxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQztTQUN4QyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsY0FBYyxDQUFDLGVBQWUsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNoRCxJQUFJLENBQUMsZUFBZSxDQUFDLGVBQWUsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNwRCxJQUFJLENBQUMsa0JBQWtCLENBQUMsZUFBZSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3ZELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFckQsNkJBQTZCO1FBQzdCLEtBQUssQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ3pELEtBQUssQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3RELEtBQUssQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQzFELEtBQUssQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDN0QsS0FBSyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFFdEQsS0FBSyxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ3pELEtBQUssQ0FBQyxjQUFjLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN0RCxLQUFLLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDMUQsS0FBSyxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFFN0QsVUFBVTtRQUNWLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDM0MsS0FBSyxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsV0FBVztZQUN0QyxXQUFXLEVBQUUsOEJBQThCO1lBQzNDLFVBQVUsRUFBRSw2QkFBNkI7U0FDMUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUN4QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxXQUFXO1lBQ25DLFdBQVcsRUFBRSwyQkFBMkI7WUFDeEMsVUFBVSxFQUFFLDBCQUEwQjtTQUN2QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQzVDLEtBQUssRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLFdBQVc7WUFDdkMsV0FBVyxFQUFFLGdDQUFnQztZQUM3QyxVQUFVLEVBQUUsOEJBQThCO1NBQzNDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDL0MsS0FBSyxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxXQUFXO1lBQzFDLFdBQVcsRUFBRSxtQ0FBbUM7WUFDaEQsVUFBVSxFQUFFLGlDQUFpQztTQUM5QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHFCQUFxQixFQUFFO1lBQzdDLEtBQUssRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVztZQUN4QyxXQUFXLEVBQUUsZ0NBQWdDO1lBQzdDLFVBQVUsRUFBRSwrQkFBK0I7U0FDNUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBOUlELGtDQThJQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcclxuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcclxuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XHJcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhMYW1iZGFzUHJvcHMge1xyXG4gIHVzZXJQb29sOiBjb2duaXRvLklVc2VyUG9vbDtcclxuICB1c2VyUG9vbENsaWVudDogY29nbml0by5JVXNlclBvb2xDbGllbnQ7XHJcbiAgdXNlcnNUYWJsZTogZHluYW1vZGIuSVRhYmxlO1xyXG4gIGF1ZGl0TG9nc1RhYmxlOiBkeW5hbW9kYi5JVGFibGU7XHJcbiAgbm9kZUxheWVyPzogbGFtYmRhLklMYXllclZlcnNpb247XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBBdXRoTGFtYmRhcyBleHRlbmRzIENvbnN0cnVjdCB7XHJcbiAgcHVibGljIHJlYWRvbmx5IHJlZ2lzdGVyTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XHJcbiAgcHVibGljIHJlYWRvbmx5IGxvZ2luTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XHJcbiAgcHVibGljIHJlYWRvbmx5IHZlcmlmeU90cExhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xyXG4gIHB1YmxpYyByZWFkb25seSByZWZyZXNoVG9rZW5MYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcclxuICBwdWJsaWMgcmVhZG9ubHkgYXV0aG9yaXplckxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXV0aExhbWJkYXNQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcclxuXHJcbiAgICAvLyBDb21tb24gZW52aXJvbm1lbnQgdmFyaWFibGVzIGZvciBhbGwgYXV0aCBMYW1iZGFzXHJcbiAgICBjb25zdCBjb21tb25FbnYgPSB7XHJcbiAgICAgIFVTRVJfUE9PTF9JRDogcHJvcHMudXNlclBvb2wudXNlclBvb2xJZCxcclxuICAgICAgVVNFUl9QT09MX0NMSUVOVF9JRDogcHJvcHMudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcclxuICAgICAgVVNFUlNfVEFCTEVfTkFNRTogcHJvcHMudXNlcnNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIEFVRElUX0xPR1NfVEFCTEVfTkFNRTogcHJvcHMuYXVkaXRMb2dzVGFibGUudGFibGVOYW1lLFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBDb21tb24gTGFtYmRhIGNvbmZpZ3VyYXRpb25cclxuICAgIGNvbnN0IGNvbW1vbkNvbmZpZyA9IHtcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXHJcbiAgICAgIGFyY2hpdGVjdHVyZTogbGFtYmRhLkFyY2hpdGVjdHVyZS5BUk1fNjQsXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgICBsYXllcnM6IHByb3BzLm5vZGVMYXllciA/IFtwcm9wcy5ub2RlTGF5ZXJdIDogW10sXHJcbiAgICAgIHRyYWNpbmc6IGxhbWJkYS5UcmFjaW5nLkFDVElWRSxcclxuICAgICAgbG9nUmV0ZW50aW9uOiA3LCAvLyA3IGRheXMgZm9yIGRldmVsb3BtZW50XHJcbiAgICB9O1xyXG5cclxuICAgIC8vIFJlZ2lzdGVyIExhbWJkYVxyXG4gICAgdGhpcy5yZWdpc3RlckxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1JlZ2lzdGVyRnVuY3Rpb24nLCB7XHJcbiAgICAgIC4uLmNvbW1vbkNvbmZpZyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiAnU2F0eWFNb29sLUF1dGgtUmVnaXN0ZXInLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0hhbmRsZSB1c2VyIHJlZ2lzdHJhdGlvbiB3aXRoIGVtYWlsL3Bob25lJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL2Rpc3QnKSksXHJcbiAgICAgIGhhbmRsZXI6ICdhdXRoL3JlZ2lzdGVyLmhhbmRsZXInLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gTG9naW4gTGFtYmRhXHJcbiAgICB0aGlzLmxvZ2luTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnTG9naW5GdW5jdGlvbicsIHtcclxuICAgICAgLi4uY29tbW9uQ29uZmlnLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6ICdTYXR5YU1vb2wtQXV0aC1Mb2dpbicsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnSGFuZGxlIHVzZXIgbG9naW4gYW5kIGlzc3VlIEpXVCB0b2tlbnMnLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvZGlzdCcpKSxcclxuICAgICAgaGFuZGxlcjogJ2F1dGgvbG9naW4uaGFuZGxlcicsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBWZXJpZnkgT1RQIExhbWJkYVxyXG4gICAgdGhpcy52ZXJpZnlPdHBMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdWZXJpZnlPdHBGdW5jdGlvbicsIHtcclxuICAgICAgLi4uY29tbW9uQ29uZmlnLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6ICdTYXR5YU1vb2wtQXV0aC1WZXJpZnlPdHAnLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1ZlcmlmeSBwaG9uZSBPVFAgYW5kIGNvbXBsZXRlIHJlZ2lzdHJhdGlvbicsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9kaXN0JykpLFxyXG4gICAgICBoYW5kbGVyOiAnYXV0aC92ZXJpZnktb3RwLmhhbmRsZXInLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gUmVmcmVzaCBUb2tlbiBMYW1iZGFcclxuICAgIHRoaXMucmVmcmVzaFRva2VuTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUmVmcmVzaFRva2VuRnVuY3Rpb24nLCB7XHJcbiAgICAgIC4uLmNvbW1vbkNvbmZpZyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiAnU2F0eWFNb29sLUF1dGgtUmVmcmVzaFRva2VuJyxcclxuICAgICAgZGVzY3JpcHRpb246ICdSZWZyZXNoIEpXVCBhY2Nlc3MgdG9rZW5zJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL2Rpc3QnKSksXHJcbiAgICAgIGhhbmRsZXI6ICdhdXRoL3JlZnJlc2gtdG9rZW4uaGFuZGxlcicsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBMYW1iZGEgQXV0aG9yaXplclxyXG4gICAgdGhpcy5hdXRob3JpemVyTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQXV0aG9yaXplckZ1bmN0aW9uJywge1xyXG4gICAgICAuLi5jb21tb25Db25maWcsXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ1NhdHlhTW9vbC1BdXRoLUF1dGhvcml6ZXInLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1ZhbGlkYXRlIEpXVCB0b2tlbnMgYW5kIGVuZm9yY2UgUkJBQycsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9kaXN0JykpLFxyXG4gICAgICBoYW5kbGVyOiAnYXV0aG9yaXplci9pbmRleC5oYW5kbGVyJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdyYW50IENvZ25pdG8gcGVybWlzc2lvbnMgdG8gYWxsIGF1dGggTGFtYmRhc1xyXG4gICAgY29uc3QgY29nbml0b1BvbGljeSA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxyXG4gICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluSW5pdGlhdGVBdXRoJyxcclxuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5DcmVhdGVVc2VyJyxcclxuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5TZXRVc2VyUGFzc3dvcmQnLFxyXG4gICAgICAgICdjb2duaXRvLWlkcDpBZG1pblVwZGF0ZVVzZXJBdHRyaWJ1dGVzJyxcclxuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5HZXRVc2VyJyxcclxuICAgICAgICAnY29nbml0by1pZHA6SW5pdGlhdGVBdXRoJyxcclxuICAgICAgICAnY29nbml0by1pZHA6R2V0VXNlcicsXHJcbiAgICAgICAgJ2NvZ25pdG8taWRwOlNpZ25VcCcsXHJcbiAgICAgICAgJ2NvZ25pdG8taWRwOkNvbmZpcm1TaWduVXAnLFxyXG4gICAgICAgICdjb2duaXRvLWlkcDpSZXNlbmRDb25maXJtYXRpb25Db2RlJyxcclxuICAgICAgXSxcclxuICAgICAgcmVzb3VyY2VzOiBbcHJvcHMudXNlclBvb2wudXNlclBvb2xBcm5dLFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5yZWdpc3RlckxhbWJkYS5hZGRUb1JvbGVQb2xpY3koY29nbml0b1BvbGljeSk7XHJcbiAgICB0aGlzLmxvZ2luTGFtYmRhLmFkZFRvUm9sZVBvbGljeShjb2duaXRvUG9saWN5KTtcclxuICAgIHRoaXMudmVyaWZ5T3RwTGFtYmRhLmFkZFRvUm9sZVBvbGljeShjb2duaXRvUG9saWN5KTtcclxuICAgIHRoaXMucmVmcmVzaFRva2VuTGFtYmRhLmFkZFRvUm9sZVBvbGljeShjb2duaXRvUG9saWN5KTtcclxuICAgIHRoaXMuYXV0aG9yaXplckxhbWJkYS5hZGRUb1JvbGVQb2xpY3koY29nbml0b1BvbGljeSk7XHJcblxyXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcGVybWlzc2lvbnNcclxuICAgIHByb3BzLnVzZXJzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMucmVnaXN0ZXJMYW1iZGEpO1xyXG4gICAgcHJvcHMudXNlcnNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5sb2dpbkxhbWJkYSk7XHJcbiAgICBwcm9wcy51c2Vyc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLnZlcmlmeU90cExhbWJkYSk7XHJcbiAgICBwcm9wcy51c2Vyc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLnJlZnJlc2hUb2tlbkxhbWJkYSk7XHJcbiAgICBwcm9wcy51c2Vyc1RhYmxlLmdyYW50UmVhZERhdGEodGhpcy5hdXRob3JpemVyTGFtYmRhKTtcclxuXHJcbiAgICBwcm9wcy5hdWRpdExvZ3NUYWJsZS5ncmFudFdyaXRlRGF0YSh0aGlzLnJlZ2lzdGVyTGFtYmRhKTtcclxuICAgIHByb3BzLmF1ZGl0TG9nc1RhYmxlLmdyYW50V3JpdGVEYXRhKHRoaXMubG9naW5MYW1iZGEpO1xyXG4gICAgcHJvcHMuYXVkaXRMb2dzVGFibGUuZ3JhbnRXcml0ZURhdGEodGhpcy52ZXJpZnlPdHBMYW1iZGEpO1xyXG4gICAgcHJvcHMuYXVkaXRMb2dzVGFibGUuZ3JhbnRXcml0ZURhdGEodGhpcy5yZWZyZXNoVG9rZW5MYW1iZGEpO1xyXG5cclxuICAgIC8vIE91dHB1dHNcclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdSZWdpc3RlckxhbWJkYUFybicsIHtcclxuICAgICAgdmFsdWU6IHRoaXMucmVnaXN0ZXJMYW1iZGEuZnVuY3Rpb25Bcm4sXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnUmVnaXN0ZXIgTGFtYmRhIEZ1bmN0aW9uIEFSTicsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtUmVnaXN0ZXJMYW1iZGFBcm4nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0xvZ2luTGFtYmRhQXJuJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5sb2dpbkxhbWJkYS5mdW5jdGlvbkFybixcclxuICAgICAgZGVzY3JpcHRpb246ICdMb2dpbiBMYW1iZGEgRnVuY3Rpb24gQVJOJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1NhdHlhTW9vbC1Mb2dpbkxhbWJkYUFybicsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVmVyaWZ5T3RwTGFtYmRhQXJuJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy52ZXJpZnlPdHBMYW1iZGEuZnVuY3Rpb25Bcm4sXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnVmVyaWZ5IE9UUCBMYW1iZGEgRnVuY3Rpb24gQVJOJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1NhdHlhTW9vbC1WZXJpZnlPdHBMYW1iZGFBcm4nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1JlZnJlc2hUb2tlbkxhbWJkYUFybicsIHtcclxuICAgICAgdmFsdWU6IHRoaXMucmVmcmVzaFRva2VuTGFtYmRhLmZ1bmN0aW9uQXJuLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1JlZnJlc2ggVG9rZW4gTGFtYmRhIEZ1bmN0aW9uIEFSTicsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtUmVmcmVzaFRva2VuTGFtYmRhQXJuJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBdXRob3JpemVyTGFtYmRhQXJuJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5hdXRob3JpemVyTGFtYmRhLmZ1bmN0aW9uQXJuLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0F1dGhvcml6ZXIgTGFtYmRhIEZ1bmN0aW9uIEFSTicsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtQXV0aG9yaXplckxhbWJkYUFybicsXHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuIl19