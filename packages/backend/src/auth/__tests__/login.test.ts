import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBDocumentClient, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../login';

const cognitoMock = mockClient(CognitoIdentityProviderClient);
const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('Login Lambda Handler', () => {
  beforeEach(() => {
    cognitoMock.reset();
    dynamoMock.reset();
    process.env.USER_POOL_CLIENT_ID = 'test-client-id';
    process.env.USERS_TABLE_NAME = 'SatyaMool-Users';
    process.env.AUDIT_LOGS_TABLE_NAME = 'SatyaMool-AuditLogs';
  });

  const createMockEvent = (body: any): APIGatewayProxyEvent => {
    return {
      body: JSON.stringify(body),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/v1/auth/login',
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
        path: '/v1/auth/login',
        stage: 'test',
        requestId: 'test-request-id',
        requestTime: '01/Jan/2024:00:00:00 +0000',
        requestTimeEpoch: 1704067200000,
        resourceId: 'test-resource-id',
        resourcePath: '/v1/auth/login',
      },
      resource: '/v1/auth/login',
    };
  };

  describe('Successful Login', () => {
    it('should authenticate user with email and password', async () => {
      const mockAuthResponse = {
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          IdToken: 'mock-id-token',
          RefreshToken: 'mock-refresh-token',
          ExpiresIn: 3600,
        },
      };

      const mockUserResponse = {
        UserAttributes: [
          { Name: 'sub', Value: 'user-123' },
          { Name: 'custom:role', Value: 'Standard_User' },
          { Name: 'email', Value: 'test@example.com' },
        ],
      };

      cognitoMock.on(InitiateAuthCommand).resolves(mockAuthResponse);
      cognitoMock.on(GetUserCommand).resolves(mockUserResponse);
      dynamoMock.on(UpdateCommand).resolves({});
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        username: 'test@example.com',
        password: 'TestPassword123!',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.accessToken).toBe('mock-access-token');
      expect(body.idToken).toBe('mock-id-token');
      expect(body.refreshToken).toBe('mock-refresh-token');
      expect(body.expiresIn).toBe(3600);
      expect(body.tokenType).toBe('Bearer');
      expect(body.userId).toBe('user-123');
      expect(body.role).toBe('Standard_User');
    });

    it('should authenticate user with phone number', async () => {
      const mockAuthResponse = {
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          IdToken: 'mock-id-token',
          RefreshToken: 'mock-refresh-token',
          ExpiresIn: 3600,
        },
      };

      const mockUserResponse = {
        UserAttributes: [
          { Name: 'sub', Value: 'user-456' },
          { Name: 'custom:role', Value: 'Professional_User' },
          { Name: 'phone_number', Value: '+919876543210' },
        ],
      };

      cognitoMock.on(InitiateAuthCommand).resolves(mockAuthResponse);
      cognitoMock.on(GetUserCommand).resolves(mockUserResponse);
      dynamoMock.on(UpdateCommand).resolves({});
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        username: '+919876543210',
        password: 'TestPassword123!',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.userId).toBe('user-456');
      expect(body.role).toBe('Professional_User');
    });

    it('should update lastLogin timestamp in DynamoDB', async () => {
      const mockAuthResponse = {
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          IdToken: 'mock-id-token',
          RefreshToken: 'mock-refresh-token',
          ExpiresIn: 3600,
        },
      };

      const mockUserResponse = {
        UserAttributes: [
          { Name: 'sub', Value: 'user-789' },
          { Name: 'custom:role', Value: 'Standard_User' },
        ],
      };

      cognitoMock.on(InitiateAuthCommand).resolves(mockAuthResponse);
      cognitoMock.on(GetUserCommand).resolves(mockUserResponse);
      dynamoMock.on(UpdateCommand).resolves({});
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        username: 'test@example.com',
        password: 'TestPassword123!',
      });

      await handler(event);

      // Verify UpdateCommand was called with correct parameters
      const updateCalls = dynamoMock.commandCalls(UpdateCommand);
      expect(updateCalls.length).toBe(1);
      expect(updateCalls[0].args[0].input).toMatchObject({
        TableName: 'SatyaMool-Users',
        Key: { userId: 'user-789' },
        UpdateExpression: 'SET lastLogin = :lastLogin',
      });
    });

    it('should log successful authentication event to AuditLogs', async () => {
      const mockAuthResponse = {
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          IdToken: 'mock-id-token',
          RefreshToken: 'mock-refresh-token',
          ExpiresIn: 3600,
        },
      };

      const mockUserResponse = {
        UserAttributes: [
          { Name: 'sub', Value: 'user-123' },
          { Name: 'custom:role', Value: 'Standard_User' },
        ],
      };

      cognitoMock.on(InitiateAuthCommand).resolves(mockAuthResponse);
      cognitoMock.on(GetUserCommand).resolves(mockUserResponse);
      dynamoMock.on(UpdateCommand).resolves({});
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        username: 'test@example.com',
        password: 'TestPassword123!',
      });

      await handler(event);

      // Verify PutCommand was called for audit log
      const putCalls = dynamoMock.commandCalls(PutCommand);
      expect(putCalls.length).toBe(1);
      const auditLog = putCalls[0].args[0].input.Item;
      expect(auditLog).toBeDefined();
      expect(auditLog).toMatchObject({
        username: 'test@example.com',
        action: 'login_success',
        outcome: 'authenticated',
        resourceType: 'authentication',
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
        requestId: 'test-request-id',
        userId: 'user-123',
      });
      expect(auditLog?.logId).toBeDefined();
      expect(auditLog?.timestamp).toBeDefined();
    });
  });

  describe('Failed Login', () => {
    it('should return 400 when request body is missing', async () => {
      const event = createMockEvent(null);
      event.body = null;

      dynamoMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('MISSING_BODY');
      expect(body.message).toBe('Request body is required');
    });

    it('should return 400 when username is missing', async () => {
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        password: 'TestPassword123!',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('MISSING_CREDENTIALS');
      expect(body.message).toBe('Username and password are required');
    });

    it('should return 400 when password is missing', async () => {
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        username: 'test@example.com',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('MISSING_CREDENTIALS');
    });

    it('should return 401 for invalid credentials', async () => {
      cognitoMock.on(InitiateAuthCommand).rejects({
        name: 'NotAuthorizedException',
        message: 'Incorrect username or password',
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        username: 'test@example.com',
        password: 'WrongPassword',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVALID_CREDENTIALS');
      expect(body.message).toBe('Invalid username or password');
    });

    it('should return 401 for non-existent user', async () => {
      cognitoMock.on(InitiateAuthCommand).rejects({
        name: 'UserNotFoundException',
        message: 'User does not exist',
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        username: 'nonexistent@example.com',
        password: 'TestPassword123!',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVALID_CREDENTIALS');
    });

    it('should return 403 for unconfirmed user', async () => {
      cognitoMock.on(InitiateAuthCommand).rejects({
        name: 'UserNotConfirmedException',
        message: 'User is not confirmed',
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        username: 'test@example.com',
        password: 'TestPassword123!',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('USER_NOT_CONFIRMED');
      expect(body.message).toBe(
        'User account is not confirmed. Please verify your account.'
      );
    });

    it('should return 403 for password reset required', async () => {
      cognitoMock.on(InitiateAuthCommand).rejects({
        name: 'PasswordResetRequiredException',
        message: 'Password reset required',
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        username: 'test@example.com',
        password: 'TestPassword123!',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('PASSWORD_RESET_REQUIRED');
    });

    it('should return 429 for too many requests', async () => {
      cognitoMock.on(InitiateAuthCommand).rejects({
        name: 'TooManyRequestsException',
        message: 'Too many requests',
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        username: 'test@example.com',
        password: 'TestPassword123!',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('TOO_MANY_REQUESTS');
    });

    it('should log failed authentication event', async () => {
      cognitoMock.on(InitiateAuthCommand).rejects({
        name: 'NotAuthorizedException',
        message: 'Incorrect username or password',
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        username: 'test@example.com',
        password: 'WrongPassword',
      });

      await handler(event);

      // Verify audit log was created for failed login
      const putCalls = dynamoMock.commandCalls(PutCommand);
      expect(putCalls.length).toBeGreaterThan(0);
      const auditLog = putCalls[putCalls.length - 1].args[0].input.Item;
      expect(auditLog).toMatchObject({
        username: 'test@example.com',
        action: 'login_failed',
        outcome: 'NotAuthorizedException',
        resourceType: 'authentication',
        ipAddress: '192.168.1.1',
        requestId: 'test-request-id',
      });
    });
  });

  describe('Token Refresh Logic', () => {
    it('should return refresh token for token refresh', async () => {
      const mockAuthResponse = {
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          IdToken: 'mock-id-token',
          RefreshToken: 'mock-refresh-token',
          ExpiresIn: 3600,
        },
      };

      const mockUserResponse = {
        UserAttributes: [
          { Name: 'sub', Value: 'user-123' },
          { Name: 'custom:role', Value: 'Standard_User' },
        ],
      };

      cognitoMock.on(InitiateAuthCommand).resolves(mockAuthResponse);
      cognitoMock.on(GetUserCommand).resolves(mockUserResponse);
      dynamoMock.on(UpdateCommand).resolves({});
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        username: 'test@example.com',
        password: 'TestPassword123!',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.refreshToken).toBe('mock-refresh-token');
      expect(body.expiresIn).toBe(3600);
    });
  });

  describe('Role-Based Claims', () => {
    it('should include Standard_User role in response', async () => {
      const mockAuthResponse = {
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          IdToken: 'mock-id-token',
          RefreshToken: 'mock-refresh-token',
          ExpiresIn: 3600,
        },
      };

      const mockUserResponse = {
        UserAttributes: [
          { Name: 'sub', Value: 'user-123' },
          { Name: 'custom:role', Value: 'Standard_User' },
        ],
      };

      cognitoMock.on(InitiateAuthCommand).resolves(mockAuthResponse);
      cognitoMock.on(GetUserCommand).resolves(mockUserResponse);
      dynamoMock.on(UpdateCommand).resolves({});
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        username: 'test@example.com',
        password: 'TestPassword123!',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.role).toBe('Standard_User');
    });

    it('should include Professional_User role in response', async () => {
      const mockAuthResponse = {
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          IdToken: 'mock-id-token',
          RefreshToken: 'mock-refresh-token',
          ExpiresIn: 3600,
        },
      };

      const mockUserResponse = {
        UserAttributes: [
          { Name: 'sub', Value: 'user-456' },
          { Name: 'custom:role', Value: 'Professional_User' },
        ],
      };

      cognitoMock.on(InitiateAuthCommand).resolves(mockAuthResponse);
      cognitoMock.on(GetUserCommand).resolves(mockUserResponse);
      dynamoMock.on(UpdateCommand).resolves({});
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        username: 'professional@example.com',
        password: 'TestPassword123!',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.role).toBe('Professional_User');
    });

    it('should include Admin_User role in response', async () => {
      const mockAuthResponse = {
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          IdToken: 'mock-id-token',
          RefreshToken: 'mock-refresh-token',
          ExpiresIn: 3600,
        },
      };

      const mockUserResponse = {
        UserAttributes: [
          { Name: 'sub', Value: 'user-789' },
          { Name: 'custom:role', Value: 'Admin_User' },
        ],
      };

      cognitoMock.on(InitiateAuthCommand).resolves(mockAuthResponse);
      cognitoMock.on(GetUserCommand).resolves(mockUserResponse);
      dynamoMock.on(UpdateCommand).resolves({});
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        username: 'admin@example.com',
        password: 'TestPassword123!',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.role).toBe('Admin_User');
    });

    it('should default to Standard_User if role is not set', async () => {
      const mockAuthResponse = {
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          IdToken: 'mock-id-token',
          RefreshToken: 'mock-refresh-token',
          ExpiresIn: 3600,
        },
      };

      const mockUserResponse = {
        UserAttributes: [{ Name: 'sub', Value: 'user-999' }],
      };

      cognitoMock.on(InitiateAuthCommand).resolves(mockAuthResponse);
      cognitoMock.on(GetUserCommand).resolves(mockUserResponse);
      dynamoMock.on(UpdateCommand).resolves({});
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        username: 'test@example.com',
        password: 'TestPassword123!',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.role).toBe('Standard_User');
    });
  });
});
