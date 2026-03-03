import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  CodeMismatchException,
  ExpiredCodeException,
  NotAuthorizedException,
  UserNotFoundException,
  TooManyFailedAttemptsException,
  LimitExceededException,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBDocumentClient, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../verify-otp';

const cognitoMock = mockClient(CognitoIdentityProviderClient);
const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('OTP Verification Lambda', () => {
  beforeEach(() => {
    cognitoMock.reset();
    dynamoMock.reset();
    process.env.USER_POOL_CLIENT_ID = 'test-client-id';
    process.env.USERS_TABLE_NAME = 'SatyaMool-Users';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockEvent = (body: any): APIGatewayProxyEvent => {
    return {
      body: JSON.stringify(body),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/v1/auth/verify-otp',
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
        path: '/v1/auth/verify-otp',
        stage: 'test',
        requestId: 'test-request-id',
        requestTime: '01/Jan/2024:00:00:00 +0000',
        requestTimeEpoch: 1704067200000,
        resourceId: 'test-resource-id',
        resourcePath: '/v1/auth/verify-otp',
      },
      resource: '/v1/auth/verify-otp',
    } as APIGatewayProxyEvent;
  };

  describe('Successful OTP Verification', () => {
    it('should verify OTP and complete registration for phone number', async () => {
      const mockUserId = 'test-user-id-123';

      // Mock Cognito ConfirmSignUp
      cognitoMock.on(ConfirmSignUpCommand).resolves({});

      // Mock DynamoDB query to find user by phone
      dynamoMock.on(QueryCommand).resolves({
        Items: [
          {
            userId: mockUserId,
            phoneNumber: '+919876543210',
            status: 'pending_verification',
          },
        ],
      });

      // Mock DynamoDB update
      dynamoMock.on(UpdateCommand).resolves({});

      const event = createMockEvent({
        username: '+919876543210',
        code: '123456',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('verified successfully');
      expect(body.userId).toBe(mockUserId);
      expect(body.status).toBe('active');
    });

    it('should verify OTP and complete registration for email', async () => {
      const mockUserId = 'test-user-id-456';

      // Mock Cognito ConfirmSignUp
      cognitoMock.on(ConfirmSignUpCommand).resolves({});

      // Mock DynamoDB query to find user by email
      dynamoMock.on(QueryCommand).resolves({
        Items: [
          {
            userId: mockUserId,
            email: 'test@example.com',
            status: 'pending_verification',
          },
        ],
      });

      // Mock DynamoDB update
      dynamoMock.on(UpdateCommand).resolves({});

      const event = createMockEvent({
        username: 'test@example.com',
        code: '654321',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('verified successfully');
      expect(body.userId).toBe(mockUserId);
      expect(body.status).toBe('active');
    });

    it('should handle verification when user not found in DynamoDB', async () => {
      // Mock Cognito ConfirmSignUp (successful)
      cognitoMock.on(ConfirmSignUpCommand).resolves({});

      // Mock DynamoDB query returning no results
      dynamoMock.on(QueryCommand).resolves({
        Items: [],
      });

      const event = createMockEvent({
        username: '+919876543210',
        code: '123456',
      });

      const result = await handler(event);

      // Should still succeed even if DynamoDB update fails
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('verified successfully');
    });
  });

  describe('Input Validation', () => {
    it('should return 400 when request body is missing', async () => {
      const event = createMockEvent(null);
      event.body = null;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('MISSING_BODY');
    });

    it('should return 400 when username is missing', async () => {
      const event = createMockEvent({
        code: '123456',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('MISSING_PARAMETERS');
      expect(body.message).toContain('Username and verification code are required');
    });

    it('should return 400 when code is missing', async () => {
      const event = createMockEvent({
        username: '+919876543210',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('MISSING_PARAMETERS');
      expect(body.message).toContain('Username and verification code are required');
    });
  });

  describe('Cognito Error Handling', () => {
    it('should handle invalid verification code', async () => {
      cognitoMock.on(ConfirmSignUpCommand).rejects(
        new CodeMismatchException({
          message: 'Invalid verification code provided',
          $metadata: {},
        })
      );

      const event = createMockEvent({
        username: '+919876543210',
        code: 'wrong-code',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVALID_CODE');
      expect(body.message).toContain('Invalid verification code');
    });

    it('should handle expired verification code', async () => {
      cognitoMock.on(ConfirmSignUpCommand).rejects(
        new ExpiredCodeException({
          message: 'Verification code has expired',
          $metadata: {},
        })
      );

      const event = createMockEvent({
        username: '+919876543210',
        code: '123456',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('EXPIRED_CODE');
      expect(body.message).toContain('expired');
    });

    it('should handle already confirmed user', async () => {
      cognitoMock.on(ConfirmSignUpCommand).rejects(
        new NotAuthorizedException({
          message: 'User cannot be confirmed',
          $metadata: {},
        })
      );

      const event = createMockEvent({
        username: '+919876543210',
        code: '123456',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('NOT_AUTHORIZED');
      expect(body.message).toContain('already be verified');
    });

    it('should handle user not found', async () => {
      cognitoMock.on(ConfirmSignUpCommand).rejects(
        new UserNotFoundException({
          message: 'User does not exist',
          $metadata: {},
        })
      );

      const event = createMockEvent({
        username: 'nonexistent@example.com',
        code: '123456',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('USER_NOT_FOUND');
    });

    it('should handle too many failed attempts', async () => {
      cognitoMock.on(ConfirmSignUpCommand).rejects(
        new TooManyFailedAttemptsException({
          message: 'Too many failed attempts',
          $metadata: {},
        })
      );

      const event = createMockEvent({
        username: '+919876543210',
        code: 'wrong-code',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('TOO_MANY_ATTEMPTS');
    });

    it('should handle limit exceeded', async () => {
      cognitoMock.on(ConfirmSignUpCommand).rejects(
        new LimitExceededException({
          message: 'Attempt limit exceeded',
          $metadata: {},
        })
      );

      const event = createMockEvent({
        username: '+919876543210',
        code: '123456',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('LIMIT_EXCEEDED');
    });

    it('should handle generic errors', async () => {
      cognitoMock.on(ConfirmSignUpCommand).rejects(new Error('Unknown error'));

      const event = createMockEvent({
        username: '+919876543210',
        code: '123456',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INTERNAL_ERROR');
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in successful response', async () => {
      cognitoMock.on(ConfirmSignUpCommand).resolves({});
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const event = createMockEvent({
        username: '+919876543210',
        code: '123456',
      });

      const result = await handler(event);

      expect(result.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
      expect(result.headers).toHaveProperty('Access-Control-Allow-Credentials', true);
      expect(result.headers).toHaveProperty('Content-Type', 'application/json');
    });

    it('should include CORS headers in error response', async () => {
      const event = createMockEvent({
        username: '+919876543210',
      });

      const result = await handler(event);

      expect(result.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
      expect(result.headers).toHaveProperty('Access-Control-Allow-Credentials', true);
    });
  });
});
