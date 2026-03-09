import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../generate-report';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

// Mock getSignedUrl
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/presigned-url'),
}));

describe('Generate Report Lambda', () => {
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
    process.env.PROPERTIES_TABLE_NAME = 'SatyaMool-Properties';
    process.env.LINEAGE_TABLE_NAME = 'SatyaMool-Lineage';
    process.env.TRUST_SCORES_TABLE_NAME = 'SatyaMool-TrustScores';
    process.env.DOCUMENTS_TABLE_NAME = 'SatyaMool-Documents';
    process.env.REPORTS_BUCKET_NAME = 'satyamool-reports';
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
      path: `/v1/properties/${propertyId}/report`,
      pathParameters: { id: propertyId },
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        accountId: '123456789012',
        apiId: 'test-api',
        authorizer: {
          claims: {
            sub: userId || 'user-123',
            'custom:role': userRole || 'Standard_User',
          },
        },
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
        path: `/v1/properties/${propertyId}/report`,
        stage: 'test',
        requestId: 'test-request-id',
        requestTimeEpoch: Date.now(),
        resourceId: 'test-resource',
        resourcePath: '/v1/properties/{id}/report',
      },
      resource: '/v1/properties/{id}/report',
    } as APIGatewayProxyEvent;
  };

  const mockProperty = {
    propertyId: 'property-123',
    userId: 'user-123',
    address: '123 Test Street, Bangalore',
    surveyNumber: 'SY-123/456',
    status: 'completed',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
  };

  const mockLineageData = {
    propertyId: 'property-123',
    nodes: [
      {
        id: 'node-1',
        name: 'John Doe',
        date: '2020-01-01',
        type: 'owner',
        isGap: false,
        hasWarning: false,
      },
      {
        id: 'node-2',
        name: 'Jane Smith',
        date: '2022-06-15',
        type: 'owner',
        isGap: false,
        hasWarning: false,
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        transferType: 'sale',
        date: '2022-06-15',
        documentId: 'doc-1',
      },
    ],
    gaps: [],
    motherDeed: {
      name: 'John Doe',
      date: '2020-01-01',
    },
  };

  const mockTrustScoreData = {
    propertyId: 'property-123',
    totalScore: 85,
    calculatedAt: '2024-01-15T00:00:00Z',
    scoreBreakdown: {
      components: [
        {
          component: 'Base Score',
          score: 80,
          explanation: 'Complete ownership chain with no gaps',
        },
        {
          component: 'Encumbrance Certificate Bonus',
          score: 10,
          explanation: 'EC provided and matches extracted data',
        },
        {
          component: 'Recency Bonus',
          score: 5,
          explanation: 'All documents are less than 30 years old',
        },
        {
          component: 'Date Inconsistency Penalty',
          score: -10,
          explanation: 'One date inconsistency detected',
        },
      ],
    },
    factors: [
      'Complete ownership chain',
      'EC verification successful',
      'Recent documents',
    ],
  };

  const mockDocuments = [
    {
      documentId: 'doc-1',
      propertyId: 'property-123',
      documentType: 'Sale Deed',
      uploadedAt: '2024-01-10T00:00:00Z',
      processingStatus: 'analysis_complete',
      s3Key: 'properties/property-123/documents/doc-1.pdf',
      extractedData: {
        buyerName: 'Jane Smith',
        sellerName: 'John Doe',
        transactionDate: '2022-06-15',
        surveyNumber: 'SY-123/456',
        saleConsideration: 'Rs. 50,00,000',
      },
    },
    {
      documentId: 'doc-2',
      propertyId: 'property-123',
      documentType: 'Mother Deed',
      uploadedAt: '2024-01-10T00:00:00Z',
      processingStatus: 'analysis_complete',
      s3Key: 'properties/property-123/documents/doc-2.pdf',
      extractedData: {
        ownerName: 'John Doe',
        grantDate: '2020-01-01',
        surveyNumber: 'SY-123/456',
      },
    },
  ];

  test('should generate PDF report successfully', async () => {
    // Mock property query
    ddbMock.on(QueryCommand, {
      TableName: 'SatyaMool-Properties',
    }).resolves({
      Items: [mockProperty],
    });

    // Mock lineage data
    ddbMock.on(GetCommand, {
      TableName: 'SatyaMool-Lineage',
    }).resolves({
      Item: mockLineageData,
    });

    // Mock trust score data
    ddbMock.on(GetCommand, {
      TableName: 'SatyaMool-TrustScores',
    }).resolves({
      Item: mockTrustScoreData,
    });

    // Mock documents query
    ddbMock.on(QueryCommand, {
      TableName: 'SatyaMool-Documents',
    }).resolves({
      Items: mockDocuments,
    });

    // Mock S3 put
    s3Mock.on(PutObjectCommand).resolves({});

    const event = createMockEvent('property-123', 'user-123', 'Standard_User');
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    
    const body = JSON.parse(result.body);
    expect(body.reportUrl).toBeDefined();
    expect(body.reportUrl).toContain('https://s3.amazonaws.com/presigned-url');
    expect(body.expiresIn).toBe(900); // 15 minutes
    expect(body.generatedAt).toBeDefined();
  });

  test('should return 401 if user is not authenticated', async () => {
    const event = createMockEvent('property-123');
    delete event.requestContext.authorizer;

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    
    const body = JSON.parse(result.body);
    expect(body.error).toBe('UNAUTHORIZED');
  });

  test('should return 400 if property ID is missing', async () => {
    const event = createMockEvent('property-123', 'user-123');
    event.pathParameters = null;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    
    const body = JSON.parse(result.body);
    expect(body.error).toBe('MISSING_PROPERTY_ID');
  });

  test('should return 404 if property not found', async () => {
    ddbMock.on(QueryCommand, {
      TableName: 'SatyaMool-Properties',
    }).resolves({
      Items: [],
    });

    const event = createMockEvent('property-123', 'user-123');
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    
    const body = JSON.parse(result.body);
    expect(body.error).toBe('PROPERTY_NOT_FOUND');
  });

  test('should return 403 if user does not own property and is not admin', async () => {
    ddbMock.on(QueryCommand, {
      TableName: 'SatyaMool-Properties',
    }).resolves({
      Items: [{ ...mockProperty, userId: 'other-user' }],
    });

    const event = createMockEvent('property-123', 'user-123', 'Standard_User');
    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    
    const body = JSON.parse(result.body);
    expect(body.error).toBe('FORBIDDEN');
  });

  test('should allow admin to generate report for any property', async () => {
    // Mock property query with different owner
    ddbMock.on(QueryCommand, {
      TableName: 'SatyaMool-Properties',
    }).resolves({
      Items: [{ ...mockProperty, userId: 'other-user' }],
    });

    // Mock lineage data
    ddbMock.on(GetCommand, {
      TableName: 'SatyaMool-Lineage',
    }).resolves({
      Item: mockLineageData,
    });

    // Mock trust score data
    ddbMock.on(GetCommand, {
      TableName: 'SatyaMool-TrustScores',
    }).resolves({
      Item: mockTrustScoreData,
    });

    // Mock documents query
    ddbMock.on(QueryCommand, {
      TableName: 'SatyaMool-Documents',
    }).resolves({
      Items: mockDocuments,
    });

    // Mock S3 put
    s3Mock.on(PutObjectCommand).resolves({});

    const event = createMockEvent('property-123', 'admin-user', 'Admin_User');
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
  });

  test('should return 400 if property processing is not complete', async () => {
    ddbMock.on(QueryCommand, {
      TableName: 'SatyaMool-Properties',
    }).resolves({
      Items: [{ ...mockProperty, status: 'processing' }],
    });

    const event = createMockEvent('property-123', 'user-123');
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    
    const body = JSON.parse(result.body);
    expect(body.error).toBe('PROCESSING_INCOMPLETE');
  });

  test('should return 404 if lineage data not found', async () => {
    ddbMock.on(QueryCommand, {
      TableName: 'SatyaMool-Properties',
    }).resolves({
      Items: [mockProperty],
    });

    // Mock lineage data as undefined
    ddbMock.on(GetCommand, {
      TableName: 'SatyaMool-Lineage',
      Key: { propertyId: 'property-123' },
    }).resolves({
      Item: undefined,
    });

    // Mock trust score data (should not be called)
    ddbMock.on(GetCommand, {
      TableName: 'SatyaMool-TrustScores',
    }).resolves({
      Item: mockTrustScoreData,
    });

    // Mock documents query (should not be called)
    ddbMock.on(QueryCommand, {
      TableName: 'SatyaMool-Documents',
    }).resolves({
      Items: mockDocuments,
    });

    const event = createMockEvent('property-123', 'user-123');
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    
    const body = JSON.parse(result.body);
    expect(body.error).toBe('LINEAGE_NOT_FOUND');
  });

  test('should return 404 if trust score data not found', async () => {
    ddbMock.on(QueryCommand, {
      TableName: 'SatyaMool-Properties',
    }).resolves({
      Items: [mockProperty],
    });

    // Mock lineage data
    ddbMock.on(GetCommand, {
      TableName: 'SatyaMool-Lineage',
      Key: { propertyId: 'property-123' },
    }).resolves({
      Item: mockLineageData,
    });

    // Mock trust score data as undefined
    ddbMock.on(GetCommand, {
      TableName: 'SatyaMool-TrustScores',
      Key: { propertyId: 'property-123' },
    }).resolves({
      Item: undefined,
    });

    // Mock documents query (should not be called)
    ddbMock.on(QueryCommand, {
      TableName: 'SatyaMool-Documents',
    }).resolves({
      Items: mockDocuments,
    });

    const event = createMockEvent('property-123', 'user-123');
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    
    const body = JSON.parse(result.body);
    expect(body.error).toBe('TRUST_SCORE_NOT_FOUND');
  });

  test('should handle PDF generation with minimal data', async () => {
    const minimalProperty = {
      propertyId: 'property-123',
      userId: 'user-123',
      status: 'completed',
    };

    const minimalLineage = {
      propertyId: 'property-123',
      nodes: [],
      edges: [],
      gaps: [],
    };

    const minimalTrustScore = {
      propertyId: 'property-123',
      totalScore: 50,
      calculatedAt: '2024-01-15T00:00:00Z',
      scoreBreakdown: {
        components: [],
      },
      factors: [],
    };

    ddbMock.on(QueryCommand, {
      TableName: 'SatyaMool-Properties',
    }).resolves({
      Items: [minimalProperty],
    });

    ddbMock.on(GetCommand, {
      TableName: 'SatyaMool-Lineage',
    }).resolves({
      Item: minimalLineage,
    });

    ddbMock.on(GetCommand, {
      TableName: 'SatyaMool-TrustScores',
    }).resolves({
      Item: minimalTrustScore,
    });

    ddbMock.on(QueryCommand, {
      TableName: 'SatyaMool-Documents',
    }).resolves({
      Items: [],
    });

    s3Mock.on(PutObjectCommand).resolves({});

    const event = createMockEvent('property-123', 'user-123');
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
  });
});
