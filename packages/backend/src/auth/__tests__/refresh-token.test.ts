import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../refresh-token';
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

// Create mocks
const cognitoMock = mockClient(CognitoIdentityProviderClient);
const dynamoMock = mockClient(DynamoDBDocumentClient);

// Mock event helper
const createMockEvent = (body: any): APIGatewayProxyEvent => {
  return {
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/v1/auth/refresh',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
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
      path: '/v1/auth/refresh',
      stage: 'test',
      requestId: 'test-request-id',
      requestTime: '01/Jan/2024:00:00:00 +0000',
      requestTimeEpoch: 1704067200000,
      resourceId: 'test-resource',
      resourcePath: '/v1/auth/refresh',
    },
    resource: '/v1/auth/refresh',
  } as APIGatewayProxyEvent;
};

describe('Token Refresh Lambda Handler', () => {
  beforeEach(() => {
    // Reset mocks before each test
    cognitoMock.reset();
    dynamoMock.reset();

    // Set environment variables
    process.env.USER_POOL_CLIENT_ID = 'test-client-id';
    process.env.AUDIT_LOGS_TABLE_NAME = 'SatyaMool-AuditLogs';
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Successful Token Refresh', () => {
    it('should refresh tokens with valid refresh token', async () => {
      // Mock Cognito InitiateAuth response
      cognitoMock.on(InitiateAuthCommand).resolves({
        AuthenticationResult: {
          AccessToken: 'new-access-token',
          IdToken: 'new-id-token',
          ExpiresIn: 3600,
        },
      });

      // Mock Cognito GetUser response
      cognitoMock.on(GetUserCommand).resolves({
        UserAttributes: [
          { Name: 'sub', Value: 'user-123' },
          { Name: 'custom:role', Value: 'Standard_User' },
        ],
      });

      // Mock DynamoDB PutCommand for audit log
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        refreshToken: 'valid-refresh-token',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.accessToken).toBe('new-access-token');
      expect(body.idToken).toBe('new-id-token');
      expect(body.expiresIn).toBe(3600);
      expect(body.tokenType).toBe('Bearer');
      expect(body.userId).toBe('user-123');
      expect(body.role).toBe('Standard_User');
    });

    it('should refresh tokens for Professional_User', async () => {
      // Mock Cognito InitiateAuth response
      cognitoMock.on(InitiateAuthCommand).resolves({
        AuthenticationResult: {
          AccessToken: 'new-access-token',
          IdToken: 'new-id-token',
          ExpiresIn: 3600,
        },
      });

      // Mock Cognito GetUser response with Professional_User role
      cognitoMock.on(GetUserCommand).resolves({
        UserAttributes: [
          { Name: 'sub', Value: 'user-456' },
          { Name: 'custom:role', Value: 'Professional_User' },
        ],
      });

      // Mock DynamoDB PutCommand for audit log
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        refreshToken: 'valid-refresh-token',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.role).toBe('Professional_User');
    });

    it('should log successful token refresh event', async () => {
      // Mock Cognito responses
      cognitoMock.on(InitiateAuthCommand).resolves({
        AuthenticationResult: {
          AccessToken: 'new-access-token',
          IdToken: 'new-id-token',
          ExpiresIn: 3600,
        },
      });

      cognitoMock.on(GetUserCommand).resolves({
        UserAttributes: [
          { Name: 'sub', Value: 'user-123' },
          { Name: 'custom:role', Value: 'Standard_User' },
        ],
      });

      // Mock DynamoDB PutCommand for audit log
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        refreshToken: 'valid-refresh-token',
      });

      await handler(event);

      // Verify audit log was created
      const putCalls = dynamoMock.commandCalls(PutCommand);
      expect(putCalls.length).toBe(1);
      expect(putCalls[0].args[0].input.Item).toMatchObject({
        userId: 'user-123',
        action: 'token_refresh_success',
        outcome: 'tokens_refreshed',
        resourceType: 'authentication',
      });
    });
  });

  describe('Validation Errors', () => {
    it('should return 400 when request body is missing', async () => {
      const event = createMockEvent(null);
      event.body = null;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('MISSING_BODY');
      expect(body.message).toBe('Request body is required');
    });

    it('should return 400 when refresh token is missing', async () => {
      const event = createMockEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('MISSING_REFRESH_TOKEN');
      expect(body.message).toBe('Refresh token is required');
    });
  });

  describe('Authentication Errors', () => {
    it('should return 401 when refresh token is invalid', async () => {
      // Mock Cognito InitiateAuth to return no AuthenticationResult
      cognitoMock.on(InitiateAuthCommand).resolves({});

      // Mock DynamoDB PutCommand for audit log
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        refreshToken: 'invalid-refresh-token',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVALID_REFRESH_TOKEN');
      expect(body.message).toBe('Invalid or expired refresh token');
    });

    it('should return 401 when Cognito returns NotAuthorizedException', async () => {
      // Mock Cognito to throw NotAuthorizedException
      const error = new Error('Not authorized');
      error.name = 'NotAuthorizedException';
      cognitoMock.on(InitiateAuthCommand).rejects(error);

      // Mock DynamoDB PutCommand for audit log
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        refreshToken: 'expired-refresh-token',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVALID_REFRESH_TOKEN');
      expect(body.message).toBe('Invalid or expired refresh token');
    });

    it('should return 401 when user is not found', async () => {
      // Mock Cognito to throw UserNotFoundException
      const error = new Error('User not found');
      error.name = 'UserNotFoundException';
      cognitoMock.on(InitiateAuthCommand).rejects(error);

      // Mock DynamoDB PutCommand for audit log
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        refreshToken: 'valid-refresh-token',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('USER_NOT_FOUND');
      expect(body.message).toBe('User not found');
    });

    it('should return 429 when too many requests', async () => {
      // Mock Cognito to throw TooManyRequestsException
      const error = new Error('Too many requests');
      error.name = 'TooManyRequestsException';
      cognitoMock.on(InitiateAuthCommand).rejects(error);

      // Mock DynamoDB PutCommand for audit log
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        refreshToken: 'valid-refresh-token',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('TOO_MANY_REQUESTS');
      expect(body.message).toBe('Too many refresh attempts. Please try again later.');
    });
  });

  describe('Error Handling', () => {
    it('should return 500 for unexpected errors', async () => {
      // Mock Cognito to throw unexpected error
      const error = new Error('Unexpected error');
      error.name = 'UnexpectedError';
      cognitoMock.on(InitiateAuthCommand).rejects(error);

      // Mock DynamoDB PutCommand for audit log
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        refreshToken: 'valid-refresh-token',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INTERNAL_ERROR');
      expect(body.message).toBe('An error occurred during token refresh. Please try again.');
    });

    it('should log failed token refresh event on error', async () => {
      // Mock Cognito to throw error
      const error = new Error('Test error');
      error.name = 'TestError';
      cognitoMock.on(InitiateAuthCommand).rejects(error);

      // Mock DynamoDB PutCommand for audit log
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        refreshToken: 'valid-refresh-token',
      });

      await handler(event);

      // Verify audit log was created
      const putCalls = dynamoMock.commandCalls(PutCommand);
      expect(putCalls.length).toBe(1);
      expect(putCalls[0].args[0].input.Item).toMatchObject({
        action: 'token_refresh_failed',
        outcome: 'TestError',
        resourceType: 'authentication',
      });
    });

    it('should handle audit log failures gracefully', async () => {
      // Mock Cognito responses
      cognitoMock.on(InitiateAuthCommand).resolves({
        AuthenticationResult: {
          AccessToken: 'new-access-token',
          IdToken: 'new-id-token',
          ExpiresIn: 3600,
        },
      });

      cognitoMock.on(GetUserCommand).resolves({
        UserAttributes: [
          { Name: 'sub', Value: 'user-123' },
          { Name: 'custom:role', Value: 'Standard_User' },
        ],
      });

      // Mock DynamoDB to fail
      dynamoMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      const event = createMockEvent({
        refreshToken: 'valid-refresh-token',
      });

      const result = await handler(event);

      // Should still succeed even if audit log fails
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.accessToken).toBe('new-access-token');
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in successful response', async () => {
      // Mock Cognito responses
      cognitoMock.on(InitiateAuthCommand).resolves({
        AuthenticationResult: {
          AccessToken: 'new-access-token',
          IdToken: 'new-id-token',
          ExpiresIn: 3600,
        },
      });

      cognitoMock.on(GetUserCommand).resolves({
        UserAttributes: [
          { Name: 'sub', Value: 'user-123' },
          { Name: 'custom:role', Value: 'Standard_User' },
        ],
      });

      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        refreshToken: 'valid-refresh-token',
      });

      const result = await handler(event);

      expect(result.headers).toMatchObject({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      });
    });

    it('should include CORS headers in error response', async () => {
      const event = createMockEvent({});

      const result = await handler(event);

      expect(result.headers).toMatchObject({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      });
    });
  });
});
