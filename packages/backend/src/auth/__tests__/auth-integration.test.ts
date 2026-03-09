import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { handler as registerHandler } from '../register';
import { handler as verifyOtpHandler } from '../verify-otp';
import { handler as loginHandler } from '../login';
import { handler as refreshTokenHandler } from '../refresh-token';

const cognitoMock = mockClient(CognitoIdentityProviderClient);
const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('Authentication Flow Integration Tests', () => {
  beforeEach(() => {
    cognitoMock.reset();
    dynamoMock.reset();
    
    // Set environment variables
    process.env.USER_POOL_ID = 'test-pool-id';
    process.env.USER_POOL_CLIENT_ID = 'test-client-id';
    process.env.USERS_TABLE_NAME = 'SatyaMool-Users';
    process.env.AUDIT_LOGS_TABLE_NAME = 'SatyaMool-AuditLogs';
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockEvent = (path: string, body: any): APIGatewayProxyEvent => {
    return {
      body: JSON.stringify(body),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path,
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        accountId: '123456789012',
        apiId: 'test-api-id',
        authorizer: null,
        protocol: 'HTTP/1.1',
        httpMethod: 'POST',
        identity: {
          accessKey: null,
          accountId: null,
          apiKey: null,
          apiKeyId: null,
          caller: null,
          clientCert: null,
          cognitoAuthenticationProvider: null,
          cognitoAuthenticationType: null,
          cognitoIdentityId: null,
          cognitoIdentityPoolId: null,
          principalOrgId: null,
          sourceIp: '192.168.1.1',
          user: null,
          userAgent: 'test-agent',
          userArn: null,
        },
        path,
        stage: 'test',
        requestId: 'test-request-id',
        requestTime: '01/Jan/2024:00:00:00 +0000',
        requestTimeEpoch: 1704067200000,
        resourceId: 'test-resource-id',
        resourcePath: path,
      },
      resource: path,
    } as APIGatewayProxyEvent;
  };

  describe('Complete Registration and Login Flow - Email', () => {
    it('should complete full flow: register → verify OTP → login', async () => {
      const testEmail = 'integration-test@example.com';
      const testPassword = 'TestPassword123!';
      const testUserId = 'test-user-id-123';
      const testCognitoSub = 'cognito-sub-123';

      // Step 1: Register user with email
      cognitoMock.on(SignUpCommand).resolves({
        UserSub: testCognitoSub,
        UserConfirmed: false,
        CodeDeliveryDetails: {
          Destination: 't***@e***.com',
          DeliveryMedium: 'EMAIL',
          AttributeName: 'email',
        },
      });

      dynamoMock.on(PutCommand).resolves({});

      const registerEvent = createMockEvent('/v1/auth/register', {
        email: testEmail,
        password: testPassword,
        givenName: 'Integration',
        familyName: 'Test',
      });

      const registerResult = await registerHandler(registerEvent);
      expect(registerResult.statusCode).toBe(201);
      
      const registerBody = JSON.parse(registerResult.body);
      expect(registerBody.userId).toBeDefined();
      expect(registerBody.userConfirmed).toBe(false);
      expect(registerBody.codeDeliveryDetails.deliveryMedium).toBe('EMAIL');

      // Step 2: Verify OTP
      cognitoMock.on(ConfirmSignUpCommand).resolves({});
      
      dynamoMock.on(QueryCommand).resolves({
        Items: [
          {
            userId: testUserId,
            email: testEmail,
            status: 'pending_verification',
            cognitoUsername: testCognitoSub,
          },
        ],
      });

      dynamoMock.on(UpdateCommand).resolves({});

      const verifyEvent = createMockEvent('/v1/auth/verify-otp', {
        username: testEmail,
        code: '123456',
      });

      const verifyResult = await verifyOtpHandler(verifyEvent);
      expect(verifyResult.statusCode).toBe(200);
      
      const verifyBody = JSON.parse(verifyResult.body);
      expect(verifyBody.message).toContain('verified successfully');
      expect(verifyBody.status).toBe('active');

      // Step 3: Login with verified credentials
      cognitoMock.on(InitiateAuthCommand).resolves({
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          IdToken: 'mock-id-token',
          RefreshToken: 'mock-refresh-token',
          ExpiresIn: 3600,
        },
      });

      cognitoMock.on(GetUserCommand).resolves({
        UserAttributes: [
          { Name: 'sub', Value: testUserId },
          { Name: 'custom:role', Value: 'Standard_User' },
          { Name: 'email', Value: testEmail },
        ],
      });

      const loginEvent = createMockEvent('/v1/auth/login', {
        username: testEmail,
        password: testPassword,
      });

      const loginResult = await loginHandler(loginEvent);
      expect(loginResult.statusCode).toBe(200);
      
      const loginBody = JSON.parse(loginResult.body);
      expect(loginBody.accessToken).toBe('mock-access-token');
      expect(loginBody.idToken).toBe('mock-id-token');
      expect(loginBody.refreshToken).toBe('mock-refresh-token');
      expect(loginBody.role).toBe('Standard_User');
      expect(loginBody.tokenType).toBe('Bearer');
    });

    it('should fail login before OTP verification', async () => {
      const testEmail = 'unverified@example.com';
      const testPassword = 'TestPassword123!';

      // Step 1: Register user
      cognitoMock.on(SignUpCommand).resolves({
        UserSub: 'cognito-sub-456',
        UserConfirmed: false,
      });

      dynamoMock.on(PutCommand).resolves({});

      const registerEvent = createMockEvent('/v1/auth/register', {
        email: testEmail,
        password: testPassword,
      });

      const registerResult = await registerHandler(registerEvent);
      expect(registerResult.statusCode).toBe(201);

      // Step 2: Try to login without verification
      cognitoMock.on(InitiateAuthCommand).rejects({
        name: 'UserNotConfirmedException',
        message: 'User is not confirmed',
      });

      const loginEvent = createMockEvent('/v1/auth/login', {
        username: testEmail,
        password: testPassword,
      });

      const loginResult = await loginHandler(loginEvent);
      expect(loginResult.statusCode).toBe(403);
      
      const loginBody = JSON.parse(loginResult.body);
      expect(loginBody.error).toBe('USER_NOT_CONFIRMED');
    });
  });

  describe('Complete Registration and Login Flow - Phone Number', () => {
    it('should complete full flow: register → verify OTP → login with phone', async () => {
      const testPhone = '+919876543210';
      const testPassword = 'TestPassword123!';
      const testUserId = 'test-user-id-789';
      const testCognitoSub = 'cognito-sub-789';

      // Step 1: Register user with phone number
      cognitoMock.on(SignUpCommand).resolves({
        UserSub: testCognitoSub,
        UserConfirmed: false,
        CodeDeliveryDetails: {
          Destination: '+*******3210',
          DeliveryMedium: 'SMS',
          AttributeName: 'phone_number',
        },
      });

      dynamoMock.on(PutCommand).resolves({});

      const registerEvent = createMockEvent('/v1/auth/register', {
        phoneNumber: testPhone,
        password: testPassword,
      });

      const registerResult = await registerHandler(registerEvent);
      expect(registerResult.statusCode).toBe(201);
      
      const registerBody = JSON.parse(registerResult.body);
      expect(registerBody.userId).toBeDefined();
      expect(registerBody.userConfirmed).toBe(false);
      expect(registerBody.codeDeliveryDetails.deliveryMedium).toBe('SMS');

      // Step 2: Verify OTP
      cognitoMock.on(ConfirmSignUpCommand).resolves({});
      
      dynamoMock.on(QueryCommand).resolves({
        Items: [
          {
            userId: testUserId,
            phoneNumber: testPhone,
            status: 'pending_verification',
            cognitoUsername: testCognitoSub,
          },
        ],
      });

      dynamoMock.on(UpdateCommand).resolves({});

      const verifyEvent = createMockEvent('/v1/auth/verify-otp', {
        username: testPhone,
        code: '654321',
      });

      const verifyResult = await verifyOtpHandler(verifyEvent);
      expect(verifyResult.statusCode).toBe(200);
      
      const verifyBody = JSON.parse(verifyResult.body);
      expect(verifyBody.message).toContain('verified successfully');

      // Step 3: Login with phone number
      cognitoMock.on(InitiateAuthCommand).resolves({
        AuthenticationResult: {
          AccessToken: 'mock-access-token-phone',
          IdToken: 'mock-id-token-phone',
          RefreshToken: 'mock-refresh-token-phone',
          ExpiresIn: 3600,
        },
      });

      cognitoMock.on(GetUserCommand).resolves({
        UserAttributes: [
          { Name: 'sub', Value: testUserId },
          { Name: 'custom:role', Value: 'Standard_User' },
          { Name: 'phone_number', Value: testPhone },
        ],
      });

      const loginEvent = createMockEvent('/v1/auth/login', {
        username: testPhone,
        password: testPassword,
      });

      const loginResult = await loginHandler(loginEvent);
      expect(loginResult.statusCode).toBe(200);
      
      const loginBody = JSON.parse(loginResult.body);
      expect(loginBody.accessToken).toBe('mock-access-token-phone');
      expect(loginBody.refreshToken).toBe('mock-refresh-token-phone');
    });
  });

  describe('OTP Verification Workflow', () => {
    it('should handle invalid OTP code during verification', async () => {
      const testEmail = 'test-otp@example.com';
      const testPassword = 'TestPassword123!';

      // Step 1: Register user
      cognitoMock.on(SignUpCommand).resolves({
        UserSub: 'cognito-sub-otp',
        UserConfirmed: false,
      });

      dynamoMock.on(PutCommand).resolves({});

      const registerEvent = createMockEvent('/v1/auth/register', {
        email: testEmail,
        password: testPassword,
      });

      const registerResult = await registerHandler(registerEvent);
      expect(registerResult.statusCode).toBe(201);

      // Step 2: Try to verify with wrong OTP
      cognitoMock.on(ConfirmSignUpCommand).rejects({
        name: 'CodeMismatchException',
        message: 'Invalid verification code',
      });

      const verifyEvent = createMockEvent('/v1/auth/verify-otp', {
        username: testEmail,
        code: 'wrong-code',
      });

      const verifyResult = await verifyOtpHandler(verifyEvent);
      expect(verifyResult.statusCode).toBe(400);
      
      const verifyBody = JSON.parse(verifyResult.body);
      expect(verifyBody.error).toBe('INVALID_CODE');
    });

    it('should handle expired OTP code', async () => {
      const testEmail = 'test-expired@example.com';

      // Try to verify with expired OTP
      cognitoMock.on(ConfirmSignUpCommand).rejects({
        name: 'ExpiredCodeException',
        message: 'Verification code has expired',
      });

      const verifyEvent = createMockEvent('/v1/auth/verify-otp', {
        username: testEmail,
        code: '123456',
      });

      const verifyResult = await verifyOtpHandler(verifyEvent);
      expect(verifyResult.statusCode).toBe(400);
      
      const verifyBody = JSON.parse(verifyResult.body);
      expect(verifyBody.error).toBe('EXPIRED_CODE');
    });

    it('should handle too many failed OTP attempts', async () => {
      const testEmail = 'test-attempts@example.com';

      // Simulate too many failed attempts
      cognitoMock.on(ConfirmSignUpCommand).rejects({
        name: 'TooManyFailedAttemptsException',
        message: 'Too many failed attempts',
      });

      const verifyEvent = createMockEvent('/v1/auth/verify-otp', {
        username: testEmail,
        code: '123456',
      });

      const verifyResult = await verifyOtpHandler(verifyEvent);
      expect(verifyResult.statusCode).toBe(429);
      
      const verifyBody = JSON.parse(verifyResult.body);
      expect(verifyBody.error).toBe('TOO_MANY_ATTEMPTS');
    });
  });

  describe('Token Refresh Mechanism', () => {
    it('should refresh tokens after successful login', async () => {
      const testEmail = 'refresh-test@example.com';
      const testPassword = 'TestPassword123!';
      const testUserId = 'refresh-user-id';

      // Step 1: Complete registration and verification (mocked as already done)
      // Step 2: Login
      cognitoMock.on(InitiateAuthCommand).resolves({
        AuthenticationResult: {
          AccessToken: 'initial-access-token',
          IdToken: 'initial-id-token',
          RefreshToken: 'initial-refresh-token',
          ExpiresIn: 3600,
        },
      });

      cognitoMock.on(GetUserCommand).resolves({
        UserAttributes: [
          { Name: 'sub', Value: testUserId },
          { Name: 'custom:role', Value: 'Standard_User' },
        ],
      });

      dynamoMock.on(UpdateCommand).resolves({});
      dynamoMock.on(PutCommand).resolves({});

      const loginEvent = createMockEvent('/v1/auth/login', {
        username: testEmail,
        password: testPassword,
      });

      const loginResult = await loginHandler(loginEvent);
      expect(loginResult.statusCode).toBe(200);
      
      const loginBody = JSON.parse(loginResult.body);
      const refreshToken = loginBody.refreshToken;
      expect(refreshToken).toBe('initial-refresh-token');

      // Step 3: Use refresh token to get new access token
      cognitoMock.on(InitiateAuthCommand).resolves({
        AuthenticationResult: {
          AccessToken: 'new-access-token',
          IdToken: 'new-id-token',
          ExpiresIn: 3600,
        },
      });

      cognitoMock.on(GetUserCommand).resolves({
        UserAttributes: [
          { Name: 'sub', Value: testUserId },
          { Name: 'custom:role', Value: 'Standard_User' },
        ],
      });

      const refreshEvent = createMockEvent('/v1/auth/refresh', {
        refreshToken: refreshToken,
      });

      const refreshResult = await refreshTokenHandler(refreshEvent);
      expect(refreshResult.statusCode).toBe(200);
      
      const refreshBody = JSON.parse(refreshResult.body);
      expect(refreshBody.accessToken).toBe('new-access-token');
      expect(refreshBody.idToken).toBe('new-id-token');
      expect(refreshBody.userId).toBe(testUserId);
      expect(refreshBody.role).toBe('Standard_User');
    });

    it('should fail refresh with invalid token', async () => {
      // Try to refresh with invalid token
      cognitoMock.on(InitiateAuthCommand).rejects({
        name: 'NotAuthorizedException',
        message: 'Invalid refresh token',
      });

      dynamoMock.on(PutCommand).resolves({});

      const refreshEvent = createMockEvent('/v1/auth/refresh', {
        refreshToken: 'invalid-refresh-token',
      });

      const refreshResult = await refreshTokenHandler(refreshEvent);
      expect(refreshResult.statusCode).toBe(401);
      
      const refreshBody = JSON.parse(refreshResult.body);
      expect(refreshBody.error).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should fail refresh with expired token', async () => {
      // Try to refresh with expired token
      cognitoMock.on(InitiateAuthCommand).resolves({});

      dynamoMock.on(PutCommand).resolves({});

      const refreshEvent = createMockEvent('/v1/auth/refresh', {
        refreshToken: 'expired-refresh-token',
      });

      const refreshResult = await refreshTokenHandler(refreshEvent);
      expect(refreshResult.statusCode).toBe(401);
      
      const refreshBody = JSON.parse(refreshResult.body);
      expect(refreshBody.error).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('Role-Based Registration and Login', () => {
    it('should register and login Professional_User with correct role', async () => {
      const testEmail = 'professional@example.com';
      const testPassword = 'TestPassword123!';
      const testUserId = 'professional-user-id';
      const testCognitoSub = 'cognito-sub-pro';

      // Step 1: Register as Professional_User
      cognitoMock.on(SignUpCommand).resolves({
        UserSub: testCognitoSub,
        UserConfirmed: false,
      });

      dynamoMock.on(PutCommand).resolves({});

      const registerEvent = createMockEvent('/v1/auth/register', {
        email: testEmail,
        password: testPassword,
        role: 'Professional_User',
      });

      const registerResult = await registerHandler(registerEvent);
      expect(registerResult.statusCode).toBe(201);

      // Verify role was set correctly in Cognito
      const signUpCalls = cognitoMock.commandCalls(SignUpCommand);
      const userAttributes = signUpCalls[signUpCalls.length - 1].args[0].input.UserAttributes;
      const roleAttribute = userAttributes?.find((attr) => attr.Name === 'custom:role');
      expect(roleAttribute?.Value).toBe('Professional_User');

      // Step 2: Verify OTP
      cognitoMock.on(ConfirmSignUpCommand).resolves({});
      
      dynamoMock.on(QueryCommand).resolves({
        Items: [
          {
            userId: testUserId,
            email: testEmail,
            role: 'Professional_User',
            status: 'pending_verification',
          },
        ],
      });

      dynamoMock.on(UpdateCommand).resolves({});

      const verifyEvent = createMockEvent('/v1/auth/verify-otp', {
        username: testEmail,
        code: '123456',
      });

      await verifyOtpHandler(verifyEvent);

      // Step 3: Login and verify role in response
      cognitoMock.on(InitiateAuthCommand).resolves({
        AuthenticationResult: {
          AccessToken: 'pro-access-token',
          IdToken: 'pro-id-token',
          RefreshToken: 'pro-refresh-token',
          ExpiresIn: 3600,
        },
      });

      cognitoMock.on(GetUserCommand).resolves({
        UserAttributes: [
          { Name: 'sub', Value: testUserId },
          { Name: 'custom:role', Value: 'Professional_User' },
          { Name: 'email', Value: testEmail },
        ],
      });

      const loginEvent = createMockEvent('/v1/auth/login', {
        username: testEmail,
        password: testPassword,
      });

      const loginResult = await loginHandler(loginEvent);
      expect(loginResult.statusCode).toBe(200);
      
      const loginBody = JSON.parse(loginResult.body);
      expect(loginBody.role).toBe('Professional_User');
    });

    it('should default to Standard_User when role not specified', async () => {
      const testEmail = 'standard@example.com';
      const testPassword = 'TestPassword123!';

      // Register without specifying role
      cognitoMock.on(SignUpCommand).resolves({
        UserSub: 'cognito-sub-standard',
        UserConfirmed: false,
      });

      dynamoMock.on(PutCommand).resolves({});

      const registerEvent = createMockEvent('/v1/auth/register', {
        email: testEmail,
        password: testPassword,
      });

      const registerResult = await registerHandler(registerEvent);
      expect(registerResult.statusCode).toBe(201);

      // Verify default role is Standard_User
      const signUpCalls = cognitoMock.commandCalls(SignUpCommand);
      const userAttributes = signUpCalls[signUpCalls.length - 1].args[0].input.UserAttributes;
      const roleAttribute = userAttributes?.find((attr) => attr.Name === 'custom:role');
      expect(roleAttribute?.Value).toBe('Standard_User');
    });
  });

  describe('Error Scenarios Across Flow', () => {
    it('should handle registration failure and prevent subsequent steps', async () => {
      const testEmail = 'existing@example.com';
      const testPassword = 'TestPassword123!';

      // Step 1: Try to register with existing email
      cognitoMock.on(SignUpCommand).rejects({
        name: 'UsernameExistsException',
        message: 'User already exists',
      });

      const registerEvent = createMockEvent('/v1/auth/register', {
        email: testEmail,
        password: testPassword,
      });

      const registerResult = await registerHandler(registerEvent);
      expect(registerResult.statusCode).toBe(409);
      
      const registerBody = JSON.parse(registerResult.body);
      expect(registerBody.error).toBe('USER_EXISTS');

      // Step 2: Verification should fail for non-existent user
      cognitoMock.on(ConfirmSignUpCommand).rejects({
        name: 'UserNotFoundException',
        message: 'User not found',
      });

      const verifyEvent = createMockEvent('/v1/auth/verify-otp', {
        username: testEmail,
        code: '123456',
      });

      const verifyResult = await verifyOtpHandler(verifyEvent);
      expect(verifyResult.statusCode).toBe(404);
    });

    it('should handle login with wrong password', async () => {
      const testEmail = 'test@example.com';
      const wrongPassword = 'WrongPassword123!';

      // Try to login with wrong password
      cognitoMock.on(InitiateAuthCommand).rejects({
        name: 'NotAuthorizedException',
        message: 'Incorrect username or password',
      });

      dynamoMock.on(PutCommand).resolves({});

      const loginEvent = createMockEvent('/v1/auth/login', {
        username: testEmail,
        password: wrongPassword,
      });

      const loginResult = await loginHandler(loginEvent);
      expect(loginResult.statusCode).toBe(401);
      
      const loginBody = JSON.parse(loginResult.body);
      expect(loginBody.error).toBe('INVALID_CREDENTIALS');
    });

    it('should handle rate limiting across authentication endpoints', async () => {
      const testEmail = 'ratelimit@example.com';

      // Simulate rate limiting on registration
      cognitoMock.on(SignUpCommand).rejects({
        name: 'TooManyRequestsException',
        message: 'Too many requests',
      });

      const registerEvent = createMockEvent('/v1/auth/register', {
        email: testEmail,
        password: 'TestPassword123!',
      });

      const registerResult = await registerHandler(registerEvent);
      expect(registerResult.statusCode).toBe(500);

      // Simulate rate limiting on login
      cognitoMock.on(InitiateAuthCommand).rejects({
        name: 'TooManyRequestsException',
        message: 'Too many requests',
      });

      dynamoMock.on(PutCommand).resolves({});

      const loginEvent = createMockEvent('/v1/auth/login', {
        username: testEmail,
        password: 'TestPassword123!',
      });

      const loginResult = await loginHandler(loginEvent);
      expect(loginResult.statusCode).toBe(429);
      
      const loginBody = JSON.parse(loginResult.body);
      expect(loginBody.error).toBe('TOO_MANY_REQUESTS');
    });
  });

  describe('Complete Flow with Multiple Users', () => {
    it('should handle multiple users registering and logging in independently', async () => {
      // User 1: Email registration
      const user1Email = 'user1@example.com';
      const user1Password = 'User1Password123!';
      const user1Id = 'user-1-id';

      cognitoMock.on(SignUpCommand).resolves({
        UserSub: 'cognito-sub-1',
        UserConfirmed: false,
      });

      dynamoMock.on(PutCommand).resolves({});

      const register1Event = createMockEvent('/v1/auth/register', {
        email: user1Email,
        password: user1Password,
      });

      const register1Result = await registerHandler(register1Event);
      expect(register1Result.statusCode).toBe(201);

      // User 2: Phone registration
      const user2Phone = '+919876543210';
      const user2Password = 'User2Password123!';
      const user2Id = 'user-2-id';

      cognitoMock.on(SignUpCommand).resolves({
        UserSub: 'cognito-sub-2',
        UserConfirmed: false,
      });

      const register2Event = createMockEvent('/v1/auth/register', {
        phoneNumber: user2Phone,
        password: user2Password,
      });

      const register2Result = await registerHandler(register2Event);
      expect(register2Result.statusCode).toBe(201);

      // Verify both users
      cognitoMock.on(ConfirmSignUpCommand).resolves({});
      dynamoMock.on(QueryCommand).resolves({ Items: [] });
      dynamoMock.on(UpdateCommand).resolves({});

      const verify1Event = createMockEvent('/v1/auth/verify-otp', {
        username: user1Email,
        code: '111111',
      });

      const verify1Result = await verifyOtpHandler(verify1Event);
      expect(verify1Result.statusCode).toBe(200);

      const verify2Event = createMockEvent('/v1/auth/verify-otp', {
        username: user2Phone,
        code: '222222',
      });

      const verify2Result = await verifyOtpHandler(verify2Event);
      expect(verify2Result.statusCode).toBe(200);

      // Login both users
      cognitoMock.on(InitiateAuthCommand).resolves({
        AuthenticationResult: {
          AccessToken: 'user1-access-token',
          IdToken: 'user1-id-token',
          RefreshToken: 'user1-refresh-token',
          ExpiresIn: 3600,
        },
      });

      cognitoMock.on(GetUserCommand).resolves({
        UserAttributes: [
          { Name: 'sub', Value: user1Id },
          { Name: 'custom:role', Value: 'Standard_User' },
        ],
      });

      const login1Event = createMockEvent('/v1/auth/login', {
        username: user1Email,
        password: user1Password,
      });

      const login1Result = await loginHandler(login1Event);
      expect(login1Result.statusCode).toBe(200);

      cognitoMock.on(InitiateAuthCommand).resolves({
        AuthenticationResult: {
          AccessToken: 'user2-access-token',
          IdToken: 'user2-id-token',
          RefreshToken: 'user2-refresh-token',
          ExpiresIn: 3600,
        },
      });

      cognitoMock.on(GetUserCommand).resolves({
        UserAttributes: [
          { Name: 'sub', Value: user2Id },
          { Name: 'custom:role', Value: 'Standard_User' },
        ],
      });

      const login2Event = createMockEvent('/v1/auth/login', {
        username: user2Phone,
        password: user2Password,
      });

      const login2Result = await loginHandler(login2Event);
      expect(login2Result.statusCode).toBe(200);

      // Verify both users have different tokens
      const login1Body = JSON.parse(login1Result.body);
      const login2Body = JSON.parse(login2Result.body);
      expect(login1Body.accessToken).not.toBe(login2Body.accessToken);
    });
  });
});
