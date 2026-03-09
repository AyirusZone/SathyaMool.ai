import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export class CognitoConfig extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string) {
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
