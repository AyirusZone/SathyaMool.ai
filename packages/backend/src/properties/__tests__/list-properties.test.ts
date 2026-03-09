import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../list-properties';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('List Properties Lambda', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.PROPERTIES_TABLE_NAME = 'SatyaMool-Properties';
    process.env.AWS_REGION = 'us-east-1';
  });

  const createMockEvent = (
    queryParams?: Record<string, string>,
    userId?: string
  ): APIGatewayProxyEvent => {
    return {
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'GET',
      isBase64Encoded: false,
      path: '/v1/properties',
      pathParameters: null,
      queryStringParameters: queryParams || null,
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
        httpMethod: 'GET',
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

  const mockProperties = [
    {
      propertyId: 'prop-1',
      userId: 'user-123',
      address: '123 Main Street, Bangalore',
      surveyNumber: 'SY-123/456',
      status: 'completed',
      trustScore: 85,
      documentCount: 5,
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T12:00:00.000Z',
    },
    {
      propertyId: 'prop-2',
      userId: 'user-123',
      address: '456 Park Avenue, Mumbai',
      surveyNumber: 'SY-789/012',
      status: 'processing',
      trustScore: null,
      documentCount: 3,
      createdAt: '2026-02-28T10:00:00.000Z',
      updatedAt: '2026-02-28T11:00:00.000Z',
    },
    {
      propertyId: 'prop-3',
      userId: 'user-123',
      address: '789 Lake View, Chennai',
      surveyNumber: 'TN-345/678',
      status: 'pending',
      trustScore: null,
      documentCount: 0,
      createdAt: '2026-02-27T10:00:00.000Z',
      updatedAt: '2026-02-27T10:00:00.000Z',
    },
  ];

  describe('Successful property listing', () => {
    it('should list all properties for authenticated user', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: mockProperties,
        Count: 3,
      });

      const event = createMockEvent({}, 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.properties).toHaveLength(3);
      expect(body.count).toBe(3);
      expect(body.properties[0].propertyId).toBe('prop-1');
    });

    it('should return empty array when user has no properties', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
      });

      const event = createMockEvent({}, 'user-456');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.properties).toHaveLength(0);
      expect(body.count).toBe(0);
    });

    it('should query DynamoDB with correct parameters', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: mockProperties,
      });

      const event = createMockEvent({}, 'user-123');
      await handler(event);

      const queryCalls = ddbMock.commandCalls(QueryCommand);
      expect(queryCalls.length).toBe(1);
      
      const queryCall = queryCalls[0];
      expect(queryCall.args[0].input.TableName).toBe('SatyaMool-Properties');
      expect(queryCall.args[0].input.IndexName).toBe('userId-createdAt-index');
      expect(queryCall.args[0].input.KeyConditionExpression).toBe('userId = :userId');
      expect(queryCall.args[0].input.ExpressionAttributeValues).toEqual({
        ':userId': 'user-123',
      });
      expect(queryCall.args[0].input.ScanIndexForward).toBe(false);
    });
  });

  describe('Filtering', () => {
    it('should filter properties by status', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: mockProperties,
      });

      const event = createMockEvent({ status: 'completed' }, 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.properties).toHaveLength(1);
      expect(body.properties[0].status).toBe('completed');
    });

    it('should filter properties by start date', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: mockProperties,
      });

      const event = createMockEvent({ startDate: '2026-02-28T00:00:00.000Z' }, 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.properties).toHaveLength(2);
      expect(body.properties.every((p: any) => p.createdAt >= '2026-02-28T00:00:00.000Z')).toBe(true);
    });

    it('should filter properties by end date', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: mockProperties,
      });

      const event = createMockEvent({ endDate: '2026-02-28T23:59:59.999Z' }, 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.properties).toHaveLength(2);
      expect(body.properties.every((p: any) => p.createdAt <= '2026-02-28T23:59:59.999Z')).toBe(true);
    });

    it('should filter properties by date range', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: mockProperties,
      });

      const event = createMockEvent(
        {
          startDate: '2026-02-27T00:00:00.000Z',
          endDate: '2026-02-28T23:59:59.999Z',
        },
        'user-123'
      );
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.properties).toHaveLength(2);
    });

    it('should filter by both status and date range', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: mockProperties,
      });

      const event = createMockEvent(
        {
          status: 'processing',
          startDate: '2026-02-28T00:00:00.000Z',
        },
        'user-123'
      );
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.properties).toHaveLength(1);
      expect(body.properties[0].status).toBe('processing');
    });
  });

  describe('Pagination', () => {
    it('should respect limit parameter', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: mockProperties.slice(0, 2),
        LastEvaluatedKey: { propertyId: 'prop-2', userId: 'user-123' },
      });

      const event = createMockEvent({ limit: '2' }, 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.properties).toHaveLength(2);
      expect(body.nextToken).toBeDefined();

      const queryCalls = ddbMock.commandCalls(QueryCommand);
      expect(queryCalls[0].args[0].input.Limit).toBe(2);
    });

    it('should use default limit of 50 when not specified', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: mockProperties,
      });

      const event = createMockEvent({}, 'user-123');
      await handler(event);

      const queryCalls = ddbMock.commandCalls(QueryCommand);
      expect(queryCalls[0].args[0].input.Limit).toBe(50);
    });

    it('should include nextToken when more results available', async () => {
      const lastKey = { propertyId: 'prop-3', userId: 'user-123', createdAt: '2026-02-27T10:00:00.000Z' };
      ddbMock.on(QueryCommand).resolves({
        Items: mockProperties,
        LastEvaluatedKey: lastKey,
      });

      const event = createMockEvent({}, 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.nextToken).toBeDefined();
      
      // Verify nextToken can be decoded
      const decodedToken = JSON.parse(Buffer.from(body.nextToken, 'base64').toString());
      expect(decodedToken).toEqual(lastKey);
    });

    it('should use nextToken for pagination', async () => {
      const lastKey = { propertyId: 'prop-2', userId: 'user-123', createdAt: '2026-02-28T10:00:00.000Z' };
      const nextToken = Buffer.from(JSON.stringify(lastKey)).toString('base64');

      ddbMock.on(QueryCommand).resolves({
        Items: [mockProperties[2]],
      });

      const event = createMockEvent({ nextToken }, 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const queryCalls = ddbMock.commandCalls(QueryCommand);
      expect(queryCalls[0].args[0].input.ExclusiveStartKey).toEqual(lastKey);
    });
  });

  describe('Validation errors', () => {
    it('should return 401 if user is not authenticated', async () => {
      const event = createMockEvent({});
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('UNAUTHORIZED');
    });

    it('should return 400 if limit is less than 1', async () => {
      const event = createMockEvent({ limit: '0' }, 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVALID_LIMIT');
    });

    it('should return 400 if limit exceeds 100', async () => {
      const event = createMockEvent({ limit: '101' }, 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVALID_LIMIT');
    });

    it('should return 400 if startDate is invalid', async () => {
      const event = createMockEvent({ startDate: 'invalid-date' }, 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVALID_DATE');
    });

    it('should return 400 if endDate is invalid', async () => {
      const event = createMockEvent({ endDate: '2026-13-45' }, 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVALID_DATE');
    });
  });

  describe('Error handling', () => {
    it('should handle DynamoDB errors gracefully', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('DynamoDB error'));

      const event = createMockEvent({}, 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INTERNAL_ERROR');
    });
  });
});
