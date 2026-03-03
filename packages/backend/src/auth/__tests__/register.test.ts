import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../register';
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

// Mock AWS SDK clients
const cognitoMock = mockClient(CognitoIdentityProviderClient);
const dynamoMock = mockClient(DynamoDBDocumentClient);

// Mock environment variables
process.env.USER_POOL_ID = 'test-pool-id';
process.env.USER_POOL_CLIENT_ID = 'test-client-id';
process.env.USERS_TABLE_NAME = 'SatyaMool-Users';
process.env.AWS_REGION = 'us-east-1';

describe('Registration Lambda Handler', () => {
  beforeEach(() => {
    cognitoMock.reset();
    dynamoMock.reset();
  });

  describe('Email Registration', () => {
    it('should successfully register a user with email', async () => {
      // Mock Cognito SignUp response
      cognitoMock.on(SignUpCommand).resolves({
        UserSub: 'cognito-user-sub-123',
        UserConfirmed: false,
        CodeDeliveryDetails: {
          Destination: 't***@e***.com',
          DeliveryMedium: 'EMAIL',
          AttributeName: 'email',
        },
      });

      // Mock DynamoDB Put
      dynamoMock.on(PutCommand).resolves({});

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Test@1234',
          givenName: 'Test',
          familyName: 'User',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.userId).toBeDefined();
      expect(body.message).toContain('verify');
      expect(body.userConfirmed).toBe(false);
      expect(body.codeDeliveryDetails).toBeDefined();
      expect(body.codeDeliveryDetails.deliveryMedium).toBe('EMAIL');
    });

    it('should register user with default Standard_User role', async () => {
      cognitoMock.on(SignUpCommand).resolves({
        UserSub: 'cognito-user-sub-123',
        UserConfirmed: false,
      });

      dynamoMock.on(PutCommand).resolves({});

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Test@1234',
        }),
      };

      await handler(event as APIGatewayProxyEvent);

      // Verify Cognito was called with Standard_User role
      const cognitoCalls = cognitoMock.commandCalls(SignUpCommand);
      expect(cognitoCalls.length).toBe(1);
      const userAttributes = cognitoCalls[0].args[0].input.UserAttributes;
      const roleAttribute = userAttributes?.find((attr) => attr.Name === 'custom:role');
      expect(roleAttribute?.Value).toBe('Standard_User');
    });

    it('should register user with Professional_User role when specified', async () => {
      cognitoMock.on(SignUpCommand).resolves({
        UserSub: 'cognito-user-sub-123',
        UserConfirmed: false,
      });

      dynamoMock.on(PutCommand).resolves({});

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'professional@example.com',
          password: 'Test@1234',
          role: 'Professional_User',
        }),
      };

      await handler(event as APIGatewayProxyEvent);

      const cognitoCalls = cognitoMock.commandCalls(SignUpCommand);
      const userAttributes = cognitoCalls[0].args[0].input.UserAttributes;
      const roleAttribute = userAttributes?.find((attr) => attr.Name === 'custom:role');
      expect(roleAttribute?.Value).toBe('Professional_User');
    });
  });

  describe('Phone Number Registration', () => {
    it('should successfully register a user with phone number', async () => {
      cognitoMock.on(SignUpCommand).resolves({
        UserSub: 'cognito-user-sub-456',
        UserConfirmed: false,
        CodeDeliveryDetails: {
          Destination: '+*******3210',
          DeliveryMedium: 'SMS',
          AttributeName: 'phone_number',
        },
      });

      dynamoMock.on(PutCommand).resolves({});

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          phoneNumber: '+919876543210',
          password: 'Test@1234',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.userId).toBeDefined();
      expect(body.userConfirmed).toBe(false);
      expect(body.codeDeliveryDetails?.deliveryMedium).toBe('SMS');
    });

    it('should format Indian phone number to E.164 format', async () => {
      cognitoMock.on(SignUpCommand).resolves({
        UserSub: 'cognito-user-sub-456',
        UserConfirmed: false,
      });

      dynamoMock.on(PutCommand).resolves({});

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          phoneNumber: '9876543210', // Without country code
          password: 'Test@1234',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      // The phone number should be auto-formatted to E.164
      expect(result.statusCode).toBe(201);

      const cognitoCalls = cognitoMock.commandCalls(SignUpCommand);
      expect(cognitoCalls.length).toBeGreaterThanOrEqual(1);
      
      // Get the last call (most recent)
      const lastCall = cognitoCalls[cognitoCalls.length - 1];
      const userAttributes = lastCall.args[0].input.UserAttributes;
      const phoneAttribute = userAttributes?.find((attr) => attr.Name === 'phone_number');
      expect(phoneAttribute?.Value).toBe('+919876543210');
    });
  });

  describe('Input Validation', () => {
    it('should return 400 if neither email nor phone number is provided', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          password: 'Test@1234',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toContain('email or phone number is required');
    });

    it('should return 400 if both email and phone number are provided', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          phoneNumber: '+919876543210',
          password: 'Test@1234',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toContain('either email or phone number');
    });

    it('should return 400 if email format is invalid', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'Test@1234',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toContain('Invalid email format');
    });

    it('should return 400 if phone number format is invalid', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          phoneNumber: '123', // Too short
          password: 'Test@1234',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toContain('Invalid phone number format');
    });

    it('should return 400 if password is missing', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toContain('Password is required');
    });

    it('should return 400 if password is too short', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Test@1',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toContain('at least 8 characters');
    });

    it('should return 400 if role is invalid', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Test@1234',
          role: 'InvalidRole',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toContain('Invalid role');
    });

    it('should return 400 if request body is missing', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        body: null,
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('MISSING_BODY');
    });
  });

  describe('Error Handling', () => {
    it('should return 409 if user already exists', async () => {
      cognitoMock.on(SignUpCommand).rejects({
        name: 'UsernameExistsException',
        message: 'User already exists',
      });

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'existing@example.com',
          password: 'Test@1234',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(409);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('USER_EXISTS');
    });

    it('should return 400 if password does not meet Cognito requirements', async () => {
      cognitoMock.on(SignUpCommand).rejects({
        name: 'InvalidPasswordException',
        message: 'Password does not meet requirements',
      });

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'weakpass',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVALID_PASSWORD');
    });

    it('should return 500 if code delivery fails', async () => {
      cognitoMock.on(SignUpCommand).rejects({
        name: 'CodeDeliveryFailureException',
        message: 'Failed to send verification code',
      });

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Test@1234',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('CODE_DELIVERY_FAILURE');
    });

    it('should return 500 for unexpected errors', async () => {
      cognitoMock.on(SignUpCommand).rejects({
        name: 'UnknownException',
        message: 'Something went wrong',
      });

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Test@1234',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INTERNAL_ERROR');
    });
  });

  describe('DynamoDB Integration', () => {
    it('should store user record in DynamoDB with correct attributes', async () => {
      cognitoMock.on(SignUpCommand).resolves({
        UserSub: 'cognito-user-sub-789',
        UserConfirmed: false,
      });

      dynamoMock.on(PutCommand).resolves({});

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Test@1234',
          givenName: 'John',
          familyName: 'Doe',
          role: 'Professional_User',
        }),
      };

      await handler(event as APIGatewayProxyEvent);

      const dynamoCalls = dynamoMock.commandCalls(PutCommand);
      expect(dynamoCalls.length).toBe(1);

      const item = dynamoCalls[0].args[0].input.Item!;
      expect(item.userId).toBeDefined();
      expect(item.email).toBe('test@example.com');
      expect(item.givenName).toBe('John');
      expect(item.familyName).toBe('Doe');
      expect(item.role).toBe('Professional_User');
      expect(item.status).toBe('pending_verification');
      expect(item.cognitoUsername).toBe('cognito-user-sub-789');
      expect(item.createdAt).toBeDefined();
    });

    it('should set status to active if user is auto-confirmed', async () => {
      cognitoMock.on(SignUpCommand).resolves({
        UserSub: 'cognito-user-sub-999',
        UserConfirmed: true, // Auto-confirmed
      });

      dynamoMock.on(PutCommand).resolves({});

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Test@1234',
        }),
      };

      await handler(event as APIGatewayProxyEvent);

      const dynamoCalls = dynamoMock.commandCalls(PutCommand);
      const item = dynamoCalls[0].args[0].input.Item!;
      expect(item.status).toBe('active');
    });
  });
});
