import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../get-lineage';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Get Lineage Lambda', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.PROPERTIES_TABLE_NAME = 'SatyaMool-Properties';
    process.env.LINEAGE_TABLE_NAME = 'SatyaMool-Lineage';
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
      path: `/v1/properties/${propertyId}/lineage`,
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
        path: `/v1/properties/${propertyId}/lineage`,
        stage: 'test',
        requestId: 'test-request-id',
        requestTimeEpoch: Date.now(),
        resourceId: 'test-resource',
        resourcePath: '/v1/properties/{id}/lineage',
      },
      resource: '/v1/properties/{id}/lineage',
    } as APIGatewayProxyEvent;
  };

  const mockProperty = {
    propertyId: 'prop-123',
    userId: 'user-123',
    address: '123 Main Street, Bangalore',
    surveyNumber: 'SY-123/456',
    status: 'lineage_complete',
    trustScore: 85,
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T12:00:00.000Z',
  };

  const mockLineageData = {
    propertyId: 'prop-123',
    nodes: [
      {
        id: 'node-1',
        name: 'John Doe',
        type: 'owner',
        date: '2000-01-15',
        documentId: 'doc-1',
        isGap: false,
        hasWarning: false,
        position: { x: 0, y: 0 },
      },
      {
        id: 'node-2',
        name: 'Jane Smith',
        type: 'owner',
        date: '2010-05-20',
        documentId: 'doc-2',
        isGap: false,
        hasWarning: false,
        position: { x: 200, y: 0 },
      },
      {
        id: 'node-3',
        name: 'Bob Johnson',
        type: 'owner',
        date: '2020-08-10',
        documentId: 'doc-3',
        isGap: false,
        hasWarning: false,
        position: { x: 400, y: 0 },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        type: 'transfer',
        transferType: 'sale',
        date: '2010-05-20',
        documentId: 'doc-2',
        saleConsideration: '₹50,00,000',
      },
      {
        id: 'edge-2',
        source: 'node-2',
        target: 'node-3',
        type: 'transfer',
        transferType: 'sale',
        date: '2020-08-10',
        documentId: 'doc-3',
        saleConsideration: '₹1,20,00,000',
      },
    ],
    motherDeed: {
      documentId: 'doc-1',
      ownerId: 'node-1',
      date: '2000-01-15',
    },
    gaps: [],
    ownershipPaths: [['node-1', 'node-2', 'node-3']],
    circularPatterns: [],
    metadata: {
      node_count: 3,
      edge_count: 2,
      gap_count: 0,
      path_count: 1,
      has_circular_ownership: false,
    },
    createdAt: '2026-03-01T12:00:00.000Z',
    updatedAt: '2026-03-01T12:00:00.000Z',
  };

  const mockDocuments = [
    {
      documentId: 'doc-1',
      propertyId: 'prop-123',
      documentType: 'Mother Deed',
      uploadedAt: '2026-03-01T10:00:00.000Z',
      s3Key: 'documents/doc-1.pdf',
      confidence: 95,
    },
    {
      documentId: 'doc-2',
      propertyId: 'prop-123',
      documentType: 'Sale Deed',
      uploadedAt: '2026-03-01T10:05:00.000Z',
      s3Key: 'documents/doc-2.pdf',
      confidence: 92,
    },
    {
      documentId: 'doc-3',
      propertyId: 'prop-123',
      documentType: 'Sale Deed',
      uploadedAt: '2026-03-01T10:10:00.000Z',
      s3Key: 'documents/doc-3.pdf',
      confidence: 88,
    },
  ];

  describe('Successful lineage retrieval', () => {
    it('should retrieve and transform lineage graph for owner', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(GetCommand, {
          TableName: 'SatyaMool-Lineage',
        })
        .resolves({
          Item: mockLineageData,
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
      
      // Verify React Flow format
      expect(body.nodes).toBeDefined();
      expect(body.edges).toBeDefined();
      expect(body.metadata).toBeDefined();
      
      // Verify nodes transformation
      expect(body.nodes).toHaveLength(3);
      expect(body.nodes[0]).toMatchObject({
        id: 'node-1',
        type: 'owner',
        data: {
          label: 'John Doe',
          name: 'John Doe',
          date: '2000-01-15',
          verificationStatus: 'verified',
          documentId: 'doc-1',
        },
      });
      
      // Verify edges transformation
      expect(body.edges).toHaveLength(2);
      expect(body.edges[0]).toMatchObject({
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        data: {
          transferType: 'sale',
          date: '2010-05-20',
          documentId: 'doc-2',
          saleConsideration: '₹50,00,000',
        },
      });
      
      // Verify metadata
      expect(body.metadata).toMatchObject({
        nodeCount: 3,
        edgeCount: 2,
        gapCount: 0,
      });
    });

    it('should retrieve lineage graph for admin user', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(GetCommand, {
          TableName: 'SatyaMool-Lineage',
        })
        .resolves({
          Item: mockLineageData,
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
      expect(body.nodes).toHaveLength(3);
    });

    it('should include document metadata in nodes', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(GetCommand, {
          TableName: 'SatyaMool-Lineage',
        })
        .resolves({
          Item: mockLineageData,
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
      
      const node = body.nodes[0];
      expect(node.data.metadata.documentType).toBe('Mother Deed');
      expect(node.data.metadata.confidence).toBe(95);
    });

    it('should handle gaps in ownership chain', async () => {
      const lineageWithGaps = {
        ...mockLineageData,
        nodes: [
          ...mockLineageData.nodes,
          {
            id: 'gap-1',
            name: 'Unknown Owner',
            type: 'gap',
            isGap: true,
            hasWarning: false,
            position: { x: 300, y: 0 },
          },
        ],
        gaps: [{ id: 'gap-1', reason: 'Missing documentation' }],
        metadata: {
          ...mockLineageData.metadata,
          gap_count: 1,
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
          TableName: 'SatyaMool-Lineage',
        })
        .resolves({
          Item: lineageWithGaps,
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
      
      expect(body.metadata.gapCount).toBe(1);
      const gapNode = body.nodes.find((n: any) => n.id === 'gap-1');
      expect(gapNode.data.verificationStatus).toBe('gap');
    });

    it('should handle warnings in nodes', async () => {
      const lineageWithWarnings = {
        ...mockLineageData,
        nodes: [
          {
            ...mockLineageData.nodes[0],
            hasWarning: true,
            lowConfidence: true,
          },
          ...mockLineageData.nodes.slice(1),
        ],
      };

      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(GetCommand, {
          TableName: 'SatyaMool-Lineage',
        })
        .resolves({
          Item: lineageWithWarnings,
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
      
      const warningNode = body.nodes[0];
      expect(warningNode.data.verificationStatus).toBe('warning');
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

    it('should return 404 if lineage graph not yet constructed', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(GetCommand, {
          TableName: 'SatyaMool-Lineage',
        })
        .resolves({
          Item: undefined,
        });

      const event = createMockEvent('prop-123', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('LINEAGE_NOT_FOUND');
      expect(body.message).toContain('not yet constructed');
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
