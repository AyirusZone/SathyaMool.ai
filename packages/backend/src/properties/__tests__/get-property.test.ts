import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import * as fc from 'fast-check';
import { handler, mapToPipelineProgress, derivePropertyStatus, PipelineStepStatus, PipelineProgress } from '../get-property';

const ddbMock = mockClient(DynamoDBDocumentClient);

const VALID_STEP_STATUSES: PipelineStepStatus[] = ['pending', 'in_progress', 'complete', 'failed'];
const PIPELINE_KEYS: (keyof PipelineProgress)[] = ['upload', 'ocr', 'translation', 'analysis', 'lineage', 'scoring'];

const KNOWN_STATUSES = [
  'pending', 'ocr_processing', 'ocr_complete', 'ocr_failed',
  'translation_processing', 'translation_complete', 'translation_failed',
  'analysis_processing', 'analysis_complete', 'analysis_failed',
  'lineage_complete', 'lineage_failed', 'scoring_complete', 'scoring_failed',
];

describe('Get Property Lambda', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.PROPERTIES_TABLE_NAME = 'SatyaMool-Properties';
    process.env.DOCUMENTS_TABLE_NAME = 'SatyaMool-Documents';
    process.env.AWS_REGION = 'us-east-1';
  });

  const createMockEvent = (
    propertyId: string,
    userId?: string,
    userRole?: string
  ): APIGatewayProxyEvent => ({
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: `/v1/properties/${propertyId}`,
    pathParameters: propertyId ? { propertyId } : null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      authorizer: userId
        ? { userId, role: userRole || 'Standard_User' }
        : {},
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
      identity: {
        accessKey: null, accountId: null, apiKey: null, apiKeyId: null,
        caller: null, clientCert: null, cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null, cognitoIdentityId: null,
        cognitoIdentityPoolId: null, principalOrgId: null,
        sourceIp: '127.0.0.1', user: null, userAgent: 'test-agent', userArn: null,
      },
      path: `/v1/properties/${propertyId}`,
      stage: 'test',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test-resource',
      resourcePath: '/v1/properties/{propertyId}',
    },
    resource: '/v1/properties/{propertyId}',
  } as APIGatewayProxyEvent);

  const mockProperty = {
    propertyId: 'prop-123',
    userId: 'user-123',
    address: '123 Main Street, Bangalore',
    surveyNumber: 'SY-123/456',
    description: 'Residential property',
    status: 'processing',
    trustScore: null,
    documentCount: 3,
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T12:00:00.000Z',
  };

  const mockDocuments = [
    { documentId: 'doc-1', propertyId: 'prop-123', fileName: 'doc1.pdf', fileSize: 1024, processingStatus: 'analysis_complete', uploadedAt: '2026-03-01T10:00:00.000Z' },
    { documentId: 'doc-2', propertyId: 'prop-123', fileName: 'doc2.pdf', fileSize: 2048, processingStatus: 'translation_complete', uploadedAt: '2026-03-01T10:05:00.000Z' },
    { documentId: 'doc-3', propertyId: 'prop-123', fileName: 'doc3.pdf', fileSize: 512, processingStatus: 'ocr_complete', uploadedAt: '2026-03-01T10:10:00.000Z' },
  ];

  // ─── Unit tests ───────────────────────────────────────────────────────────

  describe('mapToPipelineProgress — known statuses', () => {
    const table: Array<[string, PipelineProgress]> = [
      ['pending',                { upload: 'complete', ocr: 'pending',     translation: 'pending',     analysis: 'pending',     lineage: 'pending',  scoring: 'pending'  }],
      ['ocr_processing',         { upload: 'complete', ocr: 'in_progress', translation: 'pending',     analysis: 'pending',     lineage: 'pending',  scoring: 'pending'  }],
      ['ocr_complete',           { upload: 'complete', ocr: 'complete',    translation: 'pending',     analysis: 'pending',     lineage: 'pending',  scoring: 'pending'  }],
      ['ocr_failed',             { upload: 'complete', ocr: 'failed',      translation: 'pending',     analysis: 'pending',     lineage: 'pending',  scoring: 'pending'  }],
      ['translation_processing', { upload: 'complete', ocr: 'complete',    translation: 'in_progress', analysis: 'pending',     lineage: 'pending',  scoring: 'pending'  }],
      ['translation_complete',   { upload: 'complete', ocr: 'complete',    translation: 'complete',    analysis: 'pending',     lineage: 'pending',  scoring: 'pending'  }],
      ['translation_failed',     { upload: 'complete', ocr: 'complete',    translation: 'failed',      analysis: 'pending',     lineage: 'pending',  scoring: 'pending'  }],
      ['analysis_processing',    { upload: 'complete', ocr: 'complete',    translation: 'complete',    analysis: 'in_progress', lineage: 'pending',  scoring: 'pending'  }],
      ['analysis_complete',      { upload: 'complete', ocr: 'complete',    translation: 'complete',    analysis: 'complete',    lineage: 'pending',  scoring: 'pending'  }],
      ['analysis_failed',        { upload: 'complete', ocr: 'complete',    translation: 'complete',    analysis: 'failed',      lineage: 'pending',  scoring: 'pending'  }],
      ['lineage_complete',       { upload: 'complete', ocr: 'complete',    translation: 'complete',    analysis: 'complete',    lineage: 'complete', scoring: 'pending'  }],
      ['lineage_failed',         { upload: 'complete', ocr: 'complete',    translation: 'complete',    analysis: 'complete',    lineage: 'failed',   scoring: 'pending'  }],
      ['scoring_complete',       { upload: 'complete', ocr: 'complete',    translation: 'complete',    analysis: 'complete',    lineage: 'complete', scoring: 'complete' }],
      ['scoring_failed',         { upload: 'complete', ocr: 'complete',    translation: 'complete',    analysis: 'complete',    lineage: 'complete', scoring: 'failed'   }],
    ];

    test.each(table)('maps %s correctly', (status, expected) => {
      expect(mapToPipelineProgress(status)).toEqual(expected);
    });

    it('defaults unknown status to all-pending', () => {
      expect(mapToPipelineProgress('unknown_status')).toEqual({
        upload: 'pending', ocr: 'pending', translation: 'pending',
        analysis: 'pending', lineage: 'pending', scoring: 'pending',
      });
    });
  });

  describe('derivePropertyStatus', () => {
    it('returns pending for empty documents array', () => {
      expect(derivePropertyStatus([])).toBe('pending');
    });

    it('returns completed when all docs are scoring_complete', () => {
      const docs = [
        { processingStatus: 'scoring_complete' },
        { processingStatus: 'scoring_complete' },
      ];
      expect(derivePropertyStatus(docs)).toBe('completed');
    });

    it('returns failed when any doc has _failed and none are in-progress', () => {
      const docs = [
        { processingStatus: 'ocr_failed' },
        { processingStatus: 'ocr_complete' },
      ];
      expect(derivePropertyStatus(docs)).toBe('failed');
    });

    it('returns processing when a doc is in-progress even if another failed', () => {
      const docs = [
        { processingStatus: 'ocr_failed' },
        { processingStatus: 'ocr_processing' },
      ];
      expect(derivePropertyStatus(docs)).toBe('processing');
    });

    it('returns processing for mixed non-terminal statuses', () => {
      const docs = [
        { processingStatus: 'ocr_complete' },
        { processingStatus: 'translation_complete' },
      ];
      expect(derivePropertyStatus(docs)).toBe('processing');
    });
  });

  describe('Handler — successful retrieval', () => {
    it('returns 200 with documents array and pipelineProgress for owner', async () => {
      ddbMock
        .on(GetCommand).resolves({ Item: mockProperty })
        .on(QueryCommand).resolves({ Items: mockDocuments });

      const result = await handler(createMockEvent('prop-123', 'user-123'));
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.propertyId).toBe('prop-123');
      expect(Array.isArray(body.documents)).toBe(true);
      expect(body.documents).toHaveLength(3);
      expect(body.documents[0]).toHaveProperty('pipelineProgress');
      expect(body.documents[0].pipelineProgress).toHaveProperty('upload');
    });

    it('returns 200 for admin accessing another user property', async () => {
      ddbMock
        .on(GetCommand).resolves({ Item: mockProperty })
        .on(QueryCommand).resolves({ Items: mockDocuments });

      const result = await handler(createMockEvent('prop-123', 'admin-456', 'Admin_User'));
      expect(result.statusCode).toBe(200);
    });

    it('derives status from documents (not stored status)', async () => {
      const allComplete = [
        { documentId: 'doc-1', processingStatus: 'scoring_complete', uploadedAt: '2026-03-01T10:00:00.000Z' },
        { documentId: 'doc-2', processingStatus: 'scoring_complete', uploadedAt: '2026-03-01T10:05:00.000Z' },
      ];
      ddbMock
        .on(GetCommand).resolves({ Item: { ...mockProperty, status: 'processing' } })
        .on(QueryCommand).resolves({ Items: allComplete });

      const result = await handler(createMockEvent('prop-123', 'user-123'));
      const body = JSON.parse(result.body);
      expect(body.status).toBe('completed');
    });

    it('returns documentCount defaulting to 0 when absent from record', async () => {
      const propWithoutCount = { ...mockProperty };
      delete (propWithoutCount as any).documentCount;
      ddbMock
        .on(GetCommand).resolves({ Item: propWithoutCount })
        .on(QueryCommand).resolves({ Items: [] });

      const result = await handler(createMockEvent('prop-123', 'user-123'));
      const body = JSON.parse(result.body);
      expect(body.documentCount).toBe(0);
    });

    it('returns empty documents array and pending status when no documents', async () => {
      ddbMock
        .on(GetCommand).resolves({ Item: mockProperty })
        .on(QueryCommand).resolves({ Items: [] });

      const result = await handler(createMockEvent('prop-123', 'user-123'));
      const body = JSON.parse(result.body);
      expect(body.documents).toEqual([]);
      expect(body.status).toBe('pending');
    });
  });

  describe('Handler — authorization', () => {
    it('returns 401 when no userId in authorizer', async () => {
      const result = await handler(createMockEvent('prop-123'));
      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).error).toBe('UNAUTHORIZED');
    });

    it('returns 403 when user does not own property and is not admin', async () => {
      ddbMock.on(GetCommand).resolves({ Item: mockProperty });
      const result = await handler(createMockEvent('prop-123', 'other-user'));
      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).error).toBe('FORBIDDEN');
    });
  });

  describe('Handler — validation', () => {
    it('returns 400 when propertyId is missing', async () => {
      const event = createMockEvent('', 'user-123');
      event.pathParameters = null;
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('MISSING_PROPERTY_ID');
    });

    it('returns 404 when property does not exist', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });
      const result = await handler(createMockEvent('nonexistent', 'user-123'));
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).error).toBe('PROPERTY_NOT_FOUND');
    });
  });

  describe('Handler — error handling', () => {
    it('returns 500 on DynamoDB error', async () => {
      ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'));
      const result = await handler(createMockEvent('prop-123', 'user-123'));
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBe('INTERNAL_ERROR');
    });
  });
});

