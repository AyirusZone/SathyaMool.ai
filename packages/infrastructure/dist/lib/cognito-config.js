"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CognitoConfig = void 0;
const cdk = require("aws-cdk-lib");
const cognito = require("aws-cdk-lib/aws-cognito");
const constructs_1 = require("constructs");
class CognitoConfig extends constructs_1.Construct {
    constructor(scope, id) {
        super(scope, id);
        // Create Cognito User Pool for authentication
        this.userPool = new cognito.UserPool(this, 'SatyaMoolUserPool', {
            userPoolName: 'SatyaMool-Users',
            // Sign-in configuration
            signInAliases: {
                email: true,
                phone: true,
                username: false,
            },
            // Auto-verify email and phone
            autoVerify: {
                email: true,
                phone: true,
            },
            // Self sign-up enabled
            selfSignUpEnabled: true,
            // User attributes
            standardAttributes: {
                email: {
                    required: true,
                    mutable: true,
                },
                phoneNumber: {
                    required: false,
                    mutable: true,
                },
            },
            // Custom attributes for role
            customAttributes: {
                role: new cognito.StringAttribute({
                    minLen: 1,
                    maxLen: 50,
                    mutable: true,
                }),
            },
            // Password policy
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: false,
                tempPasswordValidity: cdk.Duration.days(7),
            },
            // Account recovery
            accountRecovery: cognito.AccountRecovery.EMAIL_AND_PHONE_WITHOUT_MFA,
            // MFA configuration (optional for now)
            mfa: cognito.Mfa.OPTIONAL,
            mfaSecondFactor: {
                sms: true,
                otp: true,
            },
            // Email configuration
            email: cognito.UserPoolEmail.withCognito('noreply@verificationemail.com'),
            // SMS configuration
            smsRole: undefined, // Will use default Cognito SMS role
            // User invitation
            userInvitation: {
                emailSubject: 'Welcome to SatyaMool!',
                emailBody: 'Hello {username}, your temporary password is {####}',
                smsMessage: 'Your SatyaMool username is {username} and temporary password is {####}',
            },
            // User verification
            userVerification: {
                emailSubject: 'Verify your email for SatyaMool',
                emailBody: 'Thanks for signing up! Your verification code is {####}',
                emailStyle: cognito.VerificationEmailStyle.CODE,
                smsMessage: 'Your SatyaMool verification code is {####}',
            },
            // Advanced security
            advancedSecurityMode: cognito.AdvancedSecurityMode.ENFORCED,
            // Device tracking - DISABLED to prevent refresh token issues
            // Device tracking causes "Invalid Refresh Token" errors because it requires
            // device confirmation flow which our frontend doesn't implement
            deviceTracking: {
                challengeRequiredOnNewDevice: false,
                deviceOnlyRememberedOnUserPrompt: false,
            },
            // Deletion protection
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            deletionProtection: false, // Set to true in production
        });
        // Create User Pool Client for web application
        this.userPoolClient = this.userPool.addClient('SatyaMoolWebClient', {
            userPoolClientName: 'SatyaMool-Web',
            // Auth flows (refresh token auth is automatically enabled)
            authFlows: {
                userPassword: true,
                userSrp: true,
                custom: false,
                adminUserPassword: false,
            },
            // Token validity
            accessTokenValidity: cdk.Duration.hours(1),
            idTokenValidity: cdk.Duration.hours(1),
            refreshTokenValidity: cdk.Duration.days(30),
            // Prevent user existence errors
            preventUserExistenceErrors: true,
            // Enable token revocation
            enableTokenRevocation: true,
            // Read and write attributes
            readAttributes: new cognito.ClientAttributes()
                .withStandardAttributes({
                email: true,
                phoneNumber: true,
                emailVerified: true,
                phoneNumberVerified: true,
            })
                .withCustomAttributes('role'),
            writeAttributes: new cognito.ClientAttributes()
                .withStandardAttributes({
                email: true,
                phoneNumber: true,
            })
                .withCustomAttributes('role'),
        });
        // Add outputs
        new cdk.CfnOutput(this, 'UserPoolId', {
            value: this.userPool.userPoolId,
            description: 'Cognito User Pool ID',
            exportName: 'SatyaMool-UserPoolId',
        });
        new cdk.CfnOutput(this, 'UserPoolArn', {
            value: this.userPool.userPoolArn,
            description: 'Cognito User Pool ARN',
            exportName: 'SatyaMool-UserPoolArn',
        });
        new cdk.CfnOutput(this, 'UserPoolClientId', {
            value: this.userPoolClient.userPoolClientId,
            description: 'Cognito User Pool Client ID',
            exportName: 'SatyaMool-UserPoolClientId',
        });
    }
}
exports.CognitoConfig = CognitoConfig;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29nbml0by1jb25maWcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvY29nbml0by1jb25maWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLG1EQUFtRDtBQUNuRCwyQ0FBdUM7QUFFdkMsTUFBYSxhQUFjLFNBQVEsc0JBQVM7SUFJMUMsWUFBWSxLQUFnQixFQUFFLEVBQVU7UUFDdEMsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQiw4Q0FBOEM7UUFDOUMsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQzlELFlBQVksRUFBRSxpQkFBaUI7WUFFL0Isd0JBQXdCO1lBQ3hCLGFBQWEsRUFBRTtnQkFDYixLQUFLLEVBQUUsSUFBSTtnQkFDWCxLQUFLLEVBQUUsSUFBSTtnQkFDWCxRQUFRLEVBQUUsS0FBSzthQUNoQjtZQUVELDhCQUE4QjtZQUM5QixVQUFVLEVBQUU7Z0JBQ1YsS0FBSyxFQUFFLElBQUk7Z0JBQ1gsS0FBSyxFQUFFLElBQUk7YUFDWjtZQUVELHVCQUF1QjtZQUN2QixpQkFBaUIsRUFBRSxJQUFJO1lBRXZCLGtCQUFrQjtZQUNsQixrQkFBa0IsRUFBRTtnQkFDbEIsS0FBSyxFQUFFO29CQUNMLFFBQVEsRUFBRSxJQUFJO29CQUNkLE9BQU8sRUFBRSxJQUFJO2lCQUNkO2dCQUNELFdBQVcsRUFBRTtvQkFDWCxRQUFRLEVBQUUsS0FBSztvQkFDZixPQUFPLEVBQUUsSUFBSTtpQkFDZDthQUNGO1lBRUQsNkJBQTZCO1lBQzdCLGdCQUFnQixFQUFFO2dCQUNoQixJQUFJLEVBQUUsSUFBSSxPQUFPLENBQUMsZUFBZSxDQUFDO29CQUNoQyxNQUFNLEVBQUUsQ0FBQztvQkFDVCxNQUFNLEVBQUUsRUFBRTtvQkFDVixPQUFPLEVBQUUsSUFBSTtpQkFDZCxDQUFDO2FBQ0g7WUFFRCxrQkFBa0I7WUFDbEIsY0FBYyxFQUFFO2dCQUNkLFNBQVMsRUFBRSxDQUFDO2dCQUNaLGdCQUFnQixFQUFFLElBQUk7Z0JBQ3RCLGdCQUFnQixFQUFFLElBQUk7Z0JBQ3RCLGFBQWEsRUFBRSxJQUFJO2dCQUNuQixjQUFjLEVBQUUsS0FBSztnQkFDckIsb0JBQW9CLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2FBQzNDO1lBRUQsbUJBQW1CO1lBQ25CLGVBQWUsRUFBRSxPQUFPLENBQUMsZUFBZSxDQUFDLDJCQUEyQjtZQUVwRSx1Q0FBdUM7WUFDdkMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUTtZQUN6QixlQUFlLEVBQUU7Z0JBQ2YsR0FBRyxFQUFFLElBQUk7Z0JBQ1QsR0FBRyxFQUFFLElBQUk7YUFDVjtZQUVELHNCQUFzQjtZQUN0QixLQUFLLEVBQUUsT0FBTyxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsK0JBQStCLENBQUM7WUFFekUsb0JBQW9CO1lBQ3BCLE9BQU8sRUFBRSxTQUFTLEVBQUUsb0NBQW9DO1lBRXhELGtCQUFrQjtZQUNsQixjQUFjLEVBQUU7Z0JBQ2QsWUFBWSxFQUFFLHVCQUF1QjtnQkFDckMsU0FBUyxFQUFFLHFEQUFxRDtnQkFDaEUsVUFBVSxFQUFFLHdFQUF3RTthQUNyRjtZQUVELG9CQUFvQjtZQUNwQixnQkFBZ0IsRUFBRTtnQkFDaEIsWUFBWSxFQUFFLGlDQUFpQztnQkFDL0MsU0FBUyxFQUFFLHlEQUF5RDtnQkFDcEUsVUFBVSxFQUFFLE9BQU8sQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJO2dCQUMvQyxVQUFVLEVBQUUsNENBQTRDO2FBQ3pEO1lBRUQsb0JBQW9CO1lBQ3BCLG9CQUFvQixFQUFFLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRO1lBRTNELDZEQUE2RDtZQUM3RCw0RUFBNEU7WUFDNUUsZ0VBQWdFO1lBQ2hFLGNBQWMsRUFBRTtnQkFDZCw0QkFBNEIsRUFBRSxLQUFLO2dCQUNuQyxnQ0FBZ0MsRUFBRSxLQUFLO2FBQ3hDO1lBRUQsc0JBQXNCO1lBQ3RCLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU07WUFDdkMsa0JBQWtCLEVBQUUsS0FBSyxFQUFFLDRCQUE0QjtTQUN4RCxDQUFDLENBQUM7UUFFSCw4Q0FBOEM7UUFDOUMsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsRUFBRTtZQUNsRSxrQkFBa0IsRUFBRSxlQUFlO1lBRW5DLDJEQUEyRDtZQUMzRCxTQUFTLEVBQUU7Z0JBQ1QsWUFBWSxFQUFFLElBQUk7Z0JBQ2xCLE9BQU8sRUFBRSxJQUFJO2dCQUNiLE1BQU0sRUFBRSxLQUFLO2dCQUNiLGlCQUFpQixFQUFFLEtBQUs7YUFDekI7WUFFRCxpQkFBaUI7WUFDakIsbUJBQW1CLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQzFDLGVBQWUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDdEMsb0JBQW9CLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBRTNDLGdDQUFnQztZQUNoQywwQkFBMEIsRUFBRSxJQUFJO1lBRWhDLDBCQUEwQjtZQUMxQixxQkFBcUIsRUFBRSxJQUFJO1lBRTNCLDRCQUE0QjtZQUM1QixjQUFjLEVBQUUsSUFBSSxPQUFPLENBQUMsZ0JBQWdCLEVBQUU7aUJBQzNDLHNCQUFzQixDQUFDO2dCQUN0QixLQUFLLEVBQUUsSUFBSTtnQkFDWCxXQUFXLEVBQUUsSUFBSTtnQkFDakIsYUFBYSxFQUFFLElBQUk7Z0JBQ25CLG1CQUFtQixFQUFFLElBQUk7YUFDMUIsQ0FBQztpQkFDRCxvQkFBb0IsQ0FBQyxNQUFNLENBQUM7WUFFL0IsZUFBZSxFQUFFLElBQUksT0FBTyxDQUFDLGdCQUFnQixFQUFFO2lCQUM1QyxzQkFBc0IsQ0FBQztnQkFDdEIsS0FBSyxFQUFFLElBQUk7Z0JBQ1gsV0FBVyxFQUFFLElBQUk7YUFDbEIsQ0FBQztpQkFDRCxvQkFBb0IsQ0FBQyxNQUFNLENBQUM7U0FDaEMsQ0FBQyxDQUFDO1FBRUgsY0FBYztRQUNkLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ3BDLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVU7WUFDL0IsV0FBVyxFQUFFLHNCQUFzQjtZQUNuQyxVQUFVLEVBQUUsc0JBQXNCO1NBQ25DLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3JDLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVc7WUFDaEMsV0FBVyxFQUFFLHVCQUF1QjtZQUNwQyxVQUFVLEVBQUUsdUJBQXVCO1NBQ3BDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsZ0JBQWdCO1lBQzNDLFdBQVcsRUFBRSw2QkFBNkI7WUFDMUMsVUFBVSxFQUFFLDRCQUE0QjtTQUN6QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFyS0Qsc0NBcUtDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5cclxuZXhwb3J0IGNsYXNzIENvZ25pdG9Db25maWcgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xyXG4gIHB1YmxpYyByZWFkb25seSB1c2VyUG9vbDogY29nbml0by5Vc2VyUG9vbDtcclxuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2xDbGllbnQ6IGNvZ25pdG8uVXNlclBvb2xDbGllbnQ7XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIENvZ25pdG8gVXNlciBQb29sIGZvciBhdXRoZW50aWNhdGlvblxyXG4gICAgdGhpcy51c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdTYXR5YU1vb2xVc2VyUG9vbCcsIHtcclxuICAgICAgdXNlclBvb2xOYW1lOiAnU2F0eWFNb29sLVVzZXJzJyxcclxuICAgICAgXHJcbiAgICAgIC8vIFNpZ24taW4gY29uZmlndXJhdGlvblxyXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XHJcbiAgICAgICAgZW1haWw6IHRydWUsXHJcbiAgICAgICAgcGhvbmU6IHRydWUsXHJcbiAgICAgICAgdXNlcm5hbWU6IGZhbHNlLFxyXG4gICAgICB9LFxyXG4gICAgICBcclxuICAgICAgLy8gQXV0by12ZXJpZnkgZW1haWwgYW5kIHBob25lXHJcbiAgICAgIGF1dG9WZXJpZnk6IHtcclxuICAgICAgICBlbWFpbDogdHJ1ZSxcclxuICAgICAgICBwaG9uZTogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgXHJcbiAgICAgIC8vIFNlbGYgc2lnbi11cCBlbmFibGVkXHJcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxyXG4gICAgICBcclxuICAgICAgLy8gVXNlciBhdHRyaWJ1dGVzXHJcbiAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xyXG4gICAgICAgIGVtYWlsOiB7XHJcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcclxuICAgICAgICAgIG11dGFibGU6IHRydWUsXHJcbiAgICAgICAgfSxcclxuICAgICAgICBwaG9uZU51bWJlcjoge1xyXG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxyXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgICBcclxuICAgICAgLy8gQ3VzdG9tIGF0dHJpYnV0ZXMgZm9yIHJvbGVcclxuICAgICAgY3VzdG9tQXR0cmlidXRlczoge1xyXG4gICAgICAgIHJvbGU6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7XHJcbiAgICAgICAgICBtaW5MZW46IDEsXHJcbiAgICAgICAgICBtYXhMZW46IDUwLFxyXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcclxuICAgICAgICB9KSxcclxuICAgICAgfSxcclxuICAgICAgXHJcbiAgICAgIC8vIFBhc3N3b3JkIHBvbGljeVxyXG4gICAgICBwYXNzd29yZFBvbGljeToge1xyXG4gICAgICAgIG1pbkxlbmd0aDogOCxcclxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxyXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXHJcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcclxuICAgICAgICByZXF1aXJlU3ltYm9sczogZmFsc2UsXHJcbiAgICAgICAgdGVtcFBhc3N3b3JkVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxyXG4gICAgICB9LFxyXG4gICAgICBcclxuICAgICAgLy8gQWNjb3VudCByZWNvdmVyeVxyXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX0FORF9QSE9ORV9XSVRIT1VUX01GQSxcclxuICAgICAgXHJcbiAgICAgIC8vIE1GQSBjb25maWd1cmF0aW9uIChvcHRpb25hbCBmb3Igbm93KVxyXG4gICAgICBtZmE6IGNvZ25pdG8uTWZhLk9QVElPTkFMLFxyXG4gICAgICBtZmFTZWNvbmRGYWN0b3I6IHtcclxuICAgICAgICBzbXM6IHRydWUsXHJcbiAgICAgICAgb3RwOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICBcclxuICAgICAgLy8gRW1haWwgY29uZmlndXJhdGlvblxyXG4gICAgICBlbWFpbDogY29nbml0by5Vc2VyUG9vbEVtYWlsLndpdGhDb2duaXRvKCdub3JlcGx5QHZlcmlmaWNhdGlvbmVtYWlsLmNvbScpLFxyXG4gICAgICBcclxuICAgICAgLy8gU01TIGNvbmZpZ3VyYXRpb25cclxuICAgICAgc21zUm9sZTogdW5kZWZpbmVkLCAvLyBXaWxsIHVzZSBkZWZhdWx0IENvZ25pdG8gU01TIHJvbGVcclxuICAgICAgXHJcbiAgICAgIC8vIFVzZXIgaW52aXRhdGlvblxyXG4gICAgICB1c2VySW52aXRhdGlvbjoge1xyXG4gICAgICAgIGVtYWlsU3ViamVjdDogJ1dlbGNvbWUgdG8gU2F0eWFNb29sIScsXHJcbiAgICAgICAgZW1haWxCb2R5OiAnSGVsbG8ge3VzZXJuYW1lfSwgeW91ciB0ZW1wb3JhcnkgcGFzc3dvcmQgaXMgeyMjIyN9JyxcclxuICAgICAgICBzbXNNZXNzYWdlOiAnWW91ciBTYXR5YU1vb2wgdXNlcm5hbWUgaXMge3VzZXJuYW1lfSBhbmQgdGVtcG9yYXJ5IHBhc3N3b3JkIGlzIHsjIyMjfScsXHJcbiAgICAgIH0sXHJcbiAgICAgIFxyXG4gICAgICAvLyBVc2VyIHZlcmlmaWNhdGlvblxyXG4gICAgICB1c2VyVmVyaWZpY2F0aW9uOiB7XHJcbiAgICAgICAgZW1haWxTdWJqZWN0OiAnVmVyaWZ5IHlvdXIgZW1haWwgZm9yIFNhdHlhTW9vbCcsXHJcbiAgICAgICAgZW1haWxCb2R5OiAnVGhhbmtzIGZvciBzaWduaW5nIHVwISBZb3VyIHZlcmlmaWNhdGlvbiBjb2RlIGlzIHsjIyMjfScsXHJcbiAgICAgICAgZW1haWxTdHlsZTogY29nbml0by5WZXJpZmljYXRpb25FbWFpbFN0eWxlLkNPREUsXHJcbiAgICAgICAgc21zTWVzc2FnZTogJ1lvdXIgU2F0eWFNb29sIHZlcmlmaWNhdGlvbiBjb2RlIGlzIHsjIyMjfScsXHJcbiAgICAgIH0sXHJcbiAgICAgIFxyXG4gICAgICAvLyBBZHZhbmNlZCBzZWN1cml0eVxyXG4gICAgICBhZHZhbmNlZFNlY3VyaXR5TW9kZTogY29nbml0by5BZHZhbmNlZFNlY3VyaXR5TW9kZS5FTkZPUkNFRCxcclxuICAgICAgXHJcbiAgICAgIC8vIERldmljZSB0cmFja2luZyAtIERJU0FCTEVEIHRvIHByZXZlbnQgcmVmcmVzaCB0b2tlbiBpc3N1ZXNcclxuICAgICAgLy8gRGV2aWNlIHRyYWNraW5nIGNhdXNlcyBcIkludmFsaWQgUmVmcmVzaCBUb2tlblwiIGVycm9ycyBiZWNhdXNlIGl0IHJlcXVpcmVzXHJcbiAgICAgIC8vIGRldmljZSBjb25maXJtYXRpb24gZmxvdyB3aGljaCBvdXIgZnJvbnRlbmQgZG9lc24ndCBpbXBsZW1lbnRcclxuICAgICAgZGV2aWNlVHJhY2tpbmc6IHtcclxuICAgICAgICBjaGFsbGVuZ2VSZXF1aXJlZE9uTmV3RGV2aWNlOiBmYWxzZSxcclxuICAgICAgICBkZXZpY2VPbmx5UmVtZW1iZXJlZE9uVXNlclByb21wdDogZmFsc2UsXHJcbiAgICAgIH0sXHJcbiAgICAgIFxyXG4gICAgICAvLyBEZWxldGlvbiBwcm90ZWN0aW9uXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcclxuICAgICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBmYWxzZSwgLy8gU2V0IHRvIHRydWUgaW4gcHJvZHVjdGlvblxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIFVzZXIgUG9vbCBDbGllbnQgZm9yIHdlYiBhcHBsaWNhdGlvblxyXG4gICAgdGhpcy51c2VyUG9vbENsaWVudCA9IHRoaXMudXNlclBvb2wuYWRkQ2xpZW50KCdTYXR5YU1vb2xXZWJDbGllbnQnLCB7XHJcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogJ1NhdHlhTW9vbC1XZWInLFxyXG4gICAgICBcclxuICAgICAgLy8gQXV0aCBmbG93cyAocmVmcmVzaCB0b2tlbiBhdXRoIGlzIGF1dG9tYXRpY2FsbHkgZW5hYmxlZClcclxuICAgICAgYXV0aEZsb3dzOiB7XHJcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLFxyXG4gICAgICAgIHVzZXJTcnA6IHRydWUsXHJcbiAgICAgICAgY3VzdG9tOiBmYWxzZSxcclxuICAgICAgICBhZG1pblVzZXJQYXNzd29yZDogZmFsc2UsXHJcbiAgICAgIH0sXHJcbiAgICAgIFxyXG4gICAgICAvLyBUb2tlbiB2YWxpZGl0eVxyXG4gICAgICBhY2Nlc3NUb2tlblZhbGlkaXR5OiBjZGsuRHVyYXRpb24uaG91cnMoMSksXHJcbiAgICAgIGlkVG9rZW5WYWxpZGl0eTogY2RrLkR1cmF0aW9uLmhvdXJzKDEpLFxyXG4gICAgICByZWZyZXNoVG9rZW5WYWxpZGl0eTogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxyXG4gICAgICBcclxuICAgICAgLy8gUHJldmVudCB1c2VyIGV4aXN0ZW5jZSBlcnJvcnNcclxuICAgICAgcHJldmVudFVzZXJFeGlzdGVuY2VFcnJvcnM6IHRydWUsXHJcbiAgICAgIFxyXG4gICAgICAvLyBFbmFibGUgdG9rZW4gcmV2b2NhdGlvblxyXG4gICAgICBlbmFibGVUb2tlblJldm9jYXRpb246IHRydWUsXHJcbiAgICAgIFxyXG4gICAgICAvLyBSZWFkIGFuZCB3cml0ZSBhdHRyaWJ1dGVzXHJcbiAgICAgIHJlYWRBdHRyaWJ1dGVzOiBuZXcgY29nbml0by5DbGllbnRBdHRyaWJ1dGVzKClcclxuICAgICAgICAud2l0aFN0YW5kYXJkQXR0cmlidXRlcyh7XHJcbiAgICAgICAgICBlbWFpbDogdHJ1ZSxcclxuICAgICAgICAgIHBob25lTnVtYmVyOiB0cnVlLFxyXG4gICAgICAgICAgZW1haWxWZXJpZmllZDogdHJ1ZSxcclxuICAgICAgICAgIHBob25lTnVtYmVyVmVyaWZpZWQ6IHRydWUsXHJcbiAgICAgICAgfSlcclxuICAgICAgICAud2l0aEN1c3RvbUF0dHJpYnV0ZXMoJ3JvbGUnKSxcclxuICAgICAgXHJcbiAgICAgIHdyaXRlQXR0cmlidXRlczogbmV3IGNvZ25pdG8uQ2xpZW50QXR0cmlidXRlcygpXHJcbiAgICAgICAgLndpdGhTdGFuZGFyZEF0dHJpYnV0ZXMoe1xyXG4gICAgICAgICAgZW1haWw6IHRydWUsXHJcbiAgICAgICAgICBwaG9uZU51bWJlcjogdHJ1ZSxcclxuICAgICAgICB9KVxyXG4gICAgICAgIC53aXRoQ3VzdG9tQXR0cmlidXRlcygncm9sZScpLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkIG91dHB1dHNcclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbElkJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIElEJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1NhdHlhTW9vbC1Vc2VyUG9vbElkJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbEFybicsIHtcclxuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xBcm4sXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQVJOJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1NhdHlhTW9vbC1Vc2VyUG9vbEFybicsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xDbGllbnRJZCcsIHtcclxuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcclxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQnLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLVVzZXJQb29sQ2xpZW50SWQnLFxyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcbiJdfQ==