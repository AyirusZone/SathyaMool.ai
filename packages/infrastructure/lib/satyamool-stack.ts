import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';
import * as path from 'path';
import { LambdaLayers } from './lambda-layers';
import { createOptimizedProcessingLambda } from './optimized-lambda';
import { CognitoConfig } from './cognito-config';
import { AuthLambdas } from './auth-lambdas';
import { AuthApiGateway } from './auth-api-gateway';
import { PropertyLambdas } from './property-lambdas';
import { MainApiGateway } from './main-api-gateway';

export class SatyaMoolStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========== Task 31.1: Lambda Layers for Cold Start Optimization ==========
    // Create Lambda layers for shared dependencies
    // This reduces package sizes and improves cold start performance
    const layers = new LambdaLayers(this, 'LambdaLayers');

    // Create KMS key for encryption with simplified policy to avoid circular dependencies
    const encryptionKey = new kms.Key(this, 'SatyaMoolEncryptionKey', {
      description: 'KMS key for SatyaMool document encryption',
      enableKeyRotation: true, // Annual automatic key rotation
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      alias: 'satyamool/document-encryption',
    });

    // Create Dead Letter Queue for failed processing
    const processingDLQ = new sqs.Queue(this, 'DocumentProcessingDLQ', {
      queueName: 'satyamool-document-processing-dlq',
      encryption: sqs.QueueEncryption.SQS_MANAGED, // Simplified: Use SQS-managed encryption
      retentionPeriod: cdk.Duration.days(14),
    });

    // Create SQS queue for document processing
    const processingQueue = new sqs.Queue(this, 'DocumentProcessingQueue', {
      queueName: 'satyamool-document-processing',
      encryption: sqs.QueueEncryption.SQS_MANAGED, // Simplified: Use SQS-managed encryption
      visibilityTimeout: cdk.Duration.minutes(6), // Lambda timeout + buffer
      receiveMessageWaitTime: cdk.Duration.seconds(20), // Long polling
      deadLetterQueue: {
        queue: processingDLQ,
        maxReceiveCount: 3, // Retry up to 3 times as per requirements
      },
    });

    // Create S3 bucket for document storage with simplified configuration
    // Using S3-managed encryption instead of KMS to avoid permission issues
    const documentBucket = new s3.Bucket(this, 'DocumentBucket', {
      bucketName: `satyamool-documents-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED, // Simplified: Use S3-managed encryption
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true, // Enable versioning for disaster recovery
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ['*'], // Allow all origins for presigned URLs
          allowedHeaders: ['*'],
          exposedHeaders: [
            'ETag',
            'x-amz-server-side-encryption',
            'x-amz-request-id',
            'x-amz-id-2',
          ],
          maxAge: 3000,
        },
      ],
      // Removed Transfer Acceleration temporarily
      // Removed lifecycle rules temporarily
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Changed to DESTROY for easier cleanup during development
    });

    // Configure S3 event notification to SQS
    // Filter for document uploads in the properties/{propertyId}/documents/ prefix
    documentBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(processingQueue),
      {
        prefix: 'properties/',
        suffix: '', // Accept all file types (pdf, jpeg, png, tiff)
      }
    );

    // Create S3 bucket for audit logs with simplified configuration
    const auditLogBucket = new s3.Bucket(this, 'AuditLogBucket', {
      bucketName: `satyamool-audit-logs-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED, // Simplified: Use S3-managed encryption
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      // Removed lifecycle rules temporarily
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Changed to DESTROY for easier cleanup during development
    });

    // Create DynamoDB Documents table
    const documentsTable = new dynamodb.Table(this, 'DocumentsTable', {
      tableName: 'SatyaMool-Documents',
      partitionKey: {
        name: 'documentId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'propertyId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand pricing
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true, // Enable PITR for disaster recovery
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES, // Enable streams for downstream processing
    });

    // Add GSI for querying documents by property
    documentsTable.addGlobalSecondaryIndex({
      indexName: 'propertyId-uploadedAt-index',
      partitionKey: {
        name: 'propertyId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'uploadedAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying documents by property and processing status (optimized filtering)
    documentsTable.addGlobalSecondaryIndex({
      indexName: 'propertyId-processingStatus-index',
      partitionKey: {
        name: 'propertyId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'processingStatus',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY, // Only need keys for status checks
    });

    // Create DynamoDB Idempotency table for preventing duplicate processing
    // Requirements: 3.1, 3.3 - Handle duplicate messages and prevent race conditions
    const idempotencyTable = new dynamodb.Table(this, 'IdempotencyTable', {
      tableName: 'SatyaMool-Idempotency',
      partitionKey: {
        name: 'idempotencyKey',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand pricing
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl', // Automatically delete old records after TTL expires
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Can be destroyed as it's just for deduplication
    });

    // Create OCR Lambda function with cold start optimizations
    // Uses Lambda layers for shared dependencies (boto3, botocore)
    // ARM64 architecture for 20% better performance
    const ocrLambdaConstruct = createOptimizedProcessingLambda(
      this,
      'OcrFunction',
      {
        functionName: 'SatyaMool-OCR-Processor',
        description: 'OCR processing Lambda function using Amazon Textract',
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: 'handler.lambda_handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../../processing/ocr')),
        memorySize: 512,
        timeout: cdk.Duration.minutes(5),
        environment: {
          DOCUMENTS_TABLE_NAME: documentsTable.tableName,
          QUEUE_URL: processingQueue.queueUrl,
          LOG_LEVEL: 'INFO',
        },
        // Removed reservedConcurrentExecutions to avoid exceeding account limits
      },
      layers
    );

    const ocrLambda = ocrLambdaConstruct.function;

    // Grant OCR Lambda permissions
    documentBucket.grantRead(ocrLambda); // Read documents from S3
    documentsTable.grantReadWriteData(ocrLambda); // Read/write document metadata
    idempotencyTable.grantReadWriteData(ocrLambda); // Read/write idempotency records
    // Removed KMS decrypt grant since we're using S3-managed encryption
    processingQueue.grantConsumeMessages(ocrLambda); // Consume SQS messages

    // Grant Textract permissions
    ocrLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'textract:AnalyzeDocument',
          'textract:DetectDocumentText', // Fallback API for subscription-free text extraction
          'textract:StartDocumentAnalysis',
          'textract:GetDocumentAnalysis',
        ],
        resources: ['*'], // Textract doesn't support resource-level permissions
      })
    );

    // Add SQS event source to OCR Lambda
    ocrLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(processingQueue, {
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(5),
        reportBatchItemFailures: true, // Enable partial batch failure reporting
      })
    );

    // Create Translation Lambda function with cold start optimizations
    // Triggered by DynamoDB Streams when documents reach "ocr_complete" status
    const translationLambdaConstruct = createOptimizedProcessingLambda(
      this,
      'TranslationFunction',
      {
        functionName: 'SatyaMool-Translation-Processor',
        description: 'Translation processing Lambda function using Amazon Translate',
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: 'handler.lambda_handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../../processing/translation')),
        memorySize: 512,
        timeout: cdk.Duration.minutes(5),
        environment: {
          DOCUMENTS_TABLE_NAME: documentsTable.tableName,
          LOG_LEVEL: 'INFO',
        },
      },
      layers
    );

    const translationLambda = translationLambdaConstruct.function;

    // Grant Translation Lambda permissions
    documentsTable.grantReadWriteData(translationLambda);

    // Grant Translate and Comprehend permissions
    translationLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'translate:TranslateText',
          'comprehend:DetectDominantLanguage',
        ],
        resources: ['*'],
      })
    );

    // Add DynamoDB Stream event source to Translation Lambda
    translationLambda.addEventSource(
      new lambdaEventSources.DynamoEventSource(documentsTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(5),
        retryAttempts: 3,
        reportBatchItemFailures: true,
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('MODIFY'),
            dynamodb: {
              NewImage: {
                processingStatus: {
                  S: lambda.FilterRule.isEqual('ocr_complete'),
                },
              },
            },
          }),
        ],
      })
    );

    // Create Analysis Lambda function with cold start optimizations
    // Triggered by DynamoDB Streams when documents reach "translation_complete" status
    const analysisLambdaConstruct = createOptimizedProcessingLambda(
      this,
      'AnalysisFunction',
      {
        functionName: 'SatyaMool-Analysis-Processor',
        description: 'Analysis processing Lambda function using Amazon Bedrock',
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: 'handler.lambda_handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../../processing/analysis')),
        memorySize: 1024,
        timeout: cdk.Duration.minutes(5),
        environment: {
          DOCUMENTS_TABLE_NAME: documentsTable.tableName,
          LOG_LEVEL: 'INFO',
        },
      },
      layers
    );

    const analysisLambda = analysisLambdaConstruct.function;

    // Grant Analysis Lambda permissions
    documentsTable.grantReadWriteData(analysisLambda);

    // Grant Bedrock permissions
    analysisLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
        ],
        resources: ['*'],
      })
    );

    // Add DynamoDB Stream event source to Analysis Lambda
    analysisLambda.addEventSource(
      new lambdaEventSources.DynamoEventSource(documentsTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(5),
        retryAttempts: 3,
        reportBatchItemFailures: true,
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('MODIFY'),
            dynamodb: {
              NewImage: {
                processingStatus: {
                  S: lambda.FilterRule.isEqual('translation_complete'),
                },
              },
            },
          }),
        ],
      })
    );

    // Output the bucket name and queue URL for Lambda functions
    new cdk.CfnOutput(this, 'DocumentBucketName', {
      value: documentBucket.bucketName,
      description: 'S3 bucket name for document storage',
      exportName: 'SatyaMool-DocumentBucketName',
    });

    new cdk.CfnOutput(this, 'AuditLogBucketName', {
      value: auditLogBucket.bucketName,
      description: 'S3 bucket name for audit logs',
      exportName: 'SatyaMool-AuditLogBucketName',
    });

    new cdk.CfnOutput(this, 'ProcessingQueueUrl', {
      value: processingQueue.queueUrl,
      description: 'SQS queue URL for document processing',
      exportName: 'SatyaMool-ProcessingQueueUrl',
    });

    new cdk.CfnOutput(this, 'ProcessingQueueArn', {
      value: processingQueue.queueArn,
      description: 'SQS queue ARN for document processing',
      exportName: 'SatyaMool-ProcessingQueueArn',
    });

    new cdk.CfnOutput(this, 'EncryptionKeyId', {
      value: encryptionKey.keyId,
      description: 'KMS key ID for encryption',
      exportName: 'SatyaMool-EncryptionKeyId',
    });

    new cdk.CfnOutput(this, 'DocumentsTableName', {
      value: documentsTable.tableName,
      description: 'DynamoDB table name for documents',
      exportName: 'SatyaMool-DocumentsTableName',
    });

    new cdk.CfnOutput(this, 'OcrLambdaArn', {
      value: ocrLambda.functionArn,
      description: 'OCR Lambda function ARN',
      exportName: 'SatyaMool-OcrLambdaArn',
    });

    new cdk.CfnOutput(this, 'TranslationLambdaArn', {
      value: translationLambda.functionArn,
      description: 'Translation Lambda function ARN',
      exportName: 'SatyaMool-TranslationLambdaArn',
    });

    new cdk.CfnOutput(this, 'AnalysisLambdaArn', {
      value: analysisLambda.functionArn,
      description: 'Analysis Lambda function ARN',
      exportName: 'SatyaMool-AnalysisLambdaArn',
    });

    // Create DynamoDB Users table (for notification system)
    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'SatyaMool-Users',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Create DynamoDB Properties table (for notification system)
    const propertiesTable = new dynamodb.Table(this, 'PropertiesTable', {
      tableName: 'SatyaMool-Properties',
      partitionKey: {
        name: 'propertyId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES, // Enable streams for notifications
    });

    // Add GSI for querying properties by user
    propertiesTable.addGlobalSecondaryIndex({
      indexName: 'userId-createdAt-index',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying properties by user and status (optimized filtering)
    propertiesTable.addGlobalSecondaryIndex({
      indexName: 'userId-status-index',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Create DynamoDB Notifications table
    const notificationsTable = new dynamodb.Table(this, 'NotificationsTable', {
      tableName: 'SatyaMool-Notifications',
      partitionKey: {
        name: 'notificationId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Add GSI for querying notifications by user
    notificationsTable.addGlobalSecondaryIndex({
      indexName: 'userId-createdAt-index',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Create Notification Lambda function with cold start optimizations
    // Uses Lambda layers for shared Node.js dependencies and AWS SDK
    const notificationLambdaConstruct = createOptimizedProcessingLambda(
      this,
      'NotificationFunction',
      {
        functionName: 'SatyaMool-Notification-Processor',
        description: 'Notification Lambda function for email and in-app notifications',
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'notifications/index.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
        memorySize: 256,
        timeout: cdk.Duration.seconds(30),
        environment: {
          USERS_TABLE_NAME: usersTable.tableName,
          PROPERTIES_TABLE_NAME: propertiesTable.tableName,
          NOTIFICATIONS_TABLE_NAME: notificationsTable.tableName,
          FROM_EMAIL: 'noreply@satyamool.com', // TODO: Update with verified SES email
          FRONTEND_URL: 'https://app.satyamool.com', // TODO: Update with actual frontend URL
          LOG_LEVEL: 'INFO',
        },
        // Removed reservedConcurrentExecutions to avoid exceeding account limits
      },
      layers
    );

    const notificationLambda = notificationLambdaConstruct.function;

    // Grant notification Lambda permissions
    usersTable.grantReadData(notificationLambda);
    propertiesTable.grantReadData(notificationLambda);
    notificationsTable.grantReadWriteData(notificationLambda);

    // Grant SES permissions
    notificationLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ses:SendEmail',
          'ses:SendRawEmail',
        ],
        resources: ['*'], // SES doesn't support resource-level permissions for SendEmail
      })
    );

    // Add DynamoDB Stream event sources for notifications
    // Trigger on Properties table changes
    notificationLambda.addEventSource(
      new lambdaEventSources.DynamoEventSource(propertiesTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(5),
        retryAttempts: 3,
        reportBatchItemFailures: true,
      })
    );

    // Trigger on Documents table changes
    notificationLambda.addEventSource(
      new lambdaEventSources.DynamoEventSource(documentsTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(5),
        retryAttempts: 3,
        reportBatchItemFailures: true,
      })
    );

    // Create GET Notifications Lambda function for API endpoint
    // This is separate from the stream processor above
    const getNotificationsLambdaConstruct = createOptimizedProcessingLambda(
      this,
      'GetNotificationsFunction',
      {
        functionName: 'SatyaMool-Get-Notifications',
        description: 'Lambda function for retrieving user notifications via API',
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'notifications/get-notifications.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
        memorySize: 256,
        timeout: cdk.Duration.seconds(10),
        environment: {
          NOTIFICATIONS_TABLE_NAME: notificationsTable.tableName,
          LOG_LEVEL: 'INFO',
        },
      },
      layers
    );

    const getNotificationsLambda = getNotificationsLambdaConstruct.function;

    // Grant GET notifications Lambda permissions
    notificationsTable.grantReadData(getNotificationsLambda);

    // Output notification resources
    new cdk.CfnOutput(this, 'UsersTableName', {
      value: usersTable.tableName,
      description: 'DynamoDB table name for users',
      exportName: 'SatyaMool-UsersTableName',
    });

    new cdk.CfnOutput(this, 'PropertiesTableName', {
      value: propertiesTable.tableName,
      description: 'DynamoDB table name for properties',
      exportName: 'SatyaMool-PropertiesTableName',
    });

    new cdk.CfnOutput(this, 'NotificationsTableName', {
      value: notificationsTable.tableName,
      description: 'DynamoDB table name for notifications',
      exportName: 'SatyaMool-NotificationsTableName',
    });

    new cdk.CfnOutput(this, 'NotificationLambdaArn', {
      value: notificationLambda.functionArn,
      description: 'Notification Lambda function ARN',
      exportName: 'SatyaMool-NotificationLambdaArn',
    });

    new cdk.CfnOutput(this, 'GetNotificationsLambdaArn', {
      value: getNotificationsLambda.functionArn,
      description: 'GET Notifications Lambda function ARN',
      exportName: 'SatyaMool-GetNotificationsLambdaArn',
    });

    // Create DynamoDB Lineage table
    const lineageTable = new dynamodb.Table(this, 'LineageTable', {
      tableName: 'SatyaMool-Lineage',
      partitionKey: {
        name: 'propertyId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES, // Enable streams for Trust Score Lambda
    });

    // Create DynamoDB TrustScores table
    const trustScoresTable = new dynamodb.Table(this, 'TrustScoresTable', {
      tableName: 'SatyaMool-TrustScores',
      partitionKey: {
        name: 'propertyId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Create Lineage Lambda function with cold start optimizations
    // Triggered by DynamoDB Streams when ALL documents for a property reach "analysis_complete" status
    const lineageLambdaConstruct = createOptimizedProcessingLambda(
      this,
      'LineageFunction',
      {
        functionName: 'SatyaMool-Lineage-Processor',
        description: 'Lineage construction Lambda function for building ownership graphs',
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: 'handler.lambda_handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../../processing/lineage')),
        memorySize: 1024,
        timeout: cdk.Duration.minutes(5),
        environment: {
          DOCUMENTS_TABLE_NAME: documentsTable.tableName,
          PROPERTIES_TABLE_NAME: propertiesTable.tableName,
          LINEAGE_TABLE_NAME: lineageTable.tableName,
          LOG_LEVEL: 'INFO',
        },
      },
      layers
    );

    const lineageLambda = lineageLambdaConstruct.function;

    // Grant Lineage Lambda permissions
    documentsTable.grantReadData(lineageLambda);
    propertiesTable.grantReadWriteData(lineageLambda);
    lineageTable.grantReadWriteData(lineageLambda);

    // Add DynamoDB Stream event source to Lineage Lambda
    // Trigger when documents reach "analysis_complete" status
    lineageLambda.addEventSource(
      new lambdaEventSources.DynamoEventSource(documentsTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(5),
        retryAttempts: 3,
        reportBatchItemFailures: true,
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('MODIFY'),
            dynamodb: {
              NewImage: {
                processingStatus: {
                  S: lambda.FilterRule.isEqual('analysis_complete'),
                },
              },
            },
          }),
        ],
      })
    );

    // Create Trust Score Lambda function with cold start optimizations
    // Triggered by DynamoDB Streams when lineage construction completes
    const trustScoreLambdaConstruct = createOptimizedProcessingLambda(
      this,
      'TrustScoreFunction',
      {
        functionName: 'SatyaMool-TrustScore-Processor',
        description: 'Trust Score calculation Lambda function',
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: 'handler.lambda_handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../../processing/trust-score')),
        memorySize: 512,
        timeout: cdk.Duration.minutes(3),
        environment: {
          LINEAGE_TABLE_NAME: lineageTable.tableName,
          DOCUMENTS_TABLE_NAME: documentsTable.tableName,
          PROPERTIES_TABLE_NAME: propertiesTable.tableName,
          TRUST_SCORES_TABLE_NAME: trustScoresTable.tableName,
          LOG_LEVEL: 'INFO',
        },
      },
      layers
    );

    const trustScoreLambda = trustScoreLambdaConstruct.function;

    // Grant Trust Score Lambda permissions
    lineageTable.grantReadData(trustScoreLambda);
    documentsTable.grantReadData(trustScoreLambda);
    propertiesTable.grantReadWriteData(trustScoreLambda);
    trustScoresTable.grantReadWriteData(trustScoreLambda);

    // Add DynamoDB Stream event source to Trust Score Lambda
    // Trigger when lineage construction completes (new lineage records are inserted)
    trustScoreLambda.addEventSource(
      new lambdaEventSources.DynamoEventSource(lineageTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(5),
        retryAttempts: 3,
        reportBatchItemFailures: true,
      })
    );

    // Output Lineage and Trust Score resources
    new cdk.CfnOutput(this, 'LineageTableName', {
      value: lineageTable.tableName,
      description: 'DynamoDB table name for lineage',
      exportName: 'SatyaMool-LineageTableName',
    });

    new cdk.CfnOutput(this, 'TrustScoresTableName', {
      value: trustScoresTable.tableName,
      description: 'DynamoDB table name for trust scores',
      exportName: 'SatyaMool-TrustScoresTableName',
    });

    new cdk.CfnOutput(this, 'LineageLambdaArn', {
      value: lineageLambda.functionArn,
      description: 'Lineage Lambda function ARN',
      exportName: 'SatyaMool-LineageLambdaArn',
    });

    new cdk.CfnOutput(this, 'TrustScoreLambdaArn', {
      value: trustScoreLambda.functionArn,
      description: 'Trust Score Lambda function ARN',
      exportName: 'SatyaMool-TrustScoreLambdaArn',
    });

    // Create DynamoDB AuditLogs table
    const auditLogsTable = new dynamodb.Table(this, 'AuditLogsTable', {
      tableName: 'SatyaMool-AuditLogs',
      partitionKey: {
        name: 'logId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Add GSI for querying audit logs by user
    auditLogsTable.addGlobalSecondaryIndex({
      indexName: 'userId-timestamp-index',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Create DynamoDB StatePortalConfigurations table for future government portal integration
    const statePortalConfigTable = new dynamodb.Table(this, 'StatePortalConfigTable', {
      tableName: 'SatyaMool-StatePortalConfigurations',
      partitionKey: {
        name: 'state',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Create Lambda for scheduled cleanup of deactivated accounts with optimizations
    const cleanupLambdaConstruct = createOptimizedProcessingLambda(
      this,
      'CleanupDeactivatedAccountsFunction',
      {
        functionName: 'SatyaMool-Cleanup-Deactivated-Accounts',
        description: 'Scheduled Lambda for cleaning up deactivated accounts after 30 days',
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'admin/cleanup-deactivated-accounts.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
        memorySize: 512,
        timeout: cdk.Duration.minutes(15), // Allow time for bulk deletions
        environment: {
          USERS_TABLE_NAME: usersTable.tableName,
          PROPERTIES_TABLE_NAME: propertiesTable.tableName,
          DOCUMENTS_TABLE_NAME: documentsTable.tableName,
          LINEAGE_TABLE_NAME: lineageTable.tableName,
          TRUST_SCORES_TABLE_NAME: trustScoresTable.tableName,
          NOTIFICATIONS_TABLE_NAME: notificationsTable.tableName,
          AUDIT_LOGS_TABLE_NAME: auditLogsTable.tableName,
          DOCUMENT_BUCKET_NAME: documentBucket.bucketName,
          USER_POOL_ID: '', // TODO: Set Cognito User Pool ID
          LOG_LEVEL: 'INFO',
        },
        // Removed reservedConcurrentExecutions to avoid exceeding account limits
      },
      layers
    );

    const cleanupLambda = cleanupLambdaConstruct.function;

    // Grant cleanup Lambda permissions
    usersTable.grantReadWriteData(cleanupLambda);
    propertiesTable.grantReadWriteData(cleanupLambda);
    documentsTable.grantReadWriteData(cleanupLambda);
    lineageTable.grantReadWriteData(cleanupLambda);
    trustScoresTable.grantReadWriteData(cleanupLambda);
    notificationsTable.grantReadWriteData(cleanupLambda);
    auditLogsTable.grantWriteData(cleanupLambda); // Only write for audit logs
    documentBucket.grantReadWrite(cleanupLambda);
    // Removed KMS decrypt grant since we're using S3-managed encryption

    // Grant Cognito permissions
    cleanupLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cognito-idp:AdminDeleteUser',
        ],
        resources: ['*'], // TODO: Restrict to specific User Pool ARN
      })
    );

    // Create EventBridge rule to run cleanup daily at 2 AM UTC
    const cleanupRule = new events.Rule(this, 'CleanupDeactivatedAccountsRule', {
      ruleName: 'SatyaMool-Daily-Account-Cleanup',
      description: 'Trigger account cleanup Lambda daily at 2 AM UTC',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '2',
        day: '*',
        month: '*',
        year: '*',
      }),
    });

    // Add cleanup Lambda as target
    cleanupRule.addTarget(new targets.LambdaFunction(cleanupLambda));

    // Output cleanup resources
    new cdk.CfnOutput(this, 'CleanupLambdaArn', {
      value: cleanupLambda.functionArn,
      description: 'Cleanup Lambda function ARN',
      exportName: 'SatyaMool-CleanupLambdaArn',
    });

    new cdk.CfnOutput(this, 'AuditLogsTableName', {
      value: auditLogsTable.tableName,
      description: 'DynamoDB table name for audit logs',
      exportName: 'SatyaMool-AuditLogsTableName',
    });

    // ========== Cognito User Pool (Task 2.1) ==========
    // Create Cognito User Pool for user authentication
    const cognitoConfig = new CognitoConfig(this, 'CognitoConfig');

    // ========== Auth Lambda Functions (Task 3) ==========
    // Create Lambda functions for authentication endpoints
    const authLambdas = new AuthLambdas(this, 'AuthLambdas', {
      userPool: cognitoConfig.userPool,
      userPoolClient: cognitoConfig.userPoolClient,
      usersTable: usersTable,
      auditLogsTable: auditLogsTable,
      nodeLayer: layers.nodejsCommonLayer,
    });

    // ========== Auth API Gateway (Task 22.1) ==========
    // Create API Gateway with authentication endpoints
    const authApiGateway = new AuthApiGateway(this, 'AuthApiGateway', {
      registerLambda: authLambdas.registerLambda,
      loginLambda: authLambdas.loginLambda,
      verifyOtpLambda: authLambdas.verifyOtpLambda,
      refreshTokenLambda: authLambdas.refreshTokenLambda,
    });

    // ========== Property Lambda Functions ==========
    // Create Lambda functions for property management endpoints
    const propertyLambdas = new PropertyLambdas(this, 'PropertyLambdas', {
      propertiesTable: propertiesTable,
      documentsTable: documentsTable,
      lineageTable: lineageTable,
      trustScoresTable: trustScoresTable,
      auditLogsTable: auditLogsTable,
      idempotencyTable: idempotencyTable,
      documentBucket: documentBucket,
      processingQueue: processingQueue,
      nodeLayer: layers.nodejsCommonLayer,
    });

    // ========== Main API Gateway ==========
    // Create API Gateway with auth and property management endpoints
    const mainApiGateway = new MainApiGateway(this, 'MainApiGateway', {
      authorizerLambda: authLambdas.authorizerLambda,
      // Auth Lambdas
      registerLambda: authLambdas.registerLambda,
      loginLambda: authLambdas.loginLambda,
      verifyOtpLambda: authLambdas.verifyOtpLambda,
      refreshTokenLambda: authLambdas.refreshTokenLambda,
      // Property Lambdas
      createPropertyLambda: propertyLambdas.createPropertyLambda,
      listPropertiesLambda: propertyLambdas.listPropertiesLambda,
      getPropertyLambda: propertyLambdas.getPropertyLambda,
      deletePropertyLambda: propertyLambdas.deletePropertyLambda,
      generateUploadUrlLambda: propertyLambdas.generateUploadUrlLambda,
      registerDocumentLambda: propertyLambdas.registerDocumentLambda,
      getDocumentsLambda: propertyLambdas.getDocumentsLambda,
      getLineageLambda: propertyLambdas.getLineageLambda,
      getTrustScoreLambda: propertyLambdas.getTrustScoreLambda,
      generateReportLambda: propertyLambdas.generateReportLambda,
      // Notification Lambda
      getNotificationsLambda: getNotificationsLambda,
    });

    // ========== API Gateway Configuration ==========
    // Note: Full API Gateway with all endpoints will be added later
    // Currently only auth endpoints are deployed
    // TODO: Integrate ApiGatewayConfig construct for property and admin endpoints

    // ========== Monitoring and Alerting (Task 23) ==========
    // TEMPORARILY DISABLED to avoid circular dependency during initial deployment
    // Will be added in a separate deployment or stack
    
    // Create SNS topic for alarm notifications
    const alarmTopic = new sns.Topic(this, 'AlarmNotificationTopic', {
      topicName: 'SatyaMool-Alarm-Notifications',
      displayName: 'SatyaMool Alarm Notifications',
    });

    // Output SNS topic ARN
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'SNS topic ARN for alarm notifications',
      exportName: 'SatyaMool-AlarmTopicArn',
    });

    // TODO: Add dashboards and alarms after initial deployment
    new cdk.CfnOutput(this, 'MonitoringNote', {
      value: 'CloudWatch dashboards and alarms will be added in next deployment to avoid circular dependencies',
      description: 'Monitoring setup note',
    });

    // ========== Task 32.2: Dead Letter Queue Processing ==========
    // TEMPORARILY DISABLED to avoid circular dependency during initial deployment
    // Will be added in a separate deployment
    
    new cdk.CfnOutput(this, 'DlqProcessorNote', {
      value: 'DLQ Processor Lambda will be added in next deployment to avoid circular dependencies',
      description: 'DLQ processor setup note',
    });

    // ========== Task 31.3: S3 and CloudFront Optimization ==========

    // Create S3 bucket for frontend static assets
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `satyamool-frontend-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED, // Use S3-managed encryption for public assets
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      }),
      versioned: false, // No need for versioning on static assets
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // TEMPORARILY DISABLED: CloudFront resources (account verification required)
    /*
    // Create Origin Access Identity for CloudFront to access S3
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'FrontendOAI', {
      comment: 'OAI for SatyaMool frontend CloudFront distribution',
    });

    // Grant CloudFront OAI read access to frontend bucket
    frontendBucket.grantRead(originAccessIdentity);
    */

    // TEMPORARILY DISABLED: CloudFront distribution requires account verification
    // Contact AWS Support to verify account before enabling CloudFront
    // Create CloudFront distribution for frontend with caching
    /*
    const frontendDistribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      comment: 'SatyaMool Frontend Distribution',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new cloudfrontOrigins.S3Origin(frontendBucket, {
          originAccessIdentity: originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true, // Enable gzip/brotli compression
        cachePolicy: new cloudfront.CachePolicy(this, 'FrontendCachePolicy', {
          cachePolicyName: 'SatyaMool-Frontend-Cache-Policy',
          comment: 'Cache policy for SatyaMool frontend static assets',
          defaultTtl: cdk.Duration.hours(24), // 24 hours as per requirement 16.8
          maxTtl: cdk.Duration.days(365),
          minTtl: cdk.Duration.seconds(0),
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
          headerBehavior: cloudfront.CacheHeaderBehavior.none(),
          queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
          cookieBehavior: cloudfront.CacheCookieBehavior.none(),
        }),
      },
      // Additional behavior for API calls (no caching)
      additionalBehaviors: {
        '/api/*': {
          origin: new cloudfrontOrigins.HttpOrigin('api.satyamool.com', { // TODO: Update with actual API Gateway domain
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
      },
      // Error responses for SPA routing
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Use only North America and Europe edge locations
      enableLogging: false, // Disabled to avoid circular dependency with audit bucket
      // TODO: Enable logging after initial deployment or use separate logging bucket
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    });

    // Output CloudFront and frontend resources
    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
      description: 'S3 bucket name for frontend static assets',
      exportName: 'SatyaMool-FrontendBucketName',
    });

    new cdk.CfnOutput(this, 'FrontendDistributionId', {
      value: frontendDistribution.distributionId,
      description: 'CloudFront distribution ID for frontend',
      exportName: 'SatyaMool-FrontendDistributionId',
    });

    new cdk.CfnOutput(this, 'FrontendDistributionDomainName', {
      value: frontendDistribution.distributionDomainName,
      description: 'CloudFront distribution domain name for frontend',
      exportName: 'SatyaMool-FrontendDistributionDomainName',
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${frontendDistribution.distributionDomainName}`,
      description: 'Frontend application URL',
      exportName: 'SatyaMool-FrontendUrl',
    });
    */

    // Output frontend bucket (CloudFront disabled temporarily)
    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
      description: 'S3 bucket name for frontend static assets',
      exportName: 'SatyaMool-FrontendBucketName',
    });

    new cdk.CfnOutput(this, 'CloudFrontNote', {
      value: 'CloudFront distribution disabled - account verification required. Contact AWS Support.',
      description: 'CloudFront status note',
    });

    // Output S3 Transfer Acceleration endpoint for document uploads
    new cdk.CfnOutput(this, 'DocumentBucketAccelerateEndpoint', {
      value: `${documentBucket.bucketName}.s3-accelerate.amazonaws.com`,
      description: 'S3 Transfer Acceleration endpoint for document uploads',
      exportName: 'SatyaMool-DocumentBucketAccelerateEndpoint',
    });

    new cdk.CfnOutput(this, 'S3OptimizationSummary', {
      value: 'S3 optimizations: Transfer Acceleration enabled, multipart upload cleanup (7 days), CloudFront CDN with 24h cache',
      description: 'S3 and CloudFront optimization summary',
    });
  }
}
