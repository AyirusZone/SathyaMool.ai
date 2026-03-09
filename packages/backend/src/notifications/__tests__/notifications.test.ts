import { handler } from '../index';
import { handler as getNotificationsHandler, markAsReadHandler } from '../get-notifications';
import { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ddbMock = mockClient(DynamoDBDocumentClient);
const sesMock = mockClient(SESClient);

describe('Notification Lambda Handler', () => {
  beforeEach(() => {
    ddbMock.reset();
    sesMock.reset();
    process.env.USERS_TABLE_NAME = 'SatyaMool-Users';
    process.env.PROPERTIES_TABLE_NAME = 'SatyaMool-Properties';
    process.env.NOTIFICATIONS_TABLE_NAME = 'SatyaMool-Notifications';
    process.env.FROM_EMAIL = 'noreply@satyamool.com';
    process.env.FRONTEND_URL = 'https://app.satyamool.com';
  });

  describe('Property Completion Notification', () => {
    it('should send completion email when property status changes to completed', async () => {
      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventName: 'MODIFY',
            dynamodb: {
              NewImage: {
                propertyId: { S: 'prop-123' },
                userId: { S: 'user-123' },
                address: { S: '123 Main St, Bangalore' },
                status: { S: 'completed' },
                trustScore: { N: '85' },
              },
              OldImage: {
                propertyId: { S: 'prop-123' },
                userId: { S: 'user-123' },
                address: { S: '123 Main St, Bangalore' },
                status: { S: 'processing' },
              },
            },
          } as DynamoDBRecord,
        ],
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'Standard_User',
        },
      });

      ddbMock.on(PutCommand).resolves({});
      sesMock.on(SendEmailCommand).resolves({});

      await handler(event);

      // Verify SES was called with correct parameters
      const sesCalls = sesMock.commandCalls(SendEmailCommand);
      expect(sesCalls.length).toBe(1);
      expect(sesCalls[0].args[0].input.Destination?.ToAddresses).toContain('test@example.com');
      expect(sesCalls[0].args[0].input.Message?.Subject?.Data).toContain('Complete');
      expect(sesCalls[0].args[0].input.Message?.Body?.Html?.Data).toContain('Trust Score: 85/100');

      // Verify notification was stored
      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBe(1);
      expect(putCalls[0].args[0].input.Item?.userId).toBe('user-123');
      expect(putCalls[0].args[0].input.Item?.type).toBe('completion');
    });

    it('should handle completion notification without trust score', async () => {
      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventName: 'MODIFY',
            dynamodb: {
              NewImage: {
                propertyId: { S: 'prop-123' },
                userId: { S: 'user-123' },
                address: { S: '123 Main St, Bangalore' },
                status: { S: 'completed' },
              },
              OldImage: {
                propertyId: { S: 'prop-123' },
                userId: { S: 'user-123' },
                address: { S: '123 Main St, Bangalore' },
                status: { S: 'processing' },
              },
            },
          } as DynamoDBRecord,
        ],
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'Standard_User',
        },
      });

      ddbMock.on(PutCommand).resolves({});
      sesMock.on(SendEmailCommand).resolves({});

      await handler(event);

      const sesCalls = sesMock.commandCalls(SendEmailCommand);
      expect(sesCalls.length).toBe(1);
      expect(sesCalls[0].args[0].input.Message?.Body?.Html?.Data).toContain('Calculating');
    });
  });

  describe('Property Failure Notification', () => {
    it('should send failure email when property status changes to failed', async () => {
      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventName: 'MODIFY',
            dynamodb: {
              NewImage: {
                propertyId: { S: 'prop-123' },
                userId: { S: 'user-123' },
                address: { S: '123 Main St, Bangalore' },
                status: { S: 'failed' },
              },
              OldImage: {
                propertyId: { S: 'prop-123' },
                userId: { S: 'user-123' },
                address: { S: '123 Main St, Bangalore' },
                status: { S: 'processing' },
              },
            },
          } as DynamoDBRecord,
        ],
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'Standard_User',
        },
      });

      ddbMock.on(PutCommand).resolves({});
      sesMock.on(SendEmailCommand).resolves({});

      await handler(event);

      const sesCalls = sesMock.commandCalls(SendEmailCommand);
      expect(sesCalls.length).toBe(1);
      expect(sesCalls[0].args[0].input.Message?.Subject?.Data).toContain('Failed');
      expect(sesCalls[0].args[0].input.Message?.Body?.Html?.Data).toContain('Suggested Actions');
    });
  });

  describe('OCR Quality Warning Notification', () => {
    it('should send quality warning when OCR confidence is below 70%', async () => {
      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventName: 'MODIFY',
            dynamodb: {
              NewImage: {
                documentId: { S: 'doc-123' },
                propertyId: { S: 'prop-123' },
                processingStatus: { S: 'ocr_complete' },
                ocrConfidence: { N: '65' },
              },
              OldImage: {
                documentId: { S: 'doc-123' },
                propertyId: { S: 'prop-123' },
                processingStatus: { S: 'pending' },
              },
            },
          } as DynamoDBRecord,
        ],
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'Standard_User',
        },
      });

      // First GetCommand for property, second for user
      ddbMock.on(GetCommand, {
        TableName: 'SatyaMool-Properties',
      }).resolves({
        Item: {
          propertyId: 'prop-123',
          userId: 'user-123',
          address: '123 Main St, Bangalore',
          status: 'processing',
        },
      });

      ddbMock.on(PutCommand).resolves({});
      sesMock.on(SendEmailCommand).resolves({});

      await handler(event);

      const sesCalls = sesMock.commandCalls(SendEmailCommand);
      expect(sesCalls.length).toBe(1);
      expect(sesCalls[0].args[0].input.Message?.Subject?.Data).toContain('Quality Warning');
      expect(sesCalls[0].args[0].input.Message?.Body?.Html?.Data).toContain('OCR confidence');
      expect(sesCalls[0].args[0].input.Message?.Body?.Html?.Data).toContain('below 70%');
    });

    it('should not send quality warning when OCR confidence is above 70%', async () => {
      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventName: 'MODIFY',
            dynamodb: {
              NewImage: {
                documentId: { S: 'doc-123' },
                propertyId: { S: 'prop-123' },
                processingStatus: { S: 'ocr_complete' },
                ocrConfidence: { N: '85' },
              },
              OldImage: {
                documentId: { S: 'doc-123' },
                propertyId: { S: 'prop-123' },
                processingStatus: { S: 'pending' },
              },
            },
          } as DynamoDBRecord,
        ],
      };

      await handler(event);

      const sesCalls = sesMock.commandCalls(SendEmailCommand);
      expect(sesCalls.length).toBe(0);
    });
  });

  describe('Translation Failure Notification', () => {
    it('should send notification when translation fails', async () => {
      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventName: 'MODIFY',
            dynamodb: {
              NewImage: {
                documentId: { S: 'doc-123' },
                propertyId: { S: 'prop-123' },
                processingStatus: { S: 'translation_failed' },
              },
              OldImage: {
                documentId: { S: 'doc-123' },
                propertyId: { S: 'prop-123' },
                processingStatus: { S: 'ocr_complete' },
              },
            },
          } as DynamoDBRecord,
        ],
      };

      ddbMock.on(GetCommand, {
        TableName: 'SatyaMool-Properties',
      }).resolves({
        Item: {
          propertyId: 'prop-123',
          userId: 'user-123',
          address: '123 Main St, Bangalore',
          status: 'processing',
        },
      });

      ddbMock.on(GetCommand, {
        TableName: 'SatyaMool-Users',
      }).resolves({
        Item: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'Standard_User',
        },
      });

      ddbMock.on(PutCommand).resolves({});
      sesMock.on(SendEmailCommand).resolves({});

      await handler(event);

      const sesCalls = sesMock.commandCalls(SendEmailCommand);
      expect(sesCalls.length).toBe(1);
      expect(sesCalls[0].args[0].input.Message?.Subject?.Data).toContain('Translation Failed');
    });
  });

  describe('Document Processing Failure Notification', () => {
    it('should send notification when document processing fails', async () => {
      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventName: 'MODIFY',
            dynamodb: {
              NewImage: {
                documentId: { S: 'doc-123' },
                propertyId: { S: 'prop-123' },
                processingStatus: { S: 'failed' },
                errorMessage: { S: 'Invalid file format' },
              },
              OldImage: {
                documentId: { S: 'doc-123' },
                propertyId: { S: 'prop-123' },
                processingStatus: { S: 'pending' },
              },
            },
          } as DynamoDBRecord,
        ],
      };

      ddbMock.on(GetCommand, {
        TableName: 'SatyaMool-Properties',
      }).resolves({
        Item: {
          propertyId: 'prop-123',
          userId: 'user-123',
          address: '123 Main St, Bangalore',
          status: 'processing',
        },
      });

      ddbMock.on(GetCommand, {
        TableName: 'SatyaMool-Users',
      }).resolves({
        Item: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'Standard_User',
        },
      });

      ddbMock.on(PutCommand).resolves({});
      sesMock.on(SendEmailCommand).resolves({});

      await handler(event);

      const sesCalls = sesMock.commandCalls(SendEmailCommand);
      expect(sesCalls.length).toBe(1);
      expect(sesCalls[0].args[0].input.Message?.Subject?.Data).toContain('Document Processing Failed');
      expect(sesCalls[0].args[0].input.Message?.Body?.Html?.Data).toContain('Invalid file format');
    });
  });

  describe('Error Handling', () => {
    it('should continue processing other records if one fails', async () => {
      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventName: 'MODIFY',
            dynamodb: {
              NewImage: {
                propertyId: { S: 'prop-123' },
                userId: { S: 'user-123' },
                address: { S: '123 Main St' },
                status: { S: 'completed' },
              },
              OldImage: {
                propertyId: { S: 'prop-123' },
                userId: { S: 'user-123' },
                address: { S: '123 Main St' },
                status: { S: 'processing' },
              },
            },
          } as DynamoDBRecord,
          {
            eventName: 'MODIFY',
            dynamodb: {
              NewImage: {
                propertyId: { S: 'prop-456' },
                userId: { S: 'user-456' },
                address: { S: '456 Oak Ave' },
                status: { S: 'completed' },
              },
              OldImage: {
                propertyId: { S: 'prop-456' },
                userId: { S: 'user-456' },
                address: { S: '456 Oak Ave' },
                status: { S: 'processing' },
              },
            },
          } as DynamoDBRecord,
        ],
      };

      // First user lookup fails, second succeeds
      ddbMock.on(GetCommand).rejectsOnce(new Error('DynamoDB error'))
        .resolves({
          Item: {
            userId: 'user-456',
            email: 'test2@example.com',
            role: 'Standard_User',
          },
        });

      ddbMock.on(PutCommand).resolves({});
      sesMock.on(SendEmailCommand).resolves({});

      await handler(event);

      // Should still send email for second record
      const sesCalls = sesMock.commandCalls(SendEmailCommand);
      expect(sesCalls.length).toBe(1);
      expect(sesCalls[0].args[0].input.Destination?.ToAddresses).toContain('test2@example.com');
    });

    it('should handle missing user gracefully', async () => {
      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventName: 'MODIFY',
            dynamodb: {
              NewImage: {
                propertyId: { S: 'prop-123' },
                userId: { S: 'user-123' },
                address: { S: '123 Main St' },
                status: { S: 'completed' },
              },
              OldImage: {
                propertyId: { S: 'prop-123' },
                userId: { S: 'user-123' },
                address: { S: '123 Main St' },
                status: { S: 'processing' },
              },
            },
          } as DynamoDBRecord,
        ],
      };

      ddbMock.on(GetCommand).resolves({ Item: undefined });

      await handler(event);

      // Should not send email if user not found
      const sesCalls = sesMock.commandCalls(SendEmailCommand);
      expect(sesCalls.length).toBe(0);
    });
  });
});