// ─── Property-Based Tests ──────────────────────────────────────────────────

describe('Property 2: pipelineProgress is always structurally complete', () => {
  // Feature: document-pipeline-status, Property 2: pipelineProgress is always structurally complete
  // Validates: Requirements 2.1, 7.1, 7.2
  it('any string input returns object with all 6 keys, each a valid PipelineStepStatus', () => {
    fc.assert(
      fc.property(fc.string(), (status) => {
        const result = mapToPipelineProgress(status);
        // Must have exactly the 6 required keys
        expect(Object.keys(result).sort()).toEqual(PIPELINE_KEYS.slice().sort());
        // Each value must be a valid PipelineStepStatus
        for (const key of PIPELINE_KEYS) {
          expect(VALID_STEP_STATUSES).toContain(result[key]);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('known statuses always produce structurally complete objects', () => {
    for (const status of KNOWN_STATUSES) {
      const result = mapToPipelineProgress(status);
      expect(Object.keys(result).sort()).toEqual(PIPELINE_KEYS.slice().sort());
      for (const key of PIPELINE_KEYS) {
        expect(VALID_STEP_STATUSES).toContain(result[key]);
      }
    }
  });
});

describe('Property 3: processingStatus → pipelineProgress mapping is deterministic and idempotent', () => {
  // Feature: document-pipeline-status, Property 3: processingStatus → pipelineProgress mapping is deterministic and idempotent
  // Validates: Requirements 2.2–2.9, 7.4
  it('same input always produces same output (deterministic)', () => {
    fc.assert(
      fc.property(fc.string(), (status) => {
        const first = mapToPipelineProgress(status);
        const second = mapToPipelineProgress(status);
        expect(first).toEqual(second);
      }),
      { numRuns: 200 }
    );
  });

  it('applying mapping twice yields same result (idempotent on known statuses)', () => {
    for (const status of KNOWN_STATUSES) {
      const first = mapToPipelineProgress(status);
      const second = mapToPipelineProgress(status);
      expect(first).toEqual(second);
    }
  });

  it('unknown/arbitrary strings are deterministic', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !KNOWN_STATUSES.includes(s)),
        (status) => {
          const first = mapToPipelineProgress(status);
          const second = mapToPipelineProgress(status);
          expect(first).toEqual(second);
          // Unknown statuses must default to all-pending
          for (const key of PIPELINE_KEYS) {
            expect(first[key]).toBe('pending');
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe('Property 8: derivePropertyStatus is correct', () => {
  // Feature: document-pipeline-status, Property 8: property status is derived from document states
  // Validates: Requirements 4.1, 4.2, 4.3, 4.4
  const arbProcessingStatus = fc.oneof(
    ...KNOWN_STATUSES.map((s) => fc.constant(s)),
    fc.string()
  );

  it('returns completed iff all documents are scoring_complete', () => {
    fc.assert(
      fc.property(fc.array(fc.constant({ processingStatus: 'scoring_complete' }), { minLength: 1 }), (docs) => {
        expect(derivePropertyStatus(docs)).toBe('completed');
      }),
      { numRuns: 100 }
    );
  });

  it('returns failed when any doc has _failed status and none are in-progress', () => {
    const failedStatuses = ['ocr_failed', 'translation_failed', 'analysis_failed', 'lineage_failed', 'scoring_failed'];
    const nonInProgressStatuses = KNOWN_STATUSES.filter(
      (s) => !['ocr_processing', 'translation_processing', 'analysis_processing'].includes(s)
    );

    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...nonInProgressStatuses), { minLength: 1 }).chain((statuses) => {
          // Ensure at least one is a _failed status
          const withFailed = [...statuses, fc.sample(fc.constantFrom(...failedStatuses), 1)[0]];
          return fc.constant(withFailed.map((s) => ({ processingStatus: s })));
        }),
        (docs) => {
          const result = derivePropertyStatus(docs);
          expect(result).toBe('failed');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns processing when any doc is in-progress (even if others failed)', () => {
    const inProgressStatuses = ['ocr_processing', 'translation_processing', 'analysis_processing'];
    fc.assert(
      fc.property(
        fc.array(arbProcessingStatus, { minLength: 0 }).chain((statuses) => {
          const withInProgress = [...statuses, fc.sample(fc.constantFrom(...inProgressStatuses), 1)[0]];
          return fc.constant(withInProgress.map((s) => ({ processingStatus: s })));
        }),
        (docs) => {
          expect(derivePropertyStatus(docs)).toBe('processing');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns pending for empty array', () => {
    expect(derivePropertyStatus([])).toBe('pending');
  });

  it('returns processing for docs with no failures and not all scoring_complete', () => {
    const nonTerminalStatuses = ['pending', 'ocr_complete', 'translation_complete', 'analysis_complete', 'lineage_complete'];
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...nonTerminalStatuses), { minLength: 1 }),
        (statuses) => {
          const docs = statuses.map((s) => ({ processingStatus: s }));
          expect(derivePropertyStatus(docs)).toBe('processing');
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 9: missing documentCount defaults to zero', () => {
  // Feature: document-pipeline-status, Property 9: missing documentCount defaults to zero
  // Validates: Requirements 1.4, 5.4
  const ddbMockP9 = mockClient(DynamoDBDocumentClient);

  beforeEach(() => {
    ddbMockP9.reset();
    process.env.PROPERTIES_TABLE_NAME = 'SatyaMool-Properties';
    process.env.DOCUMENTS_TABLE_NAME = 'SatyaMool-Documents';
  });

  it('response always has a numeric documentCount (0 when absent from record)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
        async (documentCount) => {
          ddbMock.reset();
          const propRecord: any = {
            propertyId: 'prop-pbt',
            userId: 'user-pbt',
            status: 'processing',
            trustScore: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          };
          if (documentCount !== undefined) {
            propRecord.documentCount = documentCount;
          }

          ddbMock
            .on(GetCommand).resolves({ Item: propRecord })
            .on(QueryCommand).resolves({ Items: [] });

          const event: APIGatewayProxyEvent = {
            body: null,
            headers: {},
            multiValueHeaders: {},
            httpMethod: 'GET',
            isBase64Encoded: false,
            path: '/v1/properties/prop-pbt',
            pathParameters: { propertyId: 'prop-pbt' },
            queryStringParameters: null,
            multiValueQueryStringParameters: null,
            stageVariables: null,
            requestContext: {
              accountId: '123456789012',
              apiId: 'test-api',
              authorizer: { userId: 'user-pbt', role: 'Standard_User' },
              protocol: 'HTTP/1.1',
              httpMethod: 'GET',
              identity: {
                accessKey: null, accountId: null, apiKey: null, apiKeyId: null,
                caller: null, clientCert: null, cognitoAuthenticationProvider: null,
                cognitoAuthenticationType: null, cognitoIdentityId: null,
                cognitoIdentityPoolId: null, principalOrgId: null,
                sourceIp: '127.0.0.1', user: null, userAgent: 'test', userArn: null,
              },
              path: '/v1/properties/prop-pbt',
              stage: 'test',
              requestId: 'req-pbt',
              requestTimeEpoch: Date.now(),
              resourceId: 'res-pbt',
              resourcePath: '/v1/properties/{propertyId}',
            },
            resource: '/v1/properties/{propertyId}',
          } as APIGatewayProxyEvent;

          const result = await handler(event);
          const body = JSON.parse(result.body);
          expect(typeof body.documentCount).toBe('number');
          expect(body.documentCount).toBeGreaterThanOrEqual(0);
          if (documentCount === undefined) {
            expect(body.documentCount).toBe(0);
          } else {
            expect(body.documentCount).toBe(documentCount);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
