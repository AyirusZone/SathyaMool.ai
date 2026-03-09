import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../create-property';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Create Property Lambda', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.PROPERTIES_TABLE_NAME = 'SatyaMool-Properties';
    process.env.AWS_REGION = 'us-east-1';
  });

  const createMockEvent = (body: any, userId?: string): APIGatewayProxyEvent => {
    return {
      body: JSON.stringify(body),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/v1/properties',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        accountId: '123456789012',
        apiId: 'test-api',
        authorizer: userId ? {
          claims: {
            sub: userId,
            'cognito:username': 'testuser',
          },
        } : {},
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
          sourceIp: '127.0.0.1',
          user: null,
          userAgent: 'test-agent',
          userArn: null,
        },
        path: '/v1/properties',
        stage: 'test',
        requestId: 'test-request-id',
        requestTimeEpoch: Date.now(),
        resourceId: 'test-resource',
        resourcePath: '/v1/properties',
      },
      resource: '/v1/properties',
    } as APIGatewayProxyEvent;
  };

  describe('Successful property creation', () => {
    it('should create property with address and survey number', async () => {
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent(
        {
          address: '123 Main Street, Bangalore, Karnataka',
          surveyNumber: 'SY-123/456',
          description: 'Residential property in prime location',
        },
        'user-123'
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.propertyId).toBeDefined();
      expect(body.userId).toBe('user-123');
      expect(body.address).toBe('123 Main Street, Bangalore, Karnataka');
      expect(body.surveyNumber).toBe('SY-123/456');
      expect(body.status).toBe('pending');
      expect(body.trustScore).toBeNull();
      expect(body.message).toBe('Property verification created successfully');
    });

    it('should create property with only address', async () => {
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent(
        {
          address: '456 Park Avenue, Mumbai, Maharashtra',
        },
        'user-456'
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.propertyId).toBeDefined();
      expect(body.address).toBe('456 Park Avenue, Mumbai, Maharashtra');
      expect(body.surveyNumber).toBeUndefined();
    });

    it('should create property with only survey number', async () => {
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent(
        {
          surveyNumber: 'SY-789/012',
        },
        'user-789'
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.propertyId).toBeDefined();
      expect(body.surveyNumber).toBe('SY-789/012');
      expect(body.address).toBeUndefined();
    });

    it('should store correct data in DynamoDB', async () => {
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent(
        {
          address: '789 Lake View, Chennai, Tamil Nadu',
          surveyNumber: 'TN-345/678',
        },
        'user-abc'
      );

      await handler(event);

      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBe(1);
      
      const putCall = putCalls[0];
      expect(putCall.args[0].input.TableName).toBe('SatyaMool-Properties');
      expect(putCall.args[0].input.Item).toMatchObject({
        userId: 'user-abc',
        address: '789 Lake View, Chennai, Tamil Nadu',
        surveyNumber: 'TN-345/678',
        status: 'pending',
        trustScore: null,
        documentCount: 0,
      });
      expect(putCall.args[0].input.Item?.propertyId).toBeDefined();
      expect(putCall.args[0].input.Item?.createdAt).toBeDefined();
      expect(putCall.args[0].input.Item?.updatedAt).toBeDefined();
    });
  });

  describe('Validation errors', () => {
    it('should return 401 if user is not authenticated', async () => {
      const event = createMockEvent({
        address: '123 Main Street',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('UNAUTHORIZED');
      expect(body.message).toBe('User authentication required');
    });

    it('should return 400 if request body is missing', async () => {
      const event = createMockEvent(null, 'user-123');
      event.body = null;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('MISSING_BODY');
    });

    it('should return 400 if neither address nor survey number provided', async () => {
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent(
        {
          description: 'Some description',
        },
        'user-123'
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('Either address or survey number is required');
    });

    it('should return 400 if address exceeds 500 characters', async () => {
      const longAddress = 'A'.repeat(501);
      const event = createMockEvent(
        {
          address: longAddress,
        },
        'user-123'
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('Address must not exceed 500 characters');
    });

    it('should return 400 if survey number exceeds 100 characters', async () => {
      const longSurveyNumber = 'S'.repeat(101);
      const event = createMockEvent(
        {
          surveyNumber: longSurveyNumber,
        },
        'user-123'
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('Survey number must not exceed 100 characters');
    });

    it('should return 400 if description exceeds 1000 characters', async () => {
      const longDescription = 'D'.repeat(1001);
      const event = createMockEvent(
        {
          address: '123 Main Street',
          description: longDescription,
        },
        'user-123'
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('Description must not exceed 1000 characters');
    });
  });

  describe('Error handling', () => {
    it('should handle DynamoDB errors gracefully', async () => {
      ddbMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      const event = createMockEvent(
        {
          address: '123 Main Street',
        },
        'user-123'
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INTERNAL_ERROR');
    });

    it('should handle duplicate property ID', async () => {
      const error = new Error('Conditional check failed');
      error.name = 'ConditionalCheckFailedException';
      ddbMock.on(PutCommand).rejects(error);

      const event = createMockEvent(
        {
          address: '123 Main Street',
        },
        'user-123'
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('PROPERTY_EXISTS');
    });
  });
});
