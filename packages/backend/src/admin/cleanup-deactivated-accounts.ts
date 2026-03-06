import { ScheduledEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, DeleteCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import {
  createAuditLog,
  AuditAction,
  ResourceType,
} from '../audit';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'SatyaMool-Users';
const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
const DOCUMENTS_TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'SatyaMool-Documents';
const LINEAGE_TABLE_NAME = process.env.LINEAGE_TABLE_NAME || 'SatyaMool-Lineage';
const TRUST_SCORES_TABLE_NAME = process.env.TRUST_SCORES_TABLE_NAME || 'SatyaMool-TrustScores';
const NOTIFICATIONS_TABLE_NAME = process.env.NOTIFICATIONS_TABLE_NAME || 'SatyaMool-Notifications';
const DOCUMENT_BUCKET_NAME = process.env.DOCUMENT_BUCKET_NAME || 'satyamool-documents';
const USER_POOL_ID = process.env.USER_POOL_ID || '';

const DEACTIVATION_RETENTION_DAYS = 30;

interface DeactivatedUser {
  userId: string;
  email?: string;
  phoneNumber?: string;
  status: string;
  deactivatedAt: string;
}

/**
 * Lambda handler for scheduled cleanup of deactivated accounts
 * Runs daily to delete user data 30 days after deactivation
 * Preserves audit logs for compliance
 */
export const handler = async (event: ScheduledEvent): Promise<void> => {
  console.log('Account cleanup job started:', JSON.stringify(event, null, 2));

  try {
    // Calculate cutoff date (30 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DEACTIVATION_RETENTION_DAYS);
    const cutoffTimestamp = cutoffDate.toISOString();

    console.log(`Looking for accounts deactivated before: ${cutoffTimestamp}`);

    // Scan Users table for deactivated accounts past retention period
    const scanCommand = new ScanCommand({
      TableName: USERS_TABLE_NAME,
      FilterExpression: '#status = :deactivated AND #deactivatedAt < :cutoff',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#deactivatedAt': 'deactivatedAt',
      },
      ExpressionAttributeValues: {
        ':deactivated': 'deactivated',
        ':cutoff': cutoffTimestamp,
      },
    });

    const scanResult = await docClient.send(scanCommand);
    const deactivatedUsers = (scanResult.Items || []) as DeactivatedUser[];

    console.log(`Found ${deactivatedUsers.length} accounts to clean up`);

    // Process each deactivated user
    for (const user of deactivatedUsers) {
      try {
        await cleanupUserData(user);
        console.log(`Successfully cleaned up user: ${user.userId}`);
      } catch (error) {
        console.error(`Failed to cleanup user ${user.userId}:`, error);
        // Continue with other users even if one fails
      }
    }

    console.log('Account cleanup job completed successfully');
  } catch (error) {
    console.error('Account cleanup job error:', error);
    throw error;
  }
};

/**
 * Clean up all data for a deactivated user
 */
async function cleanupUserData(user: DeactivatedUser): Promise<void> {
  console.log(`Cleaning up data for user: ${user.userId}`);

  // 1. Get all properties for the user
  const propertiesQuery = new QueryCommand({
    TableName: PROPERTIES_TABLE_NAME,
    IndexName: 'userId-createdAt-index',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': user.userId,
    },
  });

  const propertiesResult = await docClient.send(propertiesQuery);
  const properties = propertiesResult.Items || [];

  console.log(`Found ${properties.length} properties for user ${user.userId}`);

  // 2. Delete all property data
  for (const property of properties) {
    await deletePropertyData(property.propertyId);
  }

  // 3. Delete user notifications
  await deleteUserNotifications(user.userId);

  // 4. Delete user from Cognito
  if (USER_POOL_ID) {
    try {
      const deleteUserCommand = new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: user.userId,
      });
      await cognitoClient.send(deleteUserCommand);
      console.log(`Deleted Cognito user: ${user.userId}`);
    } catch (error: any) {
      // User might already be deleted from Cognito
      if (error.name !== 'UserNotFoundException') {
        console.error(`Failed to delete Cognito user ${user.userId}:`, error);
      }
    }
  }

  // 5. Delete user record from DynamoDB
  const deleteUserCommand = new DeleteCommand({
    TableName: USERS_TABLE_NAME,
    Key: {
      userId: user.userId,
    },
  });
  await docClient.send(deleteUserCommand);

  // 6. Create audit log for account deletion (audit logs are preserved)
  await createAuditLog({
    userId: user.userId,
    action: AuditAction.USER_DELETED,
    resourceType: ResourceType.USER,
    resourceId: user.userId,
    requestId: 'scheduled-cleanup',
    ipAddress: 'system',
    userAgent: 'scheduled-cleanup-lambda',
    metadata: {
      email: user.email,
      phoneNumber: user.phoneNumber,
      deactivatedAt: user.deactivatedAt,
      deletedAt: new Date().toISOString(),
      propertiesDeleted: properties.length,
    },
  });

  console.log(`User data cleanup completed for: ${user.userId}`);
}

