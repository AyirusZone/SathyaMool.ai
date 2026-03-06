import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../get-trust-score';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Get Trust Score Lambda', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.PROPERTIES_TABLE_NAME = 'SatyaMool-Properties';
    process.env.TRUST_SCORES_TABLE_NAME = 'SatyaMool-TrustScores';
    process.env.DOCUMENTS_TABLE_NAME = 'SatyaMool-Documents';
    process.env.AWS_REGION = 'us-east-1';
  });

  const createMockEvent = (
    propertyId: string,
    userId?: string,
    userRole?: string
  ): APIGatewayProxyEvent => {
    return {
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'GET',
      isBase64Encoded: false,
      path: `/v1/properties/${propertyId}/trust-score`,
      pathParameters: { id: propertyId },
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
            'custom:role': userRole || 'Standard_User',
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
        path: `/v1/properties/${propertyId}/trust-score`,
        stage: 'test',
        requestId: 'test-request-id',
        requestTimeEpoch: Date.now(),
        resourceId: 'test-resource',
        resourcePath: '/v1/properties/{id}/trust-score',
      },
      resource: '/v1/properties/{id}/trust-score',
    } as APIGatewayProxyEvent;
  };

  const mockProperty = {
    propertyId: 'prop-123',
    userId: 'user-123',
    address: '123 Main Street, Bangalore',
    surveyNumber: 'SY-123/456',
    status: 'scoring_complete',
    trustScore: 85,
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T12:00:00.000Z',
  };

  const mockTrustScoreData = {
    propertyId: 'prop-123',
    totalScore: 85,
    calculatedAt: '2026-03-01T12:00:00.000Z',
    scoreBreakdown: {
      components: [
        {
          component: 'Base Score',
          score: 80,
          explanation: 'Complete ownership chain with no gaps',
          documentReferences: ['doc-1', 'doc-2', 'doc-3'],
        },
        {
          component: 'Encumbrance Certificate Verification',
          score: 10,
          explanation: 'Encumbrance Certificate provided and matches extracted data',
          documentReferences: ['doc-4'],
        },
        {
          component: 'Recency Bonus',
          score: 5,
          explanation: 'All documents are less than 30 years old',
          documentReferences: ['doc-1', 'doc-2', 'doc-3'],
        },
        {
          component: 'Gap Penalty',
          score: -10,
          explanation: 'One gap detected in ownership chain',
          documentReferences: [],
        },
      ],
    },
    factors: [
      'Base Score',
      'Encumbrance Certificate Verification',
      'Recency Bonus',
      'Gap Penalty',
    ],
  };

  const mockDocuments = [
    {
      documentId: 'doc-1',
      propertyId: 'prop-123',
      documentType: 'Mother Deed',
      uploadedAt: '2026-03-01T10:00:00.000Z',
      s3Key: 'documents/doc-1.pdf',
      extractedData: {
        ownerName: 'John Doe',
        date: '2000-01-15',
      },
    },
    {
      documentId: 'doc-2',
      propertyId: 'prop-123',
      documentType: 'Sale Deed',
      uploadedAt: '2026-03-01T10:05:00.000Z',
      s3Key: 'documents/doc-2.pdf',
      extractedData: {
        buyerName: 'Jane Smith',
        sellerName: 'John Doe',
        date: '2010-05-20',
      },
    },
    {
      documentId: 'doc-3',
      propertyId: 'prop-123',
      documentType: 'Sale Deed',
      uploadedAt: '2026-03-01T10:10:00.000Z',
      s3Key: 'documents/doc-3.pdf',
      extractedData: {
        buyerName: 'Bob Johnson',
        sellerName: 'Jane Smith',
        date: '2020-08-10',
      },
    },
    {
      documentId: 'doc-4',
      propertyId: 'prop-123',
      documentType: 'Encumbrance Certificate',
      uploadedAt: '2026-03-01T10:15:00.000Z',
      s3Key: 'documents/doc-4.pdf',
      extractedData: {
        transactions: [
          { date: '2000-01-15', parties: 'John Doe' },
          { date: '2010-05-20', parties: 'John Doe to Jane Smith' },
          { date: '2020-08-10', parties: 'Jane Smith to Bob Johnson' },
        ],
      },
    },
  ];

  describe('Successful Trust Score retrieval', () => {
    it('should retrieve Trust Score with breakdown for owner', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(GetCommand, {
          TableName: 'SatyaMool-TrustScores',
        })
        .resolves({
          Item: mockTrustScoreData,
        })
        .on(QueryCommand, {
          TableName: 'SatyaMool-Documents',
        })
        .resolves({
          Items: mockDocuments,
        });

      const event = createMockEvent('prop-123', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      
      // Verify Trust Score structure
      expect(body.propertyId).toBe('prop-123');
      expect(body.totalScore).toBe(85);
      expect(body.calculatedAt).toBe('2026-03-01T12:00:00.000Z');
      expect(body.scoreBreakdown).toBeDefined();
      expect(body.factors).toBeDefined();
      expect(body.documentReferences).toBeDefined();
    });

    it('should include score breakdown with components', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(GetCommand, {
          TableName: 'SatyaMool-TrustScores',
        })
        .resolves({
          Item: mockTrustScoreData,
        })
        .on(QueryCommand, {
          TableName: 'SatyaMool-Documents',
        })
        .resolves({
          Items: mockDocuments,
        });

      const event = createMockEvent('prop-123', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      
      // Verify components
      expect(body.scoreBreakdown.components).toHaveLength(4);
      
      const baseScore = body.scoreBreakdown.components[0];
      expect(baseScore.component).toBe('Base Score');
      expect(baseScore.score).toBe(80);
      expect(baseScore.explanation).toBe('Complete ownership chain with no gaps');
      expect(baseScore.documentReferences).toEqual(['doc-1', 'doc-2', 'doc-3']);
    });

    it('should include document references map', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(GetCommand, {
          TableName: 'SatyaMool-TrustScores',
        })
        .resolves({
          Item: mockTrustScoreData,
        })
        .on(QueryCommand, {
          TableName: 'SatyaMool-Documents',
        })
        .resolves({
          Items: mockDocuments,
        });

      const event = createMockEvent('prop-123', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      
      // Verify document references
      expect(body.documentReferences).toBeDefined();
      expect(Object.keys(body.documentReferences)).toHaveLength(4);
      
      const doc1 = body.documentReferences['doc-1'];
      expect(doc1.documentType).toBe('Mother Deed');
      expect(doc1.s3Key).toBe('documents/doc-1.pdf');
    });

    it('should retrieve Trust Score for admin user', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(GetCommand, {
          TableName: 'SatyaMool-TrustScores',
        })
        .resolves({
          Item: mockTrustScoreData,
        })
        .on(QueryCommand, {
          TableName: 'SatyaMool-Documents',
        })
        .resolves({
          Items: mockDocuments,
        });

      const event = createMockEvent('prop-123', 'admin-456', 'Admin_User');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.totalScore).toBe(85);
    });

    it('should include all score factors', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(GetCommand, {
          TableName: 'SatyaMool-TrustScores',
        })
        .resolves({
          Item: mockTrustScoreData,
        })
        .on(QueryCommand, {
          TableName: 'SatyaMool-Documents',
        })
        .resolves({
          Items: mockDocuments,
        });

      const event = createMockEvent('prop-123', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      
      expect(body.factors).toEqual([
        'Base Score',
        'Encumbrance Certificate Verification',
        'Recency Bonus',
        'Gap Penalty',
      ]);
    });

    it('should handle Trust Score with penalties', async () => {
      const lowScoreData = {
        ...mockTrustScoreData,
        totalScore: 45,
        scoreBreakdown: {
          components: [
            {
              component: 'Base Score',
              score: 80,
              explanation: 'Complete ownership chain with no gaps',
              documentReferences: ['doc-1', 'doc-2'],
            },
            {
              component: 'Gap Penalty',
              score: -15,
              explanation: 'One gap detected in ownership chain',
              documentReferences: [],
            },
            {
              component: 'Survey Number Mismatch',
              score: -20,
              explanation: 'Survey numbers do not match across documents',
              documentReferences: ['doc-1', 'doc-2'],
            },
          ],
        },
      };

      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(GetCommand, {
          TableName: 'SatyaMool-TrustScores',
        })
        .resolves({
          Item: lowScoreData,
        })
        .on(QueryCommand, {
          TableName: 'SatyaMool-Documents',
        })
        .resolves({
          Items: mockDocuments,
        });

      const event = createMockEvent('prop-123', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      
      expect(body.totalScore).toBe(45);
      expect(body.scoreBreakdown.components).toHaveLength(3);
      
      const penalty = body.scoreBreakdown.components.find(
        (c: any) => c.component === 'Survey Number Mismatch'
      );
      expect(penalty.score).toBe(-20);
    });
  });

  describe('Authorization', () => {
    it('should return 401 if user is not authenticated', async () => {
      const event = createMockEvent('prop-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('UNAUTHORIZED');
    });

    it('should return 403 if user does not own property and is not admin', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        });

      const event = createMockEvent('prop-123', 'other-user-456');
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('FORBIDDEN');
    });
  });

  describe('Validation errors', () => {
    it('should return 400 if property ID is missing', async () => {
      const event = createMockEvent('', 'user-123');
      event.pathParameters = null;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('MISSING_PROPERTY_ID');
    });

    it('should return 404 if property does not exist', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [],
        });

      const event = createMockEvent('nonexistent-prop', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('PROPERTY_NOT_FOUND');
    });

    it('should return 404 if Trust Score not yet calculated', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(GetCommand, {
          TableName: 'SatyaMool-TrustScores',
        })
        .resolves({
          Item: undefined,
        });

      const event = createMockEvent('prop-123', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('TRUST_SCORE_NOT_FOUND');
      expect(body.message).toContain('not yet calculated');
    });
  });

  describe('Error handling', () => {
    it('should handle DynamoDB errors gracefully', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('DynamoDB error'));

      const event = createMockEvent('prop-123', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INTERNAL_ERROR');
    });
  });
});