describe('Get Notifications Handler', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.NOTIFICATIONS_TABLE_NAME = 'SatyaMool-Notifications';
  });

  it('should return notifications for authenticated user', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
          },
        },
      },
      queryStringParameters: null,
    } as any as APIGatewayProxyEvent;

    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          notificationId: 'notif-1',
          userId: 'user-123',
          propertyId: 'prop-123',
          type: 'completion',
          subject: 'Property Verification Complete',
          message: 'Your property verification is complete',
          read: false,
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          notificationId: 'notif-2',
          userId: 'user-123',
          propertyId: 'prop-456',
          type: 'quality_warning',
          subject: 'Document Quality Warning',
          message: 'Low OCR confidence detected',
          read: true,
          createdAt: '2024-01-02T00:00:00Z',
        },
      ],
    });

    const result = await getNotificationsHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.notifications).toHaveLength(2);
    expect(body.unreadCount).toBe(1);
    expect(body.total).toBe(2);
  });

  it('should filter for unread notifications only', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
          },
        },
      },
      queryStringParameters: {
        unreadOnly: 'true',
      },
    } as any as APIGatewayProxyEvent;

    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          notificationId: 'notif-1',
          userId: 'user-123',
          read: false,
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          notificationId: 'notif-2',
          userId: 'user-123',
          read: true,
          createdAt: '2024-01-02T00:00:00Z',
        },
      ],
    });

    const result = await getNotificationsHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].notificationId).toBe('notif-1');
  });

  it('should respect limit parameter', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
          },
        },
      },
      queryStringParameters: {
        limit: '10',
      },
    } as any as APIGatewayProxyEvent;

    ddbMock.on(QueryCommand).resolves({ Items: [] });

    await getNotificationsHandler(event);

    const queryCalls = ddbMock.commandCalls(QueryCommand);
    expect(queryCalls[0].args[0].input.Limit).toBe(10);
  });

  it('should return 401 if user not authenticated', async () => {
    const event = {
      requestContext: {
        authorizer: {},
      },
      queryStringParameters: null,
    } as any as APIGatewayProxyEvent;

    const result = await getNotificationsHandler(event);

    expect(result.statusCode).toBe(401);
  });
});