/**
 * Delete all data for a property
 */
async function deletePropertyData(propertyId: string): Promise<void> {
  console.log(`Deleting property data: ${propertyId}`);

  // Get all documents for this property
  const documentsQuery = new QueryCommand({
    TableName: DOCUMENTS_TABLE_NAME,
    IndexName: 'propertyId-uploadedAt-index',
    KeyConditionExpression: 'propertyId = :propertyId',
    ExpressionAttributeValues: {
      ':propertyId': propertyId,
    },
  });

  const documentsResult = await docClient.send(documentsQuery);
  const documents = documentsResult.Items || [];

  // Delete documents from S3
  if (documents.length > 0) {
    const listCommand = new ListObjectsV2Command({
      Bucket: DOCUMENT_BUCKET_NAME,
      Prefix: `properties/${propertyId}/`,
    });

    const listResult = await s3Client.send(listCommand);

    if (listResult.Contents && listResult.Contents.length > 0) {
      const objectsToDelete = listResult.Contents.map(obj => ({ Key: obj.Key! }));

      // Delete objects in batches of 1000 (S3 limit)
      for (let i = 0; i < objectsToDelete.length; i += 1000) {
        const batch = objectsToDelete.slice(i, i + 1000);
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: DOCUMENT_BUCKET_NAME,
          Delete: {
            Objects: batch,
            Quiet: true,
          },
        });
        await s3Client.send(deleteCommand);
      }
    }

    // Delete document metadata from DynamoDB
    const deleteRequests = documents.map(doc => ({
      DeleteRequest: {
        Key: {
          documentId: doc.documentId,
          propertyId: doc.propertyId,
        },
      },
    }));

    // Batch delete in chunks of 25 (DynamoDB limit)
    for (let i = 0; i < deleteRequests.length; i += 25) {
      const batch = deleteRequests.slice(i, i + 25);
      const batchWriteCommand = new BatchWriteCommand({
        RequestItems: {
          [DOCUMENTS_TABLE_NAME]: batch,
        },
      });
      await docClient.send(batchWriteCommand);
    }
  }

  // Delete lineage data
  const deleteLineageCommand = new DeleteCommand({
    TableName: LINEAGE_TABLE_NAME,
    Key: {
      propertyId: propertyId,
    },
  });
  await docClient.send(deleteLineageCommand);

  // Delete trust score data
  const deleteTrustScoreCommand = new DeleteCommand({
    TableName: TRUST_SCORES_TABLE_NAME,
    Key: {
      propertyId: propertyId,
    },
  });
  await docClient.send(deleteTrustScoreCommand);

  // Delete property record
  // Note: We need to query first to get the userId (sort key)
  const propertyQuery = new QueryCommand({
    TableName: PROPERTIES_TABLE_NAME,
    KeyConditionExpression: 'propertyId = :propertyId',
    ExpressionAttributeValues: {
      ':propertyId': propertyId,
    },
    Limit: 1,
  });

  const propertyResult = await docClient.send(propertyQuery);
  if (propertyResult.Items && propertyResult.Items.length > 0) {
    const property = propertyResult.Items[0];
    const deletePropertyCommand = new DeleteCommand({
      TableName: PROPERTIES_TABLE_NAME,
      Key: {
        propertyId: propertyId,
        userId: property.userId,
      },
    });
    await docClient.send(deletePropertyCommand);
  }

  console.log(`Property data deleted: ${propertyId}`);
}

/**
 * Delete all notifications for a user
 */
async function deleteUserNotifications(userId: string): Promise<void> {
  console.log(`Deleting notifications for user: ${userId}`);

  const notificationsQuery = new QueryCommand({
    TableName: NOTIFICATIONS_TABLE_NAME,
    IndexName: 'userId-createdAt-index',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId,
    },
  });

  const notificationsResult = await docClient.send(notificationsQuery);
  const notifications = notificationsResult.Items || [];

  if (notifications.length > 0) {
    const deleteRequests = notifications.map(notification => ({
      DeleteRequest: {
        Key: {
          notificationId: notification.notificationId,
          userId: notification.userId,
        },
      },
    }));

    // Batch delete in chunks of 25 (DynamoDB limit)
    for (let i = 0; i < deleteRequests.length; i += 25) {
      const batch = deleteRequests.slice(i, i + 25);
      const batchWriteCommand = new BatchWriteCommand({
        RequestItems: {
          [NOTIFICATIONS_TABLE_NAME]: batch,
        },
      });
      await docClient.send(batchWriteCommand);
    }
  }

  console.log(`Deleted ${notifications.length} notifications for user ${userId}`);
}