describe('Mark Notification as Read Handler', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.NOTIFICATIONS_TABLE_NAME = 'SatyaMool-Notifications';
  });

  it('should mark notification as read', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
          },
        },
      },
      pathParameters: {
        notificationId: 'notif-123',
      },
    } as any as APIGatewayProxyEvent;

    ddbMock.on(UpdateCommand).resolves({
      Attributes: {
        notificationId: 'notif-123',
        userId: 'user-123',
        read: true,
        updatedAt: '2024-01-01T00:00:00Z',
      },
    });

    const result = await markAsReadHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.notification.read).toBe(true);
  });

  it('should return 404 if notification not found', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
          },
        },
      },
      pathParameters: {
        notificationId: 'notif-123',
      },
    } as any as APIGatewayProxyEvent;

    const error = new Error('ConditionalCheckFailedException');
    error.name = 'ConditionalCheckFailedException';
    ddbMock.on(UpdateCommand).rejects(error);

    const result = await markAsReadHandler(event);

    expect(result.statusCode).toBe(404);
  });

  it('should return 400 if notificationId missing', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
          },
        },
      },
      pathParameters: {},
    } as any as APIGatewayProxyEvent;

    const result = await markAsReadHandler(event);

    expect(result.statusCode).toBe(400);
  });
});
