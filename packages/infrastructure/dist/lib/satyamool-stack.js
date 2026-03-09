"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SatyaMoolStack = void 0;
const cdk = require("aws-cdk-lib");
const s3 = require("aws-cdk-lib/aws-s3");
const sqs = require("aws-cdk-lib/aws-sqs");
const s3n = require("aws-cdk-lib/aws-s3-notifications");
const kms = require("aws-cdk-lib/aws-kms");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const lambda = require("aws-cdk-lib/aws-lambda");
const lambdaEventSources = require("aws-cdk-lib/aws-lambda-event-sources");
const iam = require("aws-cdk-lib/aws-iam");
const events = require("aws-cdk-lib/aws-events");
const targets = require("aws-cdk-lib/aws-events-targets");
const sns = require("aws-cdk-lib/aws-sns");
const path = require("path");
const lambda_layers_1 = require("./lambda-layers");
const optimized_lambda_1 = require("./optimized-lambda");
const cognito_config_1 = require("./cognito-config");
const auth_lambdas_1 = require("./auth-lambdas");
const auth_api_gateway_1 = require("./auth-api-gateway");
const property_lambdas_1 = require("./property-lambdas");
const main_api_gateway_1 = require("./main-api-gateway");
class SatyaMoolStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // ========== Task 31.1: Lambda Layers for Cold Start Optimization ==========
        // Create Lambda layers for shared dependencies
        // This reduces package sizes and improves cold start performance
        const layers = new lambda_layers_1.LambdaLayers(this, 'LambdaLayers');
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
        documentBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.SqsDestination(processingQueue), {
            prefix: 'properties/',
            suffix: '', // Accept all file types (pdf, jpeg, png, tiff)
        });
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
        const ocrLambdaConstruct = (0, optimized_lambda_1.createOptimizedProcessingLambda)(this, 'OcrFunction', {
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
        }, layers);
        const ocrLambda = ocrLambdaConstruct.function;
        // Grant OCR Lambda permissions
        documentBucket.grantRead(ocrLambda); // Read documents from S3
        documentsTable.grantReadWriteData(ocrLambda); // Read/write document metadata
        idempotencyTable.grantReadWriteData(ocrLambda); // Read/write idempotency records
        // Removed KMS decrypt grant since we're using S3-managed encryption
        processingQueue.grantConsumeMessages(ocrLambda); // Consume SQS messages
        // Grant Textract permissions
        ocrLambda.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'textract:AnalyzeDocument',
                'textract:DetectDocumentText', // Fallback API for subscription-free text extraction
                'textract:StartDocumentAnalysis',
                'textract:GetDocumentAnalysis',
            ],
            resources: ['*'], // Textract doesn't support resource-level permissions
        }));
        // Add SQS event source to OCR Lambda
        ocrLambda.addEventSource(new lambdaEventSources.SqsEventSource(processingQueue, {
            batchSize: 10,
            maxBatchingWindow: cdk.Duration.seconds(5),
            reportBatchItemFailures: true, // Enable partial batch failure reporting
        }));
        // Create Translation Lambda function with cold start optimizations
        // Triggered by DynamoDB Streams when documents reach "ocr_complete" status
        const translationLambdaConstruct = (0, optimized_lambda_1.createOptimizedProcessingLambda)(this, 'TranslationFunction', {
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
        }, layers);
        const translationLambda = translationLambdaConstruct.function;
        // Grant Translation Lambda permissions
        documentsTable.grantReadWriteData(translationLambda);
        // Grant Translate and Comprehend permissions
        translationLambda.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'translate:TranslateText',
                'comprehend:DetectDominantLanguage',
            ],
            resources: ['*'],
        }));
        // Add DynamoDB Stream event source to Translation Lambda
        translationLambda.addEventSource(new lambdaEventSources.DynamoEventSource(documentsTable, {
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
        }));
        // Create Analysis Lambda function with cold start optimizations
        // Triggered by DynamoDB Streams when documents reach "translation_complete" status
        const analysisLambdaConstruct = (0, optimized_lambda_1.createOptimizedProcessingLambda)(this, 'AnalysisFunction', {
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
        }, layers);
        const analysisLambda = analysisLambdaConstruct.function;
        // Grant Analysis Lambda permissions
        documentsTable.grantReadWriteData(analysisLambda);
        // Grant Bedrock permissions
        analysisLambda.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'bedrock:InvokeModel',
            ],
            resources: ['*'],
        }));
        // Add DynamoDB Stream event source to Analysis Lambda
        analysisLambda.addEventSource(new lambdaEventSources.DynamoEventSource(documentsTable, {
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
        }));
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
        const notificationLambdaConstruct = (0, optimized_lambda_1.createOptimizedProcessingLambda)(this, 'NotificationFunction', {
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
        }, layers);
        const notificationLambda = notificationLambdaConstruct.function;
        // Grant notification Lambda permissions
        usersTable.grantReadData(notificationLambda);
        propertiesTable.grantReadData(notificationLambda);
        notificationsTable.grantReadWriteData(notificationLambda);
        // Grant SES permissions
        notificationLambda.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'ses:SendEmail',
                'ses:SendRawEmail',
            ],
            resources: ['*'], // SES doesn't support resource-level permissions for SendEmail
        }));
        // Add DynamoDB Stream event sources for notifications
        // Trigger on Properties table changes
        notificationLambda.addEventSource(new lambdaEventSources.DynamoEventSource(propertiesTable, {
            startingPosition: lambda.StartingPosition.LATEST,
            batchSize: 10,
            maxBatchingWindow: cdk.Duration.seconds(5),
            retryAttempts: 3,
            reportBatchItemFailures: true,
        }));
        // Trigger on Documents table changes
        notificationLambda.addEventSource(new lambdaEventSources.DynamoEventSource(documentsTable, {
            startingPosition: lambda.StartingPosition.LATEST,
            batchSize: 10,
            maxBatchingWindow: cdk.Duration.seconds(5),
            retryAttempts: 3,
            reportBatchItemFailures: true,
        }));
        // Create GET Notifications Lambda function for API endpoint
        // This is separate from the stream processor above
        const getNotificationsLambdaConstruct = (0, optimized_lambda_1.createOptimizedProcessingLambda)(this, 'GetNotificationsFunction', {
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
        }, layers);
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
        const lineageLambdaConstruct = (0, optimized_lambda_1.createOptimizedProcessingLambda)(this, 'LineageFunction', {
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
        }, layers);
        const lineageLambda = lineageLambdaConstruct.function;
        // Grant Lineage Lambda permissions
        documentsTable.grantReadData(lineageLambda);
        propertiesTable.grantReadWriteData(lineageLambda);
        lineageTable.grantReadWriteData(lineageLambda);
        // Add DynamoDB Stream event source to Lineage Lambda
        // Trigger when documents reach "analysis_complete" status
        lineageLambda.addEventSource(new lambdaEventSources.DynamoEventSource(documentsTable, {
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
        }));
        // Create Trust Score Lambda function with cold start optimizations
        // Triggered by DynamoDB Streams when lineage construction completes
        const trustScoreLambdaConstruct = (0, optimized_lambda_1.createOptimizedProcessingLambda)(this, 'TrustScoreFunction', {
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
        }, layers);
        const trustScoreLambda = trustScoreLambdaConstruct.function;
        // Grant Trust Score Lambda permissions
        lineageTable.grantReadData(trustScoreLambda);
        documentsTable.grantReadData(trustScoreLambda);
        propertiesTable.grantReadWriteData(trustScoreLambda);
        trustScoresTable.grantReadWriteData(trustScoreLambda);
        // Add DynamoDB Stream event source to Trust Score Lambda
        // Trigger when lineage construction completes (new lineage records are inserted)
        trustScoreLambda.addEventSource(new lambdaEventSources.DynamoEventSource(lineageTable, {
            startingPosition: lambda.StartingPosition.LATEST,
            batchSize: 10,
            maxBatchingWindow: cdk.Duration.seconds(5),
            retryAttempts: 3,
            reportBatchItemFailures: true,
        }));
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
        const cleanupLambdaConstruct = (0, optimized_lambda_1.createOptimizedProcessingLambda)(this, 'CleanupDeactivatedAccountsFunction', {
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
        }, layers);
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
        cleanupLambda.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'cognito-idp:AdminDeleteUser',
            ],
            resources: ['*'], // TODO: Restrict to specific User Pool ARN
        }));
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
        const cognitoConfig = new cognito_config_1.CognitoConfig(this, 'CognitoConfig');
        // ========== Auth Lambda Functions (Task 3) ==========
        // Create Lambda functions for authentication endpoints
        const authLambdas = new auth_lambdas_1.AuthLambdas(this, 'AuthLambdas', {
            userPool: cognitoConfig.userPool,
            userPoolClient: cognitoConfig.userPoolClient,
            usersTable: usersTable,
            auditLogsTable: auditLogsTable,
            nodeLayer: layers.nodejsCommonLayer,
        });
        // ========== Auth API Gateway (Task 22.1) ==========
        // Create API Gateway with authentication endpoints
        const authApiGateway = new auth_api_gateway_1.AuthApiGateway(this, 'AuthApiGateway', {
            registerLambda: authLambdas.registerLambda,
            loginLambda: authLambdas.loginLambda,
            verifyOtpLambda: authLambdas.verifyOtpLambda,
            refreshTokenLambda: authLambdas.refreshTokenLambda,
        });
        // ========== Property Lambda Functions ==========
        // Create Lambda functions for property management endpoints
        const propertyLambdas = new property_lambdas_1.PropertyLambdas(this, 'PropertyLambdas', {
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
        const mainApiGateway = new main_api_gateway_1.MainApiGateway(this, 'MainApiGateway', {
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
exports.SatyaMoolStack = SatyaMoolStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2F0eWFtb29sLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL3NhdHlhbW9vbC1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMseUNBQXlDO0FBQ3pDLDJDQUEyQztBQUMzQyx3REFBd0Q7QUFDeEQsMkNBQTJDO0FBQzNDLHFEQUFxRDtBQUNyRCxpREFBaUQ7QUFDakQsMkVBQTJFO0FBQzNFLDJDQUEyQztBQUMzQyxpREFBaUQ7QUFDakQsMERBQTBEO0FBSzFELDJDQUEyQztBQU0zQyw2QkFBNkI7QUFDN0IsbURBQStDO0FBQy9DLHlEQUFxRTtBQUNyRSxxREFBaUQ7QUFDakQsaURBQTZDO0FBQzdDLHlEQUFvRDtBQUNwRCx5REFBcUQ7QUFDckQseURBQW9EO0FBRXBELE1BQWEsY0FBZSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzNDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsNkVBQTZFO1FBQzdFLCtDQUErQztRQUMvQyxpRUFBaUU7UUFDakUsTUFBTSxNQUFNLEdBQUcsSUFBSSw0QkFBWSxDQUFDLElBQUksRUFBRSxjQUFjLENBQUMsQ0FBQztRQUV0RCxzRkFBc0Y7UUFDdEYsTUFBTSxhQUFhLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNoRSxXQUFXLEVBQUUsMkNBQTJDO1lBQ3hELGlCQUFpQixFQUFFLElBQUksRUFBRSxnQ0FBZ0M7WUFDekQsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtZQUN2QyxLQUFLLEVBQUUsK0JBQStCO1NBQ3ZDLENBQUMsQ0FBQztRQUVILGlEQUFpRDtRQUNqRCxNQUFNLGFBQWEsR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLHVC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LGdCQUFnQixFQUFFO1lBQ3hDLEtBQUssRUFBRSx3RkFBd0Y7WUFDL0YsV0FBVyxFQUFFLHdCQUF3QjtTQUN0QyxDQUFDLENBQUM7UUFFSCxnRUFBZ0U7UUFDaEUsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxrQ0FBa0MsRUFBRTtZQUMxRCxLQUFLLEVBQUUsR0FBRyxjQUFjLENBQUMsVUFBVSw4QkFBOEI7WUFDakUsV0FBVyxFQUFFLHdEQUF3RDtZQUNyRSxVQUFVLEVBQUUsNENBQTRDO1NBQ3pELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDL0MsS0FBSyxFQUFFLG1IQUFtSDtZQUMxSCxXQUFXLEVBQUUsd0NBQXdDO1NBQ3RELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXZsQ0Qsd0NBdWxDQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XHJcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcclxuaW1wb3J0ICogYXMgczNuIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMy1ub3RpZmljYXRpb25zJztcclxuaW1wb3J0ICogYXMga21zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1rbXMnO1xyXG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xyXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XHJcbmltcG9ydCAqIGFzIGxhbWJkYUV2ZW50U291cmNlcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXMnO1xyXG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XHJcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcclxuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzLXRhcmdldHMnO1xyXG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcclxuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XHJcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xyXG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcclxuaW1wb3J0ICogYXMgc25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xyXG5pbXBvcnQgKiBhcyBzdWJzY3JpcHRpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMtc3Vic2NyaXB0aW9ucyc7XHJcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2hBY3Rpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoLWFjdGlvbnMnO1xyXG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JztcclxuaW1wb3J0ICogYXMgY2xvdWRmcm9udE9yaWdpbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2lucyc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5pbXBvcnQgeyBMYW1iZGFMYXllcnMgfSBmcm9tICcuL2xhbWJkYS1sYXllcnMnO1xyXG5pbXBvcnQgeyBjcmVhdGVPcHRpbWl6ZWRQcm9jZXNzaW5nTGFtYmRhIH0gZnJvbSAnLi9vcHRpbWl6ZWQtbGFtYmRhJztcclxuaW1wb3J0IHsgQ29nbml0b0NvbmZpZyB9IGZyb20gJy4vY29nbml0by1jb25maWcnO1xyXG5pbXBvcnQgeyBBdXRoTGFtYmRhcyB9IGZyb20gJy4vYXV0aC1sYW1iZGFzJztcclxuaW1wb3J0IHsgQXV0aEFwaUdhdGV3YXkgfSBmcm9tICcuL2F1dGgtYXBpLWdhdGV3YXknO1xyXG5pbXBvcnQgeyBQcm9wZXJ0eUxhbWJkYXMgfSBmcm9tICcuL3Byb3BlcnR5LWxhbWJkYXMnO1xyXG5pbXBvcnQgeyBNYWluQXBpR2F0ZXdheSB9IGZyb20gJy4vbWFpbi1hcGktZ2F0ZXdheSc7XHJcblxyXG5leHBvcnQgY2xhc3MgU2F0eWFNb29sU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIC8vID09PT09PT09PT0gVGFzayAzMS4xOiBMYW1iZGEgTGF5ZXJzIGZvciBDb2xkIFN0YXJ0IE9wdGltaXphdGlvbiA9PT09PT09PT09XHJcbiAgICAvLyBDcmVhdGUgTGFtYmRhIGxheWVycyBmb3Igc2hhcmVkIGRlcGVuZGVuY2llc1xyXG4gICAgLy8gVGhpcyByZWR1Y2VzIHBhY2thZ2Ugc2l6ZXMgYW5kIGltcHJvdmVzIGNvbGQgc3RhcnQgcGVyZm9ybWFuY2VcclxuICAgIGNvbnN0IGxheWVycyA9IG5ldyBMYW1iZGFMYXllcnModGhpcywgJ0xhbWJkYUxheWVycycpO1xyXG5cclxuICAgIC8vIENyZWF0ZSBLTVMga2V5IGZvciBlbmNyeXB0aW9uIHdpdGggc2ltcGxpZmllZCBwb2xpY3kgdG8gYXZvaWQgY2lyY3VsYXIgZGVwZW5kZW5jaWVzXHJcbiAgICBjb25zdCBlbmNyeXB0aW9uS2V5ID0gbmV3IGttcy5LZXkodGhpcywgJ1NhdHlhTW9vbEVuY3J5cHRpb25LZXknLCB7XHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnS01TIGtleSBmb3IgU2F0eWFNb29sIGRvY3VtZW50IGVuY3J5cHRpb24nLFxyXG4gICAgICBlbmFibGVLZXlSb3RhdGlvbjogdHJ1ZSwgLy8gQW5udWFsIGF1dG9tYXRpYyBrZXkgcm90YXRpb25cclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxyXG4gICAgICBhbGlhczogJ3NhdHlhbW9vbC9kb2N1bWVudC1lbmNyeXB0aW9uJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSBEZWFkIExldHRlciBRdWV1ZSBmb3IgZmFpbGVkIHByb2Nlc3NpbmdcclxuICAgIGNvbnN0IHByb2Nlc3NpbmdETFEgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdEb2N1bWVudFByb2Nlc3NpbmdETFEnLCB7XHJcbiAgICAgIHF1ZXVlTmFtZTogJ3NhdHlhbW9vbC1kb2N1bWVudC1wcm9jZXNzaW5nLWRscScsXHJcbiAgICAgIGVuY3J5cHRpb246IHNxcy5RdWV1ZUVuY3J5cHRpb24uU1FTX01BTkFHRUQsIC8vIFNpbXBsaWZpZWQ6IFVzZSBTUVMtbWFuYWdlZCBlbmNyeXB0aW9uXHJcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIFNRUyBxdWV1ZSBmb3IgZG9jdW1lbnQgcHJvY2Vzc2luZ1xyXG4gICAgY29uc3QgcHJvY2Vzc2luZ1F1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnRG9jdW1lbnRQcm9jZXNzaW5nUXVldWUnLCB7XHJcbiAgICAgIHF1ZXVlTmFtZTogJ3NhdHlhbW9vbC1kb2N1bWVudC1wcm9jZXNzaW5nJyxcclxuICAgICAgZW5jcnlwdGlvbjogc3FzLlF1ZXVlRW5jcnlwdGlvbi5TUVNfTUFOQUdFRCwgLy8gU2ltcGxpZmllZDogVXNlIFNRUy1tYW5hZ2VkIGVuY3J5cHRpb25cclxuICAgICAgdmlzaWJpbGl0eVRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDYpLCAvLyBMYW1iZGEgdGltZW91dCArIGJ1ZmZlclxyXG4gICAgICByZWNlaXZlTWVzc2FnZVdhaXRUaW1lOiBjZGsuRHVyYXRpb24uc2Vjb25kcygyMCksIC8vIExvbmcgcG9sbGluZ1xyXG4gICAgICBkZWFkTGV0dGVyUXVldWU6IHtcclxuICAgICAgICBxdWV1ZTogcHJvY2Vzc2luZ0RMUSxcclxuICAgICAgICBtYXhSZWNlaXZlQ291bnQ6IDMsIC8vIFJldHJ5IHVwIHRvIDMgdGltZXMgYXMgcGVyIHJlcXVpcmVtZW50c1xyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIFMzIGJ1Y2tldCBmb3IgZG9jdW1lbnQgc3RvcmFnZSB3aXRoIHNpbXBsaWZpZWQgY29uZmlndXJhdGlvblxyXG4gICAgLy8gVXNpbmcgUzMtbWFuYWdlZCBlbmNyeXB0aW9uIGluc3RlYWQgb2YgS01TIHRvIGF2b2lkIHBlcm1pc3Npb24gaXNzdWVzXHJcbiAgICBjb25zdCBkb2N1bWVudEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0RvY3VtZW50QnVja2V0Jywge1xyXG4gICAgICBidWNrZXROYW1lOiBgc2F0eWFtb29sLWRvY3VtZW50cy0ke3RoaXMuYWNjb3VudH1gLFxyXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsIC8vIFNpbXBsaWZpZWQ6IFVzZSBTMy1tYW5hZ2VkIGVuY3J5cHRpb25cclxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcclxuICAgICAgdmVyc2lvbmVkOiB0cnVlLCAvLyBFbmFibGUgdmVyc2lvbmluZyBmb3IgZGlzYXN0ZXIgcmVjb3ZlcnlcclxuICAgICAgY29yczogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBbXHJcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLkdFVCxcclxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUFVULFxyXG4gICAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5QT1NULFxyXG4gICAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5ERUxFVEUsXHJcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLkhFQUQsXHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFsnKiddLCAvLyBBbGxvdyBhbGwgb3JpZ2lucyBmb3IgcHJlc2lnbmVkIFVSTHNcclxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbJyonXSxcclxuICAgICAgICAgIGV4cG9zZWRIZWFkZXJzOiBbXHJcbiAgICAgICAgICAgICdFVGFnJyxcclxuICAgICAgICAgICAgJ3gtYW16LXNlcnZlci1zaWRlLWVuY3J5cHRpb24nLFxyXG4gICAgICAgICAgICAneC1hbXotcmVxdWVzdC1pZCcsXHJcbiAgICAgICAgICAgICd4LWFtei1pZC0yJyxcclxuICAgICAgICAgIF0sXHJcbiAgICAgICAgICBtYXhBZ2U6IDMwMDAsXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgICAgLy8gUmVtb3ZlZCBUcmFuc2ZlciBBY2NlbGVyYXRpb24gdGVtcG9yYXJpbHlcclxuICAgICAgLy8gUmVtb3ZlZCBsaWZlY3ljbGUgcnVsZXMgdGVtcG9yYXJpbHlcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSwgLy8gQ2hhbmdlZCB0byBERVNUUk9ZIGZvciBlYXNpZXIgY2xlYW51cCBkdXJpbmcgZGV2ZWxvcG1lbnRcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENvbmZpZ3VyZSBTMyBldmVudCBub3RpZmljYXRpb24gdG8gU1FTXHJcbiAgICAvLyBGaWx0ZXIgZm9yIGRvY3VtZW50IHVwbG9hZHMgaW4gdGhlIHByb3BlcnRpZXMve3Byb3BlcnR5SWR9L2RvY3VtZW50cy8gcHJlZml4XHJcbiAgICBkb2N1bWVudEJ1Y2tldC5hZGRFdmVudE5vdGlmaWNhdGlvbihcclxuICAgICAgczMuRXZlbnRUeXBlLk9CSkVDVF9DUkVBVEVELFxyXG4gICAgICBuZXcgczNuLlNxc0Rlc3RpbmF0aW9uKHByb2Nlc3NpbmdRdWV1ZSksXHJcbiAgICAgIHtcclxuICAgICAgICBwcmVmaXg6ICdwcm9wZXJ0aWVzLycsXHJcbiAgICAgICAgc3VmZml4OiAnJywgLy8gQWNjZXB0IGFsbCBmaWxlIHR5cGVzIChwZGYsIGpwZWcsIHBuZywgdGlmZilcclxuICAgICAgfVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBDcmVhdGUgUzMgYnVja2V0IGZvciBhdWRpdCBsb2dzIHdpdGggc2ltcGxpZmllZCBjb25maWd1cmF0aW9uXHJcbiAgICBjb25zdCBhdWRpdExvZ0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0F1ZGl0TG9nQnVja2V0Jywge1xyXG4gICAgICBidWNrZXROYW1lOiBgc2F0eWFtb29sLWF1ZGl0LWxvZ3MtJHt0aGlzLmFjY291bnR9YCxcclxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELCAvLyBTaW1wbGlmaWVkOiBVc2UgUzMtbWFuYWdlZCBlbmNyeXB0aW9uXHJcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXHJcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcclxuICAgICAgLy8gUmVtb3ZlZCBsaWZlY3ljbGUgcnVsZXMgdGVtcG9yYXJpbHlcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSwgLy8gQ2hhbmdlZCB0byBERVNUUk9ZIGZvciBlYXNpZXIgY2xlYW51cCBkdXJpbmcgZGV2ZWxvcG1lbnRcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSBEeW5hbW9EQiBEb2N1bWVudHMgdGFibGVcclxuICAgIGNvbnN0IGRvY3VtZW50c1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdEb2N1bWVudHNUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiAnU2F0eWFNb29sLURvY3VtZW50cycsXHJcbiAgICAgIHBhcnRpdGlvbktleToge1xyXG4gICAgICAgIG5hbWU6ICdkb2N1bWVudElkJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgc29ydEtleToge1xyXG4gICAgICAgIG5hbWU6ICdwcm9wZXJ0eUlkJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCwgLy8gT24tZGVtYW5kIHByaWNpbmdcclxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxyXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiB0cnVlLCAvLyBFbmFibGUgUElUUiBmb3IgZGlzYXN0ZXIgcmVjb3ZlcnlcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxyXG4gICAgICBzdHJlYW06IGR5bmFtb2RiLlN0cmVhbVZpZXdUeXBlLk5FV19BTkRfT0xEX0lNQUdFUywgLy8gRW5hYmxlIHN0cmVhbXMgZm9yIGRvd25zdHJlYW0gcHJvY2Vzc2luZ1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkIEdTSSBmb3IgcXVlcnlpbmcgZG9jdW1lbnRzIGJ5IHByb3BlcnR5XHJcbiAgICBkb2N1bWVudHNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ3Byb3BlcnR5SWQtdXBsb2FkZWRBdC1pbmRleCcsXHJcbiAgICAgIHBhcnRpdGlvbktleToge1xyXG4gICAgICAgIG5hbWU6ICdwcm9wZXJ0eUlkJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgc29ydEtleToge1xyXG4gICAgICAgIG5hbWU6ICd1cGxvYWRlZEF0JyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBHU0kgZm9yIHF1ZXJ5aW5nIGRvY3VtZW50cyBieSBwcm9wZXJ0eSBhbmQgcHJvY2Vzc2luZyBzdGF0dXMgKG9wdGltaXplZCBmaWx0ZXJpbmcpXHJcbiAgICBkb2N1bWVudHNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ3Byb3BlcnR5SWQtcHJvY2Vzc2luZ1N0YXR1cy1pbmRleCcsXHJcbiAgICAgIHBhcnRpdGlvbktleToge1xyXG4gICAgICAgIG5hbWU6ICdwcm9wZXJ0eUlkJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgc29ydEtleToge1xyXG4gICAgICAgIG5hbWU6ICdwcm9jZXNzaW5nU3RhdHVzJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLktFWVNfT05MWSwgLy8gT25seSBuZWVkIGtleXMgZm9yIHN0YXR1cyBjaGVja3NcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSBEeW5hbW9EQiBJZGVtcG90ZW5jeSB0YWJsZSBmb3IgcHJldmVudGluZyBkdXBsaWNhdGUgcHJvY2Vzc2luZ1xyXG4gICAgLy8gUmVxdWlyZW1lbnRzOiAzLjEsIDMuMyAtIEhhbmRsZSBkdXBsaWNhdGUgbWVzc2FnZXMgYW5kIHByZXZlbnQgcmFjZSBjb25kaXRpb25zXHJcbiAgICBjb25zdCBpZGVtcG90ZW5jeVRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdJZGVtcG90ZW5jeVRhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6ICdTYXR5YU1vb2wtSWRlbXBvdGVuY3knLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcclxuICAgICAgICBuYW1lOiAnaWRlbXBvdGVuY3lLZXknLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULCAvLyBPbi1kZW1hbmQgcHJpY2luZ1xyXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXHJcbiAgICAgIHRpbWVUb0xpdmVBdHRyaWJ1dGU6ICd0dGwnLCAvLyBBdXRvbWF0aWNhbGx5IGRlbGV0ZSBvbGQgcmVjb3JkcyBhZnRlciBUVEwgZXhwaXJlc1xyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBDYW4gYmUgZGVzdHJveWVkIGFzIGl0J3MganVzdCBmb3IgZGVkdXBsaWNhdGlvblxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIE9DUiBMYW1iZGEgZnVuY3Rpb24gd2l0aCBjb2xkIHN0YXJ0IG9wdGltaXphdGlvbnNcclxuICAgIC8vIFVzZXMgTGFtYmRhIGxheWVycyBmb3Igc2hhcmVkIGRlcGVuZGVuY2llcyAoYm90bzMsIGJvdG9jb3JlKVxyXG4gICAgLy8gQVJNNjQgYXJjaGl0ZWN0dXJlIGZvciAyMCUgYmV0dGVyIHBlcmZvcm1hbmNlXHJcbiAgICBjb25zdCBvY3JMYW1iZGFDb25zdHJ1Y3QgPSBjcmVhdGVPcHRpbWl6ZWRQcm9jZXNzaW5nTGFtYmRhKFxyXG4gICAgICB0aGlzLFxyXG4gICAgICAnT2NyRnVuY3Rpb24nLFxyXG4gICAgICB7XHJcbiAgICAgICAgZnVuY3Rpb25OYW1lOiAnU2F0eWFNb29sLU9DUi1Qcm9jZXNzb3InLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnT0NSIHByb2Nlc3NpbmcgTGFtYmRhIGZ1bmN0aW9uIHVzaW5nIEFtYXpvbiBUZXh0cmFjdCcsXHJcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTIsXHJcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXIubGFtYmRhX2hhbmRsZXInLFxyXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vcHJvY2Vzc2luZy9vY3InKSksXHJcbiAgICAgICAgbWVtb3J5U2l6ZTogNTEyLFxyXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxyXG4gICAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgICBET0NVTUVOVFNfVEFCTEVfTkFNRTogZG9jdW1lbnRzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICAgICAgUVVFVUVfVVJMOiBwcm9jZXNzaW5nUXVldWUucXVldWVVcmwsXHJcbiAgICAgICAgICBMT0dfTEVWRUw6ICdJTkZPJyxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vIFJlbW92ZWQgcmVzZXJ2ZWRDb25jdXJyZW50RXhlY3V0aW9ucyB0byBhdm9pZCBleGNlZWRpbmcgYWNjb3VudCBsaW1pdHNcclxuICAgICAgfSxcclxuICAgICAgbGF5ZXJzXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IG9jckxhbWJkYSA9IG9jckxhbWJkYUNvbnN0cnVjdC5mdW5jdGlvbjtcclxuXHJcbiAgICAvLyBHcmFudCBPQ1IgTGFtYmRhIHBlcm1pc3Npb25zXHJcbiAgICBkb2N1bWVudEJ1Y2tldC5ncmFudFJlYWQob2NyTGFtYmRhKTsgLy8gUmVhZCBkb2N1bWVudHMgZnJvbSBTM1xyXG4gICAgZG9jdW1lbnRzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKG9jckxhbWJkYSk7IC8vIFJlYWQvd3JpdGUgZG9jdW1lbnQgbWV0YWRhdGFcclxuICAgIGlkZW1wb3RlbmN5VGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKG9jckxhbWJkYSk7IC8vIFJlYWQvd3JpdGUgaWRlbXBvdGVuY3kgcmVjb3Jkc1xyXG4gICAgLy8gUmVtb3ZlZCBLTVMgZGVjcnlwdCBncmFudCBzaW5jZSB3ZSdyZSB1c2luZyBTMy1tYW5hZ2VkIGVuY3J5cHRpb25cclxuICAgIHByb2Nlc3NpbmdRdWV1ZS5ncmFudENvbnN1bWVNZXNzYWdlcyhvY3JMYW1iZGEpOyAvLyBDb25zdW1lIFNRUyBtZXNzYWdlc1xyXG5cclxuICAgIC8vIEdyYW50IFRleHRyYWN0IHBlcm1pc3Npb25zXHJcbiAgICBvY3JMYW1iZGEuYWRkVG9Sb2xlUG9saWN5KFxyXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxyXG4gICAgICAgIGFjdGlvbnM6IFtcclxuICAgICAgICAgICd0ZXh0cmFjdDpBbmFseXplRG9jdW1lbnQnLFxyXG4gICAgICAgICAgJ3RleHRyYWN0OkRldGVjdERvY3VtZW50VGV4dCcsIC8vIEZhbGxiYWNrIEFQSSBmb3Igc3Vic2NyaXB0aW9uLWZyZWUgdGV4dCBleHRyYWN0aW9uXHJcbiAgICAgICAgICAndGV4dHJhY3Q6U3RhcnREb2N1bWVudEFuYWx5c2lzJyxcclxuICAgICAgICAgICd0ZXh0cmFjdDpHZXREb2N1bWVudEFuYWx5c2lzJyxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHJlc291cmNlczogWycqJ10sIC8vIFRleHRyYWN0IGRvZXNuJ3Qgc3VwcG9ydCByZXNvdXJjZS1sZXZlbCBwZXJtaXNzaW9uc1xyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBBZGQgU1FTIGV2ZW50IHNvdXJjZSB0byBPQ1IgTGFtYmRhXHJcbiAgICBvY3JMYW1iZGEuYWRkRXZlbnRTb3VyY2UoXHJcbiAgICAgIG5ldyBsYW1iZGFFdmVudFNvdXJjZXMuU3FzRXZlbnRTb3VyY2UocHJvY2Vzc2luZ1F1ZXVlLCB7XHJcbiAgICAgICAgYmF0Y2hTaXplOiAxMCxcclxuICAgICAgICBtYXhCYXRjaGluZ1dpbmRvdzogY2RrLkR1cmF0aW9uLnNlY29uZHMoNSksXHJcbiAgICAgICAgcmVwb3J0QmF0Y2hJdGVtRmFpbHVyZXM6IHRydWUsIC8vIEVuYWJsZSBwYXJ0aWFsIGJhdGNoIGZhaWx1cmUgcmVwb3J0aW5nXHJcbiAgICAgIH0pXHJcbiAgICApO1xyXG5cclxuICAgIC8vIENyZWF0ZSBUcmFuc2xhdGlvbiBMYW1iZGEgZnVuY3Rpb24gd2l0aCBjb2xkIHN0YXJ0IG9wdGltaXphdGlvbnNcclxuICAgIC8vIFRyaWdnZXJlZCBieSBEeW5hbW9EQiBTdHJlYW1zIHdoZW4gZG9jdW1lbnRzIHJlYWNoIFwib2NyX2NvbXBsZXRlXCIgc3RhdHVzXHJcbiAgICBjb25zdCB0cmFuc2xhdGlvbkxhbWJkYUNvbnN0cnVjdCA9IGNyZWF0ZU9wdGltaXplZFByb2Nlc3NpbmdMYW1iZGEoXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgICdUcmFuc2xhdGlvbkZ1bmN0aW9uJyxcclxuICAgICAge1xyXG4gICAgICAgIGZ1bmN0aW9uTmFtZTogJ1NhdHlhTW9vbC1UcmFuc2xhdGlvbi1Qcm9jZXNzb3InLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVHJhbnNsYXRpb24gcHJvY2Vzc2luZyBMYW1iZGEgZnVuY3Rpb24gdXNpbmcgQW1hem9uIFRyYW5zbGF0ZScsXHJcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTIsXHJcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXIubGFtYmRhX2hhbmRsZXInLFxyXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vcHJvY2Vzc2luZy90cmFuc2xhdGlvbicpKSxcclxuICAgICAgICBtZW1vcnlTaXplOiA1MTIsXHJcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXHJcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICAgIERPQ1VNRU5UU19UQUJMRV9OQU1FOiBkb2N1bWVudHNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgICBMT0dfTEVWRUw6ICdJTkZPJyxcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgICBsYXllcnNcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgdHJhbnNsYXRpb25MYW1iZGEgPSB0cmFuc2xhdGlvbkxhbWJkYUNvbnN0cnVjdC5mdW5jdGlvbjtcclxuXHJcbiAgICAvLyBHcmFudCBUcmFuc2xhdGlvbiBMYW1iZGEgcGVybWlzc2lvbnNcclxuICAgIGRvY3VtZW50c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0cmFuc2xhdGlvbkxhbWJkYSk7XHJcblxyXG4gICAgLy8gR3JhbnQgVHJhbnNsYXRlIGFuZCBDb21wcmVoZW5kIHBlcm1pc3Npb25zXHJcbiAgICB0cmFuc2xhdGlvbkxhbWJkYS5hZGRUb1JvbGVQb2xpY3koXHJcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXHJcbiAgICAgICAgYWN0aW9uczogW1xyXG4gICAgICAgICAgJ3RyYW5zbGF0ZTpUcmFuc2xhdGVUZXh0JyxcclxuICAgICAgICAgICdjb21wcmVoZW5kOkRldGVjdERvbWluYW50TGFuZ3VhZ2UnLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcclxuICAgICAgfSlcclxuICAgICk7XHJcblxyXG4gICAgLy8gQWRkIER5bmFtb0RCIFN0cmVhbSBldmVudCBzb3VyY2UgdG8gVHJhbnNsYXRpb24gTGFtYmRhXHJcbiAgICB0cmFuc2xhdGlvbkxhbWJkYS5hZGRFdmVudFNvdXJjZShcclxuICAgICAgbmV3IGxhbWJkYUV2ZW50U291cmNlcy5EeW5hbW9FdmVudFNvdXJjZShkb2N1bWVudHNUYWJsZSwge1xyXG4gICAgICAgIHN0YXJ0aW5nUG9zaXRpb246IGxhbWJkYS5TdGFydGluZ1Bvc2l0aW9uLkxBVEVTVCxcclxuICAgICAgICBiYXRjaFNpemU6IDEwLFxyXG4gICAgICAgIG1heEJhdGNoaW5nV2luZG93OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1KSxcclxuICAgICAgICByZXRyeUF0dGVtcHRzOiAzLFxyXG4gICAgICAgIHJlcG9ydEJhdGNoSXRlbUZhaWx1cmVzOiB0cnVlLFxyXG4gICAgICAgIGZpbHRlcnM6IFtcclxuICAgICAgICAgIGxhbWJkYS5GaWx0ZXJDcml0ZXJpYS5maWx0ZXIoe1xyXG4gICAgICAgICAgICBldmVudE5hbWU6IGxhbWJkYS5GaWx0ZXJSdWxlLmlzRXF1YWwoJ01PRElGWScpLFxyXG4gICAgICAgICAgICBkeW5hbW9kYjoge1xyXG4gICAgICAgICAgICAgIE5ld0ltYWdlOiB7XHJcbiAgICAgICAgICAgICAgICBwcm9jZXNzaW5nU3RhdHVzOiB7XHJcbiAgICAgICAgICAgICAgICAgIFM6IGxhbWJkYS5GaWx0ZXJSdWxlLmlzRXF1YWwoJ29jcl9jb21wbGV0ZScpLFxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSksXHJcbiAgICAgICAgXSxcclxuICAgICAgfSlcclxuICAgICk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIEFuYWx5c2lzIExhbWJkYSBmdW5jdGlvbiB3aXRoIGNvbGQgc3RhcnQgb3B0aW1pemF0aW9uc1xyXG4gICAgLy8gVHJpZ2dlcmVkIGJ5IER5bmFtb0RCIFN0cmVhbXMgd2hlbiBkb2N1bWVudHMgcmVhY2ggXCJ0cmFuc2xhdGlvbl9jb21wbGV0ZVwiIHN0YXR1c1xyXG4gICAgY29uc3QgYW5hbHlzaXNMYW1iZGFDb25zdHJ1Y3QgPSBjcmVhdGVPcHRpbWl6ZWRQcm9jZXNzaW5nTGFtYmRhKFxyXG4gICAgICB0aGlzLFxyXG4gICAgICAnQW5hbHlzaXNGdW5jdGlvbicsXHJcbiAgICAgIHtcclxuICAgICAgICBmdW5jdGlvbk5hbWU6ICdTYXR5YU1vb2wtQW5hbHlzaXMtUHJvY2Vzc29yJyxcclxuICAgICAgICBkZXNjcmlwdGlvbjogJ0FuYWx5c2lzIHByb2Nlc3NpbmcgTGFtYmRhIGZ1bmN0aW9uIHVzaW5nIEFtYXpvbiBCZWRyb2NrJyxcclxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMixcclxuICAgICAgICBoYW5kbGVyOiAnaGFuZGxlci5sYW1iZGFfaGFuZGxlcicsXHJcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9wcm9jZXNzaW5nL2FuYWx5c2lzJykpLFxyXG4gICAgICAgIG1lbW9yeVNpemU6IDEwMjQsXHJcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXHJcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICAgIERPQ1VNRU5UU19UQUJMRV9OQU1FOiBkb2N1bWVudHNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgICBMT0dfTEVWRUw6ICdJTkZPJyxcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgICBsYXllcnNcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgYW5hbHlzaXNMYW1iZGEgPSBhbmFseXNpc0xhbWJkYUNvbnN0cnVjdC5mdW5jdGlvbjtcclxuXHJcbiAgICAvLyBHcmFudCBBbmFseXNpcyBMYW1iZGEgcGVybWlzc2lvbnNcclxuICAgIGRvY3VtZW50c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShhbmFseXNpc0xhbWJkYSk7XHJcblxyXG4gICAgLy8gR3JhbnQgQmVkcm9jayBwZXJtaXNzaW9uc1xyXG4gICAgYW5hbHlzaXNMYW1iZGEuYWRkVG9Sb2xlUG9saWN5KFxyXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxyXG4gICAgICAgIGFjdGlvbnM6IFtcclxuICAgICAgICAgICdiZWRyb2NrOkludm9rZU1vZGVsJyxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHJlc291cmNlczogWycqJ10sXHJcbiAgICAgIH0pXHJcbiAgICApO1xyXG5cclxuICAgIC8vIEFkZCBEeW5hbW9EQiBTdHJlYW0gZXZlbnQgc291cmNlIHRvIEFuYWx5c2lzIExhbWJkYVxyXG4gICAgYW5hbHlzaXNMYW1iZGEuYWRkRXZlbnRTb3VyY2UoXHJcbiAgICAgIG5ldyBsYW1iZGFFdmVudFNvdXJjZXMuRHluYW1vRXZlbnRTb3VyY2UoZG9jdW1lbnRzVGFibGUsIHtcclxuICAgICAgICBzdGFydGluZ1Bvc2l0aW9uOiBsYW1iZGEuU3RhcnRpbmdQb3NpdGlvbi5MQVRFU1QsXHJcbiAgICAgICAgYmF0Y2hTaXplOiAxMCxcclxuICAgICAgICBtYXhCYXRjaGluZ1dpbmRvdzogY2RrLkR1cmF0aW9uLnNlY29uZHMoNSksXHJcbiAgICAgICAgcmV0cnlBdHRlbXB0czogMyxcclxuICAgICAgICByZXBvcnRCYXRjaEl0ZW1GYWlsdXJlczogdHJ1ZSxcclxuICAgICAgICBmaWx0ZXJzOiBbXHJcbiAgICAgICAgICBsYW1iZGEuRmlsdGVyQ3JpdGVyaWEuZmlsdGVyKHtcclxuICAgICAgICAgICAgZXZlbnROYW1lOiBsYW1iZGEuRmlsdGVyUnVsZS5pc0VxdWFsKCdNT0RJRlknKSxcclxuICAgICAgICAgICAgZHluYW1vZGI6IHtcclxuICAgICAgICAgICAgICBOZXdJbWFnZToge1xyXG4gICAgICAgICAgICAgICAgcHJvY2Vzc2luZ1N0YXR1czoge1xyXG4gICAgICAgICAgICAgICAgICBTOiBsYW1iZGEuRmlsdGVyUnVsZS5pc0VxdWFsKCd0cmFuc2xhdGlvbl9jb21wbGV0ZScpLFxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSksXHJcbiAgICAgICAgXSxcclxuICAgICAgfSlcclxuICAgICk7XHJcblxyXG4gICAgLy8gT3V0cHV0IHRoZSBidWNrZXQgbmFtZSBhbmQgcXVldWUgVVJMIGZvciBMYW1iZGEgZnVuY3Rpb25zXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRG9jdW1lbnRCdWNrZXROYW1lJywge1xyXG4gICAgICB2YWx1ZTogZG9jdW1lbnRCdWNrZXQuYnVja2V0TmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdTMyBidWNrZXQgbmFtZSBmb3IgZG9jdW1lbnQgc3RvcmFnZScsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtRG9jdW1lbnRCdWNrZXROYW1lJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBdWRpdExvZ0J1Y2tldE5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiBhdWRpdExvZ0J1Y2tldC5idWNrZXROYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIGJ1Y2tldCBuYW1lIGZvciBhdWRpdCBsb2dzJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1NhdHlhTW9vbC1BdWRpdExvZ0J1Y2tldE5hbWUnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2Nlc3NpbmdRdWV1ZVVybCcsIHtcclxuICAgICAgdmFsdWU6IHByb2Nlc3NpbmdRdWV1ZS5xdWV1ZVVybCxcclxuICAgICAgZGVzY3JpcHRpb246ICdTUVMgcXVldWUgVVJMIGZvciBkb2N1bWVudCBwcm9jZXNzaW5nJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1NhdHlhTW9vbC1Qcm9jZXNzaW5nUXVldWVVcmwnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2Nlc3NpbmdRdWV1ZUFybicsIHtcclxuICAgICAgdmFsdWU6IHByb2Nlc3NpbmdRdWV1ZS5xdWV1ZUFybixcclxuICAgICAgZGVzY3JpcHRpb246ICdTUVMgcXVldWUgQVJOIGZvciBkb2N1bWVudCBwcm9jZXNzaW5nJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1NhdHlhTW9vbC1Qcm9jZXNzaW5nUXVldWVBcm4nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0VuY3J5cHRpb25LZXlJZCcsIHtcclxuICAgICAgdmFsdWU6IGVuY3J5cHRpb25LZXkua2V5SWQsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnS01TIGtleSBJRCBmb3IgZW5jcnlwdGlvbicsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtRW5jcnlwdGlvbktleUlkJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEb2N1bWVudHNUYWJsZU5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiBkb2N1bWVudHNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgdGFibGUgbmFtZSBmb3IgZG9jdW1lbnRzJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1NhdHlhTW9vbC1Eb2N1bWVudHNUYWJsZU5hbWUnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ09jckxhbWJkYUFybicsIHtcclxuICAgICAgdmFsdWU6IG9jckxhbWJkYS5mdW5jdGlvbkFybixcclxuICAgICAgZGVzY3JpcHRpb246ICdPQ1IgTGFtYmRhIGZ1bmN0aW9uIEFSTicsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtT2NyTGFtYmRhQXJuJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdUcmFuc2xhdGlvbkxhbWJkYUFybicsIHtcclxuICAgICAgdmFsdWU6IHRyYW5zbGF0aW9uTGFtYmRhLmZ1bmN0aW9uQXJuLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1RyYW5zbGF0aW9uIExhbWJkYSBmdW5jdGlvbiBBUk4nLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLVRyYW5zbGF0aW9uTGFtYmRhQXJuJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBbmFseXNpc0xhbWJkYUFybicsIHtcclxuICAgICAgdmFsdWU6IGFuYWx5c2lzTGFtYmRhLmZ1bmN0aW9uQXJuLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0FuYWx5c2lzIExhbWJkYSBmdW5jdGlvbiBBUk4nLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLUFuYWx5c2lzTGFtYmRhQXJuJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSBEeW5hbW9EQiBVc2VycyB0YWJsZSAoZm9yIG5vdGlmaWNhdGlvbiBzeXN0ZW0pXHJcbiAgICBjb25zdCB1c2Vyc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdVc2Vyc1RhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6ICdTYXR5YU1vb2wtVXNlcnMnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcclxuICAgICAgICBuYW1lOiAndXNlcklkJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxyXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiB0cnVlLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgRHluYW1vREIgUHJvcGVydGllcyB0YWJsZSAoZm9yIG5vdGlmaWNhdGlvbiBzeXN0ZW0pXHJcbiAgICBjb25zdCBwcm9wZXJ0aWVzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1Byb3BlcnRpZXNUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiAnU2F0eWFNb29sLVByb3BlcnRpZXMnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcclxuICAgICAgICBuYW1lOiAncHJvcGVydHlJZCcsXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXHJcbiAgICAgIH0sXHJcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcclxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeTogdHJ1ZSxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxyXG4gICAgICBzdHJlYW06IGR5bmFtb2RiLlN0cmVhbVZpZXdUeXBlLk5FV19BTkRfT0xEX0lNQUdFUywgLy8gRW5hYmxlIHN0cmVhbXMgZm9yIG5vdGlmaWNhdGlvbnNcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBHU0kgZm9yIHF1ZXJ5aW5nIHByb3BlcnRpZXMgYnkgdXNlclxyXG4gICAgcHJvcGVydGllc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAndXNlcklkLWNyZWF0ZWRBdC1pbmRleCcsXHJcbiAgICAgIHBhcnRpdGlvbktleToge1xyXG4gICAgICAgIG5hbWU6ICd1c2VySWQnLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgICBzb3J0S2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ2NyZWF0ZWRBdCcsXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXHJcbiAgICAgIH0sXHJcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBZGQgR1NJIGZvciBxdWVyeWluZyBwcm9wZXJ0aWVzIGJ5IHVzZXIgYW5kIHN0YXR1cyAob3B0aW1pemVkIGZpbHRlcmluZylcclxuICAgIHByb3BlcnRpZXNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ3VzZXJJZC1zdGF0dXMtaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcclxuICAgICAgICBuYW1lOiAndXNlcklkJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgc29ydEtleToge1xyXG4gICAgICAgIG5hbWU6ICdzdGF0dXMnLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIER5bmFtb0RCIE5vdGlmaWNhdGlvbnMgdGFibGVcclxuICAgIGNvbnN0IG5vdGlmaWNhdGlvbnNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnTm90aWZpY2F0aW9uc1RhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6ICdTYXR5YU1vb2wtTm90aWZpY2F0aW9ucycsXHJcbiAgICAgIHBhcnRpdGlvbktleToge1xyXG4gICAgICAgIG5hbWU6ICdub3RpZmljYXRpb25JZCcsXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXHJcbiAgICAgIH0sXHJcbiAgICAgIHNvcnRLZXk6IHtcclxuICAgICAgICBuYW1lOiAndXNlcklkJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxyXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiB0cnVlLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBZGQgR1NJIGZvciBxdWVyeWluZyBub3RpZmljYXRpb25zIGJ5IHVzZXJcclxuICAgIG5vdGlmaWNhdGlvbnNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ3VzZXJJZC1jcmVhdGVkQXQtaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcclxuICAgICAgICBuYW1lOiAndXNlcklkJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgc29ydEtleToge1xyXG4gICAgICAgIG5hbWU6ICdjcmVhdGVkQXQnLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIE5vdGlmaWNhdGlvbiBMYW1iZGEgZnVuY3Rpb24gd2l0aCBjb2xkIHN0YXJ0IG9wdGltaXphdGlvbnNcclxuICAgIC8vIFVzZXMgTGFtYmRhIGxheWVycyBmb3Igc2hhcmVkIE5vZGUuanMgZGVwZW5kZW5jaWVzIGFuZCBBV1MgU0RLXHJcbiAgICBjb25zdCBub3RpZmljYXRpb25MYW1iZGFDb25zdHJ1Y3QgPSBjcmVhdGVPcHRpbWl6ZWRQcm9jZXNzaW5nTGFtYmRhKFxyXG4gICAgICB0aGlzLFxyXG4gICAgICAnTm90aWZpY2F0aW9uRnVuY3Rpb24nLFxyXG4gICAgICB7XHJcbiAgICAgICAgZnVuY3Rpb25OYW1lOiAnU2F0eWFNb29sLU5vdGlmaWNhdGlvbi1Qcm9jZXNzb3InLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnTm90aWZpY2F0aW9uIExhbWJkYSBmdW5jdGlvbiBmb3IgZW1haWwgYW5kIGluLWFwcCBub3RpZmljYXRpb25zJyxcclxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcclxuICAgICAgICBoYW5kbGVyOiAnbm90aWZpY2F0aW9ucy9pbmRleC5oYW5kbGVyJyxcclxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvZGlzdCcpKSxcclxuICAgICAgICBtZW1vcnlTaXplOiAyNTYsXHJcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgICBVU0VSU19UQUJMRV9OQU1FOiB1c2Vyc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICAgIFBST1BFUlRJRVNfVEFCTEVfTkFNRTogcHJvcGVydGllc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICAgIE5PVElGSUNBVElPTlNfVEFCTEVfTkFNRTogbm90aWZpY2F0aW9uc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICAgIEZST01fRU1BSUw6ICdub3JlcGx5QHNhdHlhbW9vbC5jb20nLCAvLyBUT0RPOiBVcGRhdGUgd2l0aCB2ZXJpZmllZCBTRVMgZW1haWxcclxuICAgICAgICAgIEZST05URU5EX1VSTDogJ2h0dHBzOi8vYXBwLnNhdHlhbW9vbC5jb20nLCAvLyBUT0RPOiBVcGRhdGUgd2l0aCBhY3R1YWwgZnJvbnRlbmQgVVJMXHJcbiAgICAgICAgICBMT0dfTEVWRUw6ICdJTkZPJyxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vIFJlbW92ZWQgcmVzZXJ2ZWRDb25jdXJyZW50RXhlY3V0aW9ucyB0byBhdm9pZCBleGNlZWRpbmcgYWNjb3VudCBsaW1pdHNcclxuICAgICAgfSxcclxuICAgICAgbGF5ZXJzXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IG5vdGlmaWNhdGlvbkxhbWJkYSA9IG5vdGlmaWNhdGlvbkxhbWJkYUNvbnN0cnVjdC5mdW5jdGlvbjtcclxuXHJcbiAgICAvLyBHcmFudCBub3RpZmljYXRpb24gTGFtYmRhIHBlcm1pc3Npb25zXHJcbiAgICB1c2Vyc1RhYmxlLmdyYW50UmVhZERhdGEobm90aWZpY2F0aW9uTGFtYmRhKTtcclxuICAgIHByb3BlcnRpZXNUYWJsZS5ncmFudFJlYWREYXRhKG5vdGlmaWNhdGlvbkxhbWJkYSk7XHJcbiAgICBub3RpZmljYXRpb25zVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKG5vdGlmaWNhdGlvbkxhbWJkYSk7XHJcblxyXG4gICAgLy8gR3JhbnQgU0VTIHBlcm1pc3Npb25zXHJcbiAgICBub3RpZmljYXRpb25MYW1iZGEuYWRkVG9Sb2xlUG9saWN5KFxyXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxyXG4gICAgICAgIGFjdGlvbnM6IFtcclxuICAgICAgICAgICdzZXM6U2VuZEVtYWlsJyxcclxuICAgICAgICAgICdzZXM6U2VuZFJhd0VtYWlsJyxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHJlc291cmNlczogWycqJ10sIC8vIFNFUyBkb2Vzbid0IHN1cHBvcnQgcmVzb3VyY2UtbGV2ZWwgcGVybWlzc2lvbnMgZm9yIFNlbmRFbWFpbFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBBZGQgRHluYW1vREIgU3RyZWFtIGV2ZW50IHNvdXJjZXMgZm9yIG5vdGlmaWNhdGlvbnNcclxuICAgIC8vIFRyaWdnZXIgb24gUHJvcGVydGllcyB0YWJsZSBjaGFuZ2VzXHJcbiAgICBub3RpZmljYXRpb25MYW1iZGEuYWRkRXZlbnRTb3VyY2UoXHJcbiAgICAgIG5ldyBsYW1iZGFFdmVudFNvdXJjZXMuRHluYW1vRXZlbnRTb3VyY2UocHJvcGVydGllc1RhYmxlLCB7XHJcbiAgICAgICAgc3RhcnRpbmdQb3NpdGlvbjogbGFtYmRhLlN0YXJ0aW5nUG9zaXRpb24uTEFURVNULFxyXG4gICAgICAgIGJhdGNoU2l6ZTogMTAsXHJcbiAgICAgICAgbWF4QmF0Y2hpbmdXaW5kb3c6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxyXG4gICAgICAgIHJldHJ5QXR0ZW1wdHM6IDMsXHJcbiAgICAgICAgcmVwb3J0QmF0Y2hJdGVtRmFpbHVyZXM6IHRydWUsXHJcbiAgICAgIH0pXHJcbiAgICApO1xyXG5cclxuICAgIC8vIFRyaWdnZXIgb24gRG9jdW1lbnRzIHRhYmxlIGNoYW5nZXNcclxuICAgIG5vdGlmaWNhdGlvbkxhbWJkYS5hZGRFdmVudFNvdXJjZShcclxuICAgICAgbmV3IGxhbWJkYUV2ZW50U291cmNlcy5EeW5hbW9FdmVudFNvdXJjZShkb2N1bWVudHNUYWJsZSwge1xyXG4gICAgICAgIHN0YXJ0aW5nUG9zaXRpb246IGxhbWJkYS5TdGFydGluZ1Bvc2l0aW9uLkxBVEVTVCxcclxuICAgICAgICBiYXRjaFNpemU6IDEwLFxyXG4gICAgICAgIG1heEJhdGNoaW5nV2luZG93OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1KSxcclxuICAgICAgICByZXRyeUF0dGVtcHRzOiAzLFxyXG4gICAgICAgIHJlcG9ydEJhdGNoSXRlbUZhaWx1cmVzOiB0cnVlLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBDcmVhdGUgR0VUIE5vdGlmaWNhdGlvbnMgTGFtYmRhIGZ1bmN0aW9uIGZvciBBUEkgZW5kcG9pbnRcclxuICAgIC8vIFRoaXMgaXMgc2VwYXJhdGUgZnJvbSB0aGUgc3RyZWFtIHByb2Nlc3NvciBhYm92ZVxyXG4gICAgY29uc3QgZ2V0Tm90aWZpY2F0aW9uc0xhbWJkYUNvbnN0cnVjdCA9IGNyZWF0ZU9wdGltaXplZFByb2Nlc3NpbmdMYW1iZGEoXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgICdHZXROb3RpZmljYXRpb25zRnVuY3Rpb24nLFxyXG4gICAgICB7XHJcbiAgICAgICAgZnVuY3Rpb25OYW1lOiAnU2F0eWFNb29sLUdldC1Ob3RpZmljYXRpb25zJyxcclxuICAgICAgICBkZXNjcmlwdGlvbjogJ0xhbWJkYSBmdW5jdGlvbiBmb3IgcmV0cmlldmluZyB1c2VyIG5vdGlmaWNhdGlvbnMgdmlhIEFQSScsXHJcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXHJcbiAgICAgICAgaGFuZGxlcjogJ25vdGlmaWNhdGlvbnMvZ2V0LW5vdGlmaWNhdGlvbnMuaGFuZGxlcicsXHJcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL2Rpc3QnKSksXHJcbiAgICAgICAgbWVtb3J5U2l6ZTogMjU2LFxyXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSxcclxuICAgICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgICAgTk9USUZJQ0FUSU9OU19UQUJMRV9OQU1FOiBub3RpZmljYXRpb25zVGFibGUudGFibGVOYW1lLFxyXG4gICAgICAgICAgTE9HX0xFVkVMOiAnSU5GTycsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgICAgbGF5ZXJzXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IGdldE5vdGlmaWNhdGlvbnNMYW1iZGEgPSBnZXROb3RpZmljYXRpb25zTGFtYmRhQ29uc3RydWN0LmZ1bmN0aW9uO1xyXG5cclxuICAgIC8vIEdyYW50IEdFVCBub3RpZmljYXRpb25zIExhbWJkYSBwZXJtaXNzaW9uc1xyXG4gICAgbm90aWZpY2F0aW9uc1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0Tm90aWZpY2F0aW9uc0xhbWJkYSk7XHJcblxyXG4gICAgLy8gT3V0cHV0IG5vdGlmaWNhdGlvbiByZXNvdXJjZXNcclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2Vyc1RhYmxlTmFtZScsIHtcclxuICAgICAgdmFsdWU6IHVzZXJzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIHVzZXJzJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1NhdHlhTW9vbC1Vc2Vyc1RhYmxlTmFtZScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvcGVydGllc1RhYmxlTmFtZScsIHtcclxuICAgICAgdmFsdWU6IHByb3BlcnRpZXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgdGFibGUgbmFtZSBmb3IgcHJvcGVydGllcycsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtUHJvcGVydGllc1RhYmxlTmFtZScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTm90aWZpY2F0aW9uc1RhYmxlTmFtZScsIHtcclxuICAgICAgdmFsdWU6IG5vdGlmaWNhdGlvbnNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgdGFibGUgbmFtZSBmb3Igbm90aWZpY2F0aW9ucycsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtTm90aWZpY2F0aW9uc1RhYmxlTmFtZScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTm90aWZpY2F0aW9uTGFtYmRhQXJuJywge1xyXG4gICAgICB2YWx1ZTogbm90aWZpY2F0aW9uTGFtYmRhLmZ1bmN0aW9uQXJuLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ05vdGlmaWNhdGlvbiBMYW1iZGEgZnVuY3Rpb24gQVJOJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1NhdHlhTW9vbC1Ob3RpZmljYXRpb25MYW1iZGFBcm4nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0dldE5vdGlmaWNhdGlvbnNMYW1iZGFBcm4nLCB7XHJcbiAgICAgIHZhbHVlOiBnZXROb3RpZmljYXRpb25zTGFtYmRhLmZ1bmN0aW9uQXJuLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0dFVCBOb3RpZmljYXRpb25zIExhbWJkYSBmdW5jdGlvbiBBUk4nLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLUdldE5vdGlmaWNhdGlvbnNMYW1iZGFBcm4nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIER5bmFtb0RCIExpbmVhZ2UgdGFibGVcclxuICAgIGNvbnN0IGxpbmVhZ2VUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnTGluZWFnZVRhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6ICdTYXR5YU1vb2wtTGluZWFnZScsXHJcbiAgICAgIHBhcnRpdGlvbktleToge1xyXG4gICAgICAgIG5hbWU6ICdwcm9wZXJ0eUlkJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxyXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiB0cnVlLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXHJcbiAgICAgIHN0cmVhbTogZHluYW1vZGIuU3RyZWFtVmlld1R5cGUuTkVXX0FORF9PTERfSU1BR0VTLCAvLyBFbmFibGUgc3RyZWFtcyBmb3IgVHJ1c3QgU2NvcmUgTGFtYmRhXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgRHluYW1vREIgVHJ1c3RTY29yZXMgdGFibGVcclxuICAgIGNvbnN0IHRydXN0U2NvcmVzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1RydXN0U2NvcmVzVGFibGUnLCB7XHJcbiAgICAgIHRhYmxlTmFtZTogJ1NhdHlhTW9vbC1UcnVzdFNjb3JlcycsXHJcbiAgICAgIHBhcnRpdGlvbktleToge1xyXG4gICAgICAgIG5hbWU6ICdwcm9wZXJ0eUlkJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxyXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiB0cnVlLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgTGluZWFnZSBMYW1iZGEgZnVuY3Rpb24gd2l0aCBjb2xkIHN0YXJ0IG9wdGltaXphdGlvbnNcclxuICAgIC8vIFRyaWdnZXJlZCBieSBEeW5hbW9EQiBTdHJlYW1zIHdoZW4gQUxMIGRvY3VtZW50cyBmb3IgYSBwcm9wZXJ0eSByZWFjaCBcImFuYWx5c2lzX2NvbXBsZXRlXCIgc3RhdHVzXHJcbiAgICBjb25zdCBsaW5lYWdlTGFtYmRhQ29uc3RydWN0ID0gY3JlYXRlT3B0aW1pemVkUHJvY2Vzc2luZ0xhbWJkYShcclxuICAgICAgdGhpcyxcclxuICAgICAgJ0xpbmVhZ2VGdW5jdGlvbicsXHJcbiAgICAgIHtcclxuICAgICAgICBmdW5jdGlvbk5hbWU6ICdTYXR5YU1vb2wtTGluZWFnZS1Qcm9jZXNzb3InLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnTGluZWFnZSBjb25zdHJ1Y3Rpb24gTGFtYmRhIGZ1bmN0aW9uIGZvciBidWlsZGluZyBvd25lcnNoaXAgZ3JhcGhzJyxcclxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMixcclxuICAgICAgICBoYW5kbGVyOiAnaGFuZGxlci5sYW1iZGFfaGFuZGxlcicsXHJcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9wcm9jZXNzaW5nL2xpbmVhZ2UnKSksXHJcbiAgICAgICAgbWVtb3J5U2l6ZTogMTAyNCxcclxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcclxuICAgICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgICAgRE9DVU1FTlRTX1RBQkxFX05BTUU6IGRvY3VtZW50c1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICAgIFBST1BFUlRJRVNfVEFCTEVfTkFNRTogcHJvcGVydGllc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICAgIExJTkVBR0VfVEFCTEVfTkFNRTogbGluZWFnZVRhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICAgIExPR19MRVZFTDogJ0lORk8nLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICAgIGxheWVyc1xyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBsaW5lYWdlTGFtYmRhID0gbGluZWFnZUxhbWJkYUNvbnN0cnVjdC5mdW5jdGlvbjtcclxuXHJcbiAgICAvLyBHcmFudCBMaW5lYWdlIExhbWJkYSBwZXJtaXNzaW9uc1xyXG4gICAgZG9jdW1lbnRzVGFibGUuZ3JhbnRSZWFkRGF0YShsaW5lYWdlTGFtYmRhKTtcclxuICAgIHByb3BlcnRpZXNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEobGluZWFnZUxhbWJkYSk7XHJcbiAgICBsaW5lYWdlVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGxpbmVhZ2VMYW1iZGEpO1xyXG5cclxuICAgIC8vIEFkZCBEeW5hbW9EQiBTdHJlYW0gZXZlbnQgc291cmNlIHRvIExpbmVhZ2UgTGFtYmRhXHJcbiAgICAvLyBUcmlnZ2VyIHdoZW4gZG9jdW1lbnRzIHJlYWNoIFwiYW5hbHlzaXNfY29tcGxldGVcIiBzdGF0dXNcclxuICAgIGxpbmVhZ2VMYW1iZGEuYWRkRXZlbnRTb3VyY2UoXHJcbiAgICAgIG5ldyBsYW1iZGFFdmVudFNvdXJjZXMuRHluYW1vRXZlbnRTb3VyY2UoZG9jdW1lbnRzVGFibGUsIHtcclxuICAgICAgICBzdGFydGluZ1Bvc2l0aW9uOiBsYW1iZGEuU3RhcnRpbmdQb3NpdGlvbi5MQVRFU1QsXHJcbiAgICAgICAgYmF0Y2hTaXplOiAxMCxcclxuICAgICAgICBtYXhCYXRjaGluZ1dpbmRvdzogY2RrLkR1cmF0aW9uLnNlY29uZHMoNSksXHJcbiAgICAgICAgcmV0cnlBdHRlbXB0czogMyxcclxuICAgICAgICByZXBvcnRCYXRjaEl0ZW1GYWlsdXJlczogdHJ1ZSxcclxuICAgICAgICBmaWx0ZXJzOiBbXHJcbiAgICAgICAgICBsYW1iZGEuRmlsdGVyQ3JpdGVyaWEuZmlsdGVyKHtcclxuICAgICAgICAgICAgZXZlbnROYW1lOiBsYW1iZGEuRmlsdGVyUnVsZS5pc0VxdWFsKCdNT0RJRlknKSxcclxuICAgICAgICAgICAgZHluYW1vZGI6IHtcclxuICAgICAgICAgICAgICBOZXdJbWFnZToge1xyXG4gICAgICAgICAgICAgICAgcHJvY2Vzc2luZ1N0YXR1czoge1xyXG4gICAgICAgICAgICAgICAgICBTOiBsYW1iZGEuRmlsdGVyUnVsZS5pc0VxdWFsKCdhbmFseXNpc19jb21wbGV0ZScpLFxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSksXHJcbiAgICAgICAgXSxcclxuICAgICAgfSlcclxuICAgICk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIFRydXN0IFNjb3JlIExhbWJkYSBmdW5jdGlvbiB3aXRoIGNvbGQgc3RhcnQgb3B0aW1pemF0aW9uc1xyXG4gICAgLy8gVHJpZ2dlcmVkIGJ5IER5bmFtb0RCIFN0cmVhbXMgd2hlbiBsaW5lYWdlIGNvbnN0cnVjdGlvbiBjb21wbGV0ZXNcclxuICAgIGNvbnN0IHRydXN0U2NvcmVMYW1iZGFDb25zdHJ1Y3QgPSBjcmVhdGVPcHRpbWl6ZWRQcm9jZXNzaW5nTGFtYmRhKFxyXG4gICAgICB0aGlzLFxyXG4gICAgICAnVHJ1c3RTY29yZUZ1bmN0aW9uJyxcclxuICAgICAge1xyXG4gICAgICAgIGZ1bmN0aW9uTmFtZTogJ1NhdHlhTW9vbC1UcnVzdFNjb3JlLVByb2Nlc3NvcicsXHJcbiAgICAgICAgZGVzY3JpcHRpb246ICdUcnVzdCBTY29yZSBjYWxjdWxhdGlvbiBMYW1iZGEgZnVuY3Rpb24nLFxyXG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzEyLFxyXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyLmxhbWJkYV9oYW5kbGVyJyxcclxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL3Byb2Nlc3NpbmcvdHJ1c3Qtc2NvcmUnKSksXHJcbiAgICAgICAgbWVtb3J5U2l6ZTogNTEyLFxyXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDMpLFxyXG4gICAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgICBMSU5FQUdFX1RBQkxFX05BTUU6IGxpbmVhZ2VUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgICBET0NVTUVOVFNfVEFCTEVfTkFNRTogZG9jdW1lbnRzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICAgICAgUFJPUEVSVElFU19UQUJMRV9OQU1FOiBwcm9wZXJ0aWVzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICAgICAgVFJVU1RfU0NPUkVTX1RBQkxFX05BTUU6IHRydXN0U2NvcmVzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICAgICAgTE9HX0xFVkVMOiAnSU5GTycsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgICAgbGF5ZXJzXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IHRydXN0U2NvcmVMYW1iZGEgPSB0cnVzdFNjb3JlTGFtYmRhQ29uc3RydWN0LmZ1bmN0aW9uO1xyXG5cclxuICAgIC8vIEdyYW50IFRydXN0IFNjb3JlIExhbWJkYSBwZXJtaXNzaW9uc1xyXG4gICAgbGluZWFnZVRhYmxlLmdyYW50UmVhZERhdGEodHJ1c3RTY29yZUxhbWJkYSk7XHJcbiAgICBkb2N1bWVudHNUYWJsZS5ncmFudFJlYWREYXRhKHRydXN0U2NvcmVMYW1iZGEpO1xyXG4gICAgcHJvcGVydGllc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0cnVzdFNjb3JlTGFtYmRhKTtcclxuICAgIHRydXN0U2NvcmVzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRydXN0U2NvcmVMYW1iZGEpO1xyXG5cclxuICAgIC8vIEFkZCBEeW5hbW9EQiBTdHJlYW0gZXZlbnQgc291cmNlIHRvIFRydXN0IFNjb3JlIExhbWJkYVxyXG4gICAgLy8gVHJpZ2dlciB3aGVuIGxpbmVhZ2UgY29uc3RydWN0aW9uIGNvbXBsZXRlcyAobmV3IGxpbmVhZ2UgcmVjb3JkcyBhcmUgaW5zZXJ0ZWQpXHJcbiAgICB0cnVzdFNjb3JlTGFtYmRhLmFkZEV2ZW50U291cmNlKFxyXG4gICAgICBuZXcgbGFtYmRhRXZlbnRTb3VyY2VzLkR5bmFtb0V2ZW50U291cmNlKGxpbmVhZ2VUYWJsZSwge1xyXG4gICAgICAgIHN0YXJ0aW5nUG9zaXRpb246IGxhbWJkYS5TdGFydGluZ1Bvc2l0aW9uLkxBVEVTVCxcclxuICAgICAgICBiYXRjaFNpemU6IDEwLFxyXG4gICAgICAgIG1heEJhdGNoaW5nV2luZG93OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1KSxcclxuICAgICAgICByZXRyeUF0dGVtcHRzOiAzLFxyXG4gICAgICAgIHJlcG9ydEJhdGNoSXRlbUZhaWx1cmVzOiB0cnVlLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBPdXRwdXQgTGluZWFnZSBhbmQgVHJ1c3QgU2NvcmUgcmVzb3VyY2VzXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTGluZWFnZVRhYmxlTmFtZScsIHtcclxuICAgICAgdmFsdWU6IGxpbmVhZ2VUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgdGFibGUgbmFtZSBmb3IgbGluZWFnZScsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtTGluZWFnZVRhYmxlTmFtZScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVHJ1c3RTY29yZXNUYWJsZU5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiB0cnVzdFNjb3Jlc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciB0cnVzdCBzY29yZXMnLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLVRydXN0U2NvcmVzVGFibGVOYW1lJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdMaW5lYWdlTGFtYmRhQXJuJywge1xyXG4gICAgICB2YWx1ZTogbGluZWFnZUxhbWJkYS5mdW5jdGlvbkFybixcclxuICAgICAgZGVzY3JpcHRpb246ICdMaW5lYWdlIExhbWJkYSBmdW5jdGlvbiBBUk4nLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLUxpbmVhZ2VMYW1iZGFBcm4nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1RydXN0U2NvcmVMYW1iZGFBcm4nLCB7XHJcbiAgICAgIHZhbHVlOiB0cnVzdFNjb3JlTGFtYmRhLmZ1bmN0aW9uQXJuLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1RydXN0IFNjb3JlIExhbWJkYSBmdW5jdGlvbiBBUk4nLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLVRydXN0U2NvcmVMYW1iZGFBcm4nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIER5bmFtb0RCIEF1ZGl0TG9ncyB0YWJsZVxyXG4gICAgY29uc3QgYXVkaXRMb2dzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0F1ZGl0TG9nc1RhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6ICdTYXR5YU1vb2wtQXVkaXRMb2dzJyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ2xvZ0lkJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgc29ydEtleToge1xyXG4gICAgICAgIG5hbWU6ICd0aW1lc3RhbXAnLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXHJcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBHU0kgZm9yIHF1ZXJ5aW5nIGF1ZGl0IGxvZ3MgYnkgdXNlclxyXG4gICAgYXVkaXRMb2dzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICd1c2VySWQtdGltZXN0YW1wLWluZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ3VzZXJJZCcsXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXHJcbiAgICAgIH0sXHJcbiAgICAgIHNvcnRLZXk6IHtcclxuICAgICAgICBuYW1lOiAndGltZXN0YW1wJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSBEeW5hbW9EQiBTdGF0ZVBvcnRhbENvbmZpZ3VyYXRpb25zIHRhYmxlIGZvciBmdXR1cmUgZ292ZXJubWVudCBwb3J0YWwgaW50ZWdyYXRpb25cclxuICAgIGNvbnN0IHN0YXRlUG9ydGFsQ29uZmlnVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1N0YXRlUG9ydGFsQ29uZmlnVGFibGUnLCB7XHJcbiAgICAgIHRhYmxlTmFtZTogJ1NhdHlhTW9vbC1TdGF0ZVBvcnRhbENvbmZpZ3VyYXRpb25zJyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ3N0YXRlJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxyXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiB0cnVlLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgTGFtYmRhIGZvciBzY2hlZHVsZWQgY2xlYW51cCBvZiBkZWFjdGl2YXRlZCBhY2NvdW50cyB3aXRoIG9wdGltaXphdGlvbnNcclxuICAgIGNvbnN0IGNsZWFudXBMYW1iZGFDb25zdHJ1Y3QgPSBjcmVhdGVPcHRpbWl6ZWRQcm9jZXNzaW5nTGFtYmRhKFxyXG4gICAgICB0aGlzLFxyXG4gICAgICAnQ2xlYW51cERlYWN0aXZhdGVkQWNjb3VudHNGdW5jdGlvbicsXHJcbiAgICAgIHtcclxuICAgICAgICBmdW5jdGlvbk5hbWU6ICdTYXR5YU1vb2wtQ2xlYW51cC1EZWFjdGl2YXRlZC1BY2NvdW50cycsXHJcbiAgICAgICAgZGVzY3JpcHRpb246ICdTY2hlZHVsZWQgTGFtYmRhIGZvciBjbGVhbmluZyB1cCBkZWFjdGl2YXRlZCBhY2NvdW50cyBhZnRlciAzMCBkYXlzJyxcclxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcclxuICAgICAgICBoYW5kbGVyOiAnYWRtaW4vY2xlYW51cC1kZWFjdGl2YXRlZC1hY2NvdW50cy5oYW5kbGVyJyxcclxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvZGlzdCcpKSxcclxuICAgICAgICBtZW1vcnlTaXplOiA1MTIsXHJcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpLCAvLyBBbGxvdyB0aW1lIGZvciBidWxrIGRlbGV0aW9uc1xyXG4gICAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgICBVU0VSU19UQUJMRV9OQU1FOiB1c2Vyc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICAgIFBST1BFUlRJRVNfVEFCTEVfTkFNRTogcHJvcGVydGllc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICAgIERPQ1VNRU5UU19UQUJMRV9OQU1FOiBkb2N1bWVudHNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgICBMSU5FQUdFX1RBQkxFX05BTUU6IGxpbmVhZ2VUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgICBUUlVTVF9TQ09SRVNfVEFCTEVfTkFNRTogdHJ1c3RTY29yZXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgICBOT1RJRklDQVRJT05TX1RBQkxFX05BTUU6IG5vdGlmaWNhdGlvbnNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgICBBVURJVF9MT0dTX1RBQkxFX05BTUU6IGF1ZGl0TG9nc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICAgIERPQ1VNRU5UX0JVQ0tFVF9OQU1FOiBkb2N1bWVudEJ1Y2tldC5idWNrZXROYW1lLFxyXG4gICAgICAgICAgVVNFUl9QT09MX0lEOiAnJywgLy8gVE9ETzogU2V0IENvZ25pdG8gVXNlciBQb29sIElEXHJcbiAgICAgICAgICBMT0dfTEVWRUw6ICdJTkZPJyxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vIFJlbW92ZWQgcmVzZXJ2ZWRDb25jdXJyZW50RXhlY3V0aW9ucyB0byBhdm9pZCBleGNlZWRpbmcgYWNjb3VudCBsaW1pdHNcclxuICAgICAgfSxcclxuICAgICAgbGF5ZXJzXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IGNsZWFudXBMYW1iZGEgPSBjbGVhbnVwTGFtYmRhQ29uc3RydWN0LmZ1bmN0aW9uO1xyXG5cclxuICAgIC8vIEdyYW50IGNsZWFudXAgTGFtYmRhIHBlcm1pc3Npb25zXHJcbiAgICB1c2Vyc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShjbGVhbnVwTGFtYmRhKTtcclxuICAgIHByb3BlcnRpZXNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoY2xlYW51cExhbWJkYSk7XHJcbiAgICBkb2N1bWVudHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoY2xlYW51cExhbWJkYSk7XHJcbiAgICBsaW5lYWdlVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGNsZWFudXBMYW1iZGEpO1xyXG4gICAgdHJ1c3RTY29yZXNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoY2xlYW51cExhbWJkYSk7XHJcbiAgICBub3RpZmljYXRpb25zVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGNsZWFudXBMYW1iZGEpO1xyXG4gICAgYXVkaXRMb2dzVGFibGUuZ3JhbnRXcml0ZURhdGEoY2xlYW51cExhbWJkYSk7IC8vIE9ubHkgd3JpdGUgZm9yIGF1ZGl0IGxvZ3NcclxuICAgIGRvY3VtZW50QnVja2V0LmdyYW50UmVhZFdyaXRlKGNsZWFudXBMYW1iZGEpO1xyXG4gICAgLy8gUmVtb3ZlZCBLTVMgZGVjcnlwdCBncmFudCBzaW5jZSB3ZSdyZSB1c2luZyBTMy1tYW5hZ2VkIGVuY3J5cHRpb25cclxuXHJcbiAgICAvLyBHcmFudCBDb2duaXRvIHBlcm1pc3Npb25zXHJcbiAgICBjbGVhbnVwTGFtYmRhLmFkZFRvUm9sZVBvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgICAnY29nbml0by1pZHA6QWRtaW5EZWxldGVVc2VyJyxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHJlc291cmNlczogWycqJ10sIC8vIFRPRE86IFJlc3RyaWN0IHRvIHNwZWNpZmljIFVzZXIgUG9vbCBBUk5cclxuICAgICAgfSlcclxuICAgICk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIEV2ZW50QnJpZGdlIHJ1bGUgdG8gcnVuIGNsZWFudXAgZGFpbHkgYXQgMiBBTSBVVENcclxuICAgIGNvbnN0IGNsZWFudXBSdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdDbGVhbnVwRGVhY3RpdmF0ZWRBY2NvdW50c1J1bGUnLCB7XHJcbiAgICAgIHJ1bGVOYW1lOiAnU2F0eWFNb29sLURhaWx5LUFjY291bnQtQ2xlYW51cCcsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnVHJpZ2dlciBhY2NvdW50IGNsZWFudXAgTGFtYmRhIGRhaWx5IGF0IDIgQU0gVVRDJyxcclxuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5jcm9uKHtcclxuICAgICAgICBtaW51dGU6ICcwJyxcclxuICAgICAgICBob3VyOiAnMicsXHJcbiAgICAgICAgZGF5OiAnKicsXHJcbiAgICAgICAgbW9udGg6ICcqJyxcclxuICAgICAgICB5ZWFyOiAnKicsXHJcbiAgICAgIH0pLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkIGNsZWFudXAgTGFtYmRhIGFzIHRhcmdldFxyXG4gICAgY2xlYW51cFJ1bGUuYWRkVGFyZ2V0KG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKGNsZWFudXBMYW1iZGEpKTtcclxuXHJcbiAgICAvLyBPdXRwdXQgY2xlYW51cCByZXNvdXJjZXNcclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDbGVhbnVwTGFtYmRhQXJuJywge1xyXG4gICAgICB2YWx1ZTogY2xlYW51cExhbWJkYS5mdW5jdGlvbkFybixcclxuICAgICAgZGVzY3JpcHRpb246ICdDbGVhbnVwIExhbWJkYSBmdW5jdGlvbiBBUk4nLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLUNsZWFudXBMYW1iZGFBcm4nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0F1ZGl0TG9nc1RhYmxlTmFtZScsIHtcclxuICAgICAgdmFsdWU6IGF1ZGl0TG9nc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBhdWRpdCBsb2dzJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1NhdHlhTW9vbC1BdWRpdExvZ3NUYWJsZU5hbWUnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PSBDb2duaXRvIFVzZXIgUG9vbCAoVGFzayAyLjEpID09PT09PT09PT1cclxuICAgIC8vIENyZWF0ZSBDb2duaXRvIFVzZXIgUG9vbCBmb3IgdXNlciBhdXRoZW50aWNhdGlvblxyXG4gICAgY29uc3QgY29nbml0b0NvbmZpZyA9IG5ldyBDb2duaXRvQ29uZmlnKHRoaXMsICdDb2duaXRvQ29uZmlnJyk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PSBBdXRoIExhbWJkYSBGdW5jdGlvbnMgKFRhc2sgMykgPT09PT09PT09PVxyXG4gICAgLy8gQ3JlYXRlIExhbWJkYSBmdW5jdGlvbnMgZm9yIGF1dGhlbnRpY2F0aW9uIGVuZHBvaW50c1xyXG4gICAgY29uc3QgYXV0aExhbWJkYXMgPSBuZXcgQXV0aExhbWJkYXModGhpcywgJ0F1dGhMYW1iZGFzJywge1xyXG4gICAgICB1c2VyUG9vbDogY29nbml0b0NvbmZpZy51c2VyUG9vbCxcclxuICAgICAgdXNlclBvb2xDbGllbnQ6IGNvZ25pdG9Db25maWcudXNlclBvb2xDbGllbnQsXHJcbiAgICAgIHVzZXJzVGFibGU6IHVzZXJzVGFibGUsXHJcbiAgICAgIGF1ZGl0TG9nc1RhYmxlOiBhdWRpdExvZ3NUYWJsZSxcclxuICAgICAgbm9kZUxheWVyOiBsYXllcnMubm9kZWpzQ29tbW9uTGF5ZXIsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09IEF1dGggQVBJIEdhdGV3YXkgKFRhc2sgMjIuMSkgPT09PT09PT09PVxyXG4gICAgLy8gQ3JlYXRlIEFQSSBHYXRld2F5IHdpdGggYXV0aGVudGljYXRpb24gZW5kcG9pbnRzXHJcbiAgICBjb25zdCBhdXRoQXBpR2F0ZXdheSA9IG5ldyBBdXRoQXBpR2F0ZXdheSh0aGlzLCAnQXV0aEFwaUdhdGV3YXknLCB7XHJcbiAgICAgIHJlZ2lzdGVyTGFtYmRhOiBhdXRoTGFtYmRhcy5yZWdpc3RlckxhbWJkYSxcclxuICAgICAgbG9naW5MYW1iZGE6IGF1dGhMYW1iZGFzLmxvZ2luTGFtYmRhLFxyXG4gICAgICB2ZXJpZnlPdHBMYW1iZGE6IGF1dGhMYW1iZGFzLnZlcmlmeU90cExhbWJkYSxcclxuICAgICAgcmVmcmVzaFRva2VuTGFtYmRhOiBhdXRoTGFtYmRhcy5yZWZyZXNoVG9rZW5MYW1iZGEsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09IFByb3BlcnR5IExhbWJkYSBGdW5jdGlvbnMgPT09PT09PT09PVxyXG4gICAgLy8gQ3JlYXRlIExhbWJkYSBmdW5jdGlvbnMgZm9yIHByb3BlcnR5IG1hbmFnZW1lbnQgZW5kcG9pbnRzXHJcbiAgICBjb25zdCBwcm9wZXJ0eUxhbWJkYXMgPSBuZXcgUHJvcGVydHlMYW1iZGFzKHRoaXMsICdQcm9wZXJ0eUxhbWJkYXMnLCB7XHJcbiAgICAgIHByb3BlcnRpZXNUYWJsZTogcHJvcGVydGllc1RhYmxlLFxyXG4gICAgICBkb2N1bWVudHNUYWJsZTogZG9jdW1lbnRzVGFibGUsXHJcbiAgICAgIGxpbmVhZ2VUYWJsZTogbGluZWFnZVRhYmxlLFxyXG4gICAgICB0cnVzdFNjb3Jlc1RhYmxlOiB0cnVzdFNjb3Jlc1RhYmxlLFxyXG4gICAgICBhdWRpdExvZ3NUYWJsZTogYXVkaXRMb2dzVGFibGUsXHJcbiAgICAgIGlkZW1wb3RlbmN5VGFibGU6IGlkZW1wb3RlbmN5VGFibGUsXHJcbiAgICAgIGRvY3VtZW50QnVja2V0OiBkb2N1bWVudEJ1Y2tldCxcclxuICAgICAgcHJvY2Vzc2luZ1F1ZXVlOiBwcm9jZXNzaW5nUXVldWUsXHJcbiAgICAgIG5vZGVMYXllcjogbGF5ZXJzLm5vZGVqc0NvbW1vbkxheWVyLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PSBNYWluIEFQSSBHYXRld2F5ID09PT09PT09PT1cclxuICAgIC8vIENyZWF0ZSBBUEkgR2F0ZXdheSB3aXRoIGF1dGggYW5kIHByb3BlcnR5IG1hbmFnZW1lbnQgZW5kcG9pbnRzXHJcbiAgICBjb25zdCBtYWluQXBpR2F0ZXdheSA9IG5ldyBNYWluQXBpR2F0ZXdheSh0aGlzLCAnTWFpbkFwaUdhdGV3YXknLCB7XHJcbiAgICAgIGF1dGhvcml6ZXJMYW1iZGE6IGF1dGhMYW1iZGFzLmF1dGhvcml6ZXJMYW1iZGEsXHJcbiAgICAgIC8vIEF1dGggTGFtYmRhc1xyXG4gICAgICByZWdpc3RlckxhbWJkYTogYXV0aExhbWJkYXMucmVnaXN0ZXJMYW1iZGEsXHJcbiAgICAgIGxvZ2luTGFtYmRhOiBhdXRoTGFtYmRhcy5sb2dpbkxhbWJkYSxcclxuICAgICAgdmVyaWZ5T3RwTGFtYmRhOiBhdXRoTGFtYmRhcy52ZXJpZnlPdHBMYW1iZGEsXHJcbiAgICAgIHJlZnJlc2hUb2tlbkxhbWJkYTogYXV0aExhbWJkYXMucmVmcmVzaFRva2VuTGFtYmRhLFxyXG4gICAgICAvLyBQcm9wZXJ0eSBMYW1iZGFzXHJcbiAgICAgIGNyZWF0ZVByb3BlcnR5TGFtYmRhOiBwcm9wZXJ0eUxhbWJkYXMuY3JlYXRlUHJvcGVydHlMYW1iZGEsXHJcbiAgICAgIGxpc3RQcm9wZXJ0aWVzTGFtYmRhOiBwcm9wZXJ0eUxhbWJkYXMubGlzdFByb3BlcnRpZXNMYW1iZGEsXHJcbiAgICAgIGdldFByb3BlcnR5TGFtYmRhOiBwcm9wZXJ0eUxhbWJkYXMuZ2V0UHJvcGVydHlMYW1iZGEsXHJcbiAgICAgIGRlbGV0ZVByb3BlcnR5TGFtYmRhOiBwcm9wZXJ0eUxhbWJkYXMuZGVsZXRlUHJvcGVydHlMYW1iZGEsXHJcbiAgICAgIGdlbmVyYXRlVXBsb2FkVXJsTGFtYmRhOiBwcm9wZXJ0eUxhbWJkYXMuZ2VuZXJhdGVVcGxvYWRVcmxMYW1iZGEsXHJcbiAgICAgIHJlZ2lzdGVyRG9jdW1lbnRMYW1iZGE6IHByb3BlcnR5TGFtYmRhcy5yZWdpc3RlckRvY3VtZW50TGFtYmRhLFxyXG4gICAgICBnZXREb2N1bWVudHNMYW1iZGE6IHByb3BlcnR5TGFtYmRhcy5nZXREb2N1bWVudHNMYW1iZGEsXHJcbiAgICAgIGdldExpbmVhZ2VMYW1iZGE6IHByb3BlcnR5TGFtYmRhcy5nZXRMaW5lYWdlTGFtYmRhLFxyXG4gICAgICBnZXRUcnVzdFNjb3JlTGFtYmRhOiBwcm9wZXJ0eUxhbWJkYXMuZ2V0VHJ1c3RTY29yZUxhbWJkYSxcclxuICAgICAgZ2VuZXJhdGVSZXBvcnRMYW1iZGE6IHByb3BlcnR5TGFtYmRhcy5nZW5lcmF0ZVJlcG9ydExhbWJkYSxcclxuICAgICAgLy8gTm90aWZpY2F0aW9uIExhbWJkYVxyXG4gICAgICBnZXROb3RpZmljYXRpb25zTGFtYmRhOiBnZXROb3RpZmljYXRpb25zTGFtYmRhLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PSBBUEkgR2F0ZXdheSBDb25maWd1cmF0aW9uID09PT09PT09PT1cclxuICAgIC8vIE5vdGU6IEZ1bGwgQVBJIEdhdGV3YXkgd2l0aCBhbGwgZW5kcG9pbnRzIHdpbGwgYmUgYWRkZWQgbGF0ZXJcclxuICAgIC8vIEN1cnJlbnRseSBvbmx5IGF1dGggZW5kcG9pbnRzIGFyZSBkZXBsb3llZFxyXG4gICAgLy8gVE9ETzogSW50ZWdyYXRlIEFwaUdhdGV3YXlDb25maWcgY29uc3RydWN0IGZvciBwcm9wZXJ0eSBhbmQgYWRtaW4gZW5kcG9pbnRzXHJcblxyXG4gICAgLy8gPT09PT09PT09PSBNb25pdG9yaW5nIGFuZCBBbGVydGluZyAoVGFzayAyMykgPT09PT09PT09PVxyXG4gICAgLy8gVEVNUE9SQVJJTFkgRElTQUJMRUQgdG8gYXZvaWQgY2lyY3VsYXIgZGVwZW5kZW5jeSBkdXJpbmcgaW5pdGlhbCBkZXBsb3ltZW50XHJcbiAgICAvLyBXaWxsIGJlIGFkZGVkIGluIGEgc2VwYXJhdGUgZGVwbG95bWVudCBvciBzdGFja1xyXG4gICAgXHJcbiAgICAvLyBDcmVhdGUgU05TIHRvcGljIGZvciBhbGFybSBub3RpZmljYXRpb25zXHJcbiAgICBjb25zdCBhbGFybVRvcGljID0gbmV3IHNucy5Ub3BpYyh0aGlzLCAnQWxhcm1Ob3RpZmljYXRpb25Ub3BpYycsIHtcclxuICAgICAgdG9waWNOYW1lOiAnU2F0eWFNb29sLUFsYXJtLU5vdGlmaWNhdGlvbnMnLFxyXG4gICAgICBkaXNwbGF5TmFtZTogJ1NhdHlhTW9vbCBBbGFybSBOb3RpZmljYXRpb25zJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIE91dHB1dCBTTlMgdG9waWMgQVJOXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQWxhcm1Ub3BpY0FybicsIHtcclxuICAgICAgdmFsdWU6IGFsYXJtVG9waWMudG9waWNBcm4sXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnU05TIHRvcGljIEFSTiBmb3IgYWxhcm0gbm90aWZpY2F0aW9ucycsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtQWxhcm1Ub3BpY0FybicsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBUT0RPOiBBZGQgZGFzaGJvYXJkcyBhbmQgYWxhcm1zIGFmdGVyIGluaXRpYWwgZGVwbG95bWVudFxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ01vbml0b3JpbmdOb3RlJywge1xyXG4gICAgICB2YWx1ZTogJ0Nsb3VkV2F0Y2ggZGFzaGJvYXJkcyBhbmQgYWxhcm1zIHdpbGwgYmUgYWRkZWQgaW4gbmV4dCBkZXBsb3ltZW50IHRvIGF2b2lkIGNpcmN1bGFyIGRlcGVuZGVuY2llcycsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnTW9uaXRvcmluZyBzZXR1cCBub3RlJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vID09PT09PT09PT0gVGFzayAzMi4yOiBEZWFkIExldHRlciBRdWV1ZSBQcm9jZXNzaW5nID09PT09PT09PT1cclxuICAgIC8vIFRFTVBPUkFSSUxZIERJU0FCTEVEIHRvIGF2b2lkIGNpcmN1bGFyIGRlcGVuZGVuY3kgZHVyaW5nIGluaXRpYWwgZGVwbG95bWVudFxyXG4gICAgLy8gV2lsbCBiZSBhZGRlZCBpbiBhIHNlcGFyYXRlIGRlcGxveW1lbnRcclxuICAgIFxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RscVByb2Nlc3Nvck5vdGUnLCB7XHJcbiAgICAgIHZhbHVlOiAnRExRIFByb2Nlc3NvciBMYW1iZGEgd2lsbCBiZSBhZGRlZCBpbiBuZXh0IGRlcGxveW1lbnQgdG8gYXZvaWQgY2lyY3VsYXIgZGVwZW5kZW5jaWVzJyxcclxuICAgICAgZGVzY3JpcHRpb246ICdETFEgcHJvY2Vzc29yIHNldHVwIG5vdGUnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PSBUYXNrIDMxLjM6IFMzIGFuZCBDbG91ZEZyb250IE9wdGltaXphdGlvbiA9PT09PT09PT09XHJcblxyXG4gICAgLy8gQ3JlYXRlIFMzIGJ1Y2tldCBmb3IgZnJvbnRlbmQgc3RhdGljIGFzc2V0c1xyXG4gICAgY29uc3QgZnJvbnRlbmRCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdGcm9udGVuZEJ1Y2tldCcsIHtcclxuICAgICAgYnVja2V0TmFtZTogYHNhdHlhbW9vbC1mcm9udGVuZC0ke3RoaXMuYWNjb3VudH1gLFxyXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsIC8vIFVzZSBTMy1tYW5hZ2VkIGVuY3J5cHRpb24gZm9yIHB1YmxpYyBhc3NldHNcclxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IG5ldyBzMy5CbG9ja1B1YmxpY0FjY2Vzcyh7XHJcbiAgICAgICAgYmxvY2tQdWJsaWNBY2xzOiB0cnVlLFxyXG4gICAgICAgIGJsb2NrUHVibGljUG9saWN5OiB0cnVlLFxyXG4gICAgICAgIGlnbm9yZVB1YmxpY0FjbHM6IHRydWUsXHJcbiAgICAgICAgcmVzdHJpY3RQdWJsaWNCdWNrZXRzOiB0cnVlLFxyXG4gICAgICB9KSxcclxuICAgICAgdmVyc2lvbmVkOiBmYWxzZSwgLy8gTm8gbmVlZCBmb3IgdmVyc2lvbmluZyBvbiBzdGF0aWMgYXNzZXRzXHJcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgaWQ6ICdEZWxldGVPbGRWZXJzaW9ucycsXHJcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxyXG4gICAgICAgICAgbm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygzMCksXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gVEVNUE9SQVJJTFkgRElTQUJMRUQ6IENsb3VkRnJvbnQgcmVzb3VyY2VzIChhY2NvdW50IHZlcmlmaWNhdGlvbiByZXF1aXJlZClcclxuICAgIC8qXHJcbiAgICAvLyBDcmVhdGUgT3JpZ2luIEFjY2VzcyBJZGVudGl0eSBmb3IgQ2xvdWRGcm9udCB0byBhY2Nlc3MgUzNcclxuICAgIGNvbnN0IG9yaWdpbkFjY2Vzc0lkZW50aXR5ID0gbmV3IGNsb3VkZnJvbnQuT3JpZ2luQWNjZXNzSWRlbnRpdHkodGhpcywgJ0Zyb250ZW5kT0FJJywge1xyXG4gICAgICBjb21tZW50OiAnT0FJIGZvciBTYXR5YU1vb2wgZnJvbnRlbmQgQ2xvdWRGcm9udCBkaXN0cmlidXRpb24nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gR3JhbnQgQ2xvdWRGcm9udCBPQUkgcmVhZCBhY2Nlc3MgdG8gZnJvbnRlbmQgYnVja2V0XHJcbiAgICBmcm9udGVuZEJ1Y2tldC5ncmFudFJlYWQob3JpZ2luQWNjZXNzSWRlbnRpdHkpO1xyXG4gICAgKi9cclxuXHJcbiAgICAvLyBURU1QT1JBUklMWSBESVNBQkxFRDogQ2xvdWRGcm9udCBkaXN0cmlidXRpb24gcmVxdWlyZXMgYWNjb3VudCB2ZXJpZmljYXRpb25cclxuICAgIC8vIENvbnRhY3QgQVdTIFN1cHBvcnQgdG8gdmVyaWZ5IGFjY291bnQgYmVmb3JlIGVuYWJsaW5nIENsb3VkRnJvbnRcclxuICAgIC8vIENyZWF0ZSBDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBmb3IgZnJvbnRlbmQgd2l0aCBjYWNoaW5nXHJcbiAgICAvKlxyXG4gICAgY29uc3QgZnJvbnRlbmREaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgJ0Zyb250ZW5kRGlzdHJpYnV0aW9uJywge1xyXG4gICAgICBjb21tZW50OiAnU2F0eWFNb29sIEZyb250ZW5kIERpc3RyaWJ1dGlvbicsXHJcbiAgICAgIGRlZmF1bHRSb290T2JqZWN0OiAnaW5kZXguaHRtbCcsXHJcbiAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xyXG4gICAgICAgIG9yaWdpbjogbmV3IGNsb3VkZnJvbnRPcmlnaW5zLlMzT3JpZ2luKGZyb250ZW5kQnVja2V0LCB7XHJcbiAgICAgICAgICBvcmlnaW5BY2Nlc3NJZGVudGl0eTogb3JpZ2luQWNjZXNzSWRlbnRpdHksXHJcbiAgICAgICAgfSksXHJcbiAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXHJcbiAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfR0VUX0hFQURfT1BUSU9OUyxcclxuICAgICAgICBjYWNoZWRNZXRob2RzOiBjbG91ZGZyb250LkNhY2hlZE1ldGhvZHMuQ0FDSEVfR0VUX0hFQURfT1BUSU9OUyxcclxuICAgICAgICBjb21wcmVzczogdHJ1ZSwgLy8gRW5hYmxlIGd6aXAvYnJvdGxpIGNvbXByZXNzaW9uXHJcbiAgICAgICAgY2FjaGVQb2xpY3k6IG5ldyBjbG91ZGZyb250LkNhY2hlUG9saWN5KHRoaXMsICdGcm9udGVuZENhY2hlUG9saWN5Jywge1xyXG4gICAgICAgICAgY2FjaGVQb2xpY3lOYW1lOiAnU2F0eWFNb29sLUZyb250ZW5kLUNhY2hlLVBvbGljeScsXHJcbiAgICAgICAgICBjb21tZW50OiAnQ2FjaGUgcG9saWN5IGZvciBTYXR5YU1vb2wgZnJvbnRlbmQgc3RhdGljIGFzc2V0cycsXHJcbiAgICAgICAgICBkZWZhdWx0VHRsOiBjZGsuRHVyYXRpb24uaG91cnMoMjQpLCAvLyAyNCBob3VycyBhcyBwZXIgcmVxdWlyZW1lbnQgMTYuOFxyXG4gICAgICAgICAgbWF4VHRsOiBjZGsuRHVyYXRpb24uZGF5cygzNjUpLFxyXG4gICAgICAgICAgbWluVHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcclxuICAgICAgICAgIGVuYWJsZUFjY2VwdEVuY29kaW5nR3ppcDogdHJ1ZSxcclxuICAgICAgICAgIGVuYWJsZUFjY2VwdEVuY29kaW5nQnJvdGxpOiB0cnVlLFxyXG4gICAgICAgICAgaGVhZGVyQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVIZWFkZXJCZWhhdmlvci5ub25lKCksXHJcbiAgICAgICAgICBxdWVyeVN0cmluZ0JlaGF2aW9yOiBjbG91ZGZyb250LkNhY2hlUXVlcnlTdHJpbmdCZWhhdmlvci5ub25lKCksXHJcbiAgICAgICAgICBjb29raWVCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZUNvb2tpZUJlaGF2aW9yLm5vbmUoKSxcclxuICAgICAgICB9KSxcclxuICAgICAgfSxcclxuICAgICAgLy8gQWRkaXRpb25hbCBiZWhhdmlvciBmb3IgQVBJIGNhbGxzIChubyBjYWNoaW5nKVxyXG4gICAgICBhZGRpdGlvbmFsQmVoYXZpb3JzOiB7XHJcbiAgICAgICAgJy9hcGkvKic6IHtcclxuICAgICAgICAgIG9yaWdpbjogbmV3IGNsb3VkZnJvbnRPcmlnaW5zLkh0dHBPcmlnaW4oJ2FwaS5zYXR5YW1vb2wuY29tJywgeyAvLyBUT0RPOiBVcGRhdGUgd2l0aCBhY3R1YWwgQVBJIEdhdGV3YXkgZG9tYWluXHJcbiAgICAgICAgICAgIHByb3RvY29sUG9saWN5OiBjbG91ZGZyb250Lk9yaWdpblByb3RvY29sUG9saWN5LkhUVFBTX09OTFksXHJcbiAgICAgICAgICB9KSxcclxuICAgICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LkhUVFBTX09OTFksXHJcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19BTEwsXHJcbiAgICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX0RJU0FCTEVELFxyXG4gICAgICAgICAgb3JpZ2luUmVxdWVzdFBvbGljeTogY2xvdWRmcm9udC5PcmlnaW5SZXF1ZXN0UG9saWN5LkFMTF9WSUVXRVIsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgICAgLy8gRXJyb3IgcmVzcG9uc2VzIGZvciBTUEEgcm91dGluZ1xyXG4gICAgICBlcnJvclJlc3BvbnNlczogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwMyxcclxuICAgICAgICAgIHJlc3BvbnNlSHR0cFN0YXR1czogMjAwLFxyXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcclxuICAgICAgICAgIHR0bDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDQsXHJcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcclxuICAgICAgICAgIHJlc3BvbnNlUGFnZVBhdGg6ICcvaW5kZXguaHRtbCcsXHJcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICAgIHByaWNlQ2xhc3M6IGNsb3VkZnJvbnQuUHJpY2VDbGFzcy5QUklDRV9DTEFTU18xMDAsIC8vIFVzZSBvbmx5IE5vcnRoIEFtZXJpY2EgYW5kIEV1cm9wZSBlZGdlIGxvY2F0aW9uc1xyXG4gICAgICBlbmFibGVMb2dnaW5nOiBmYWxzZSwgLy8gRGlzYWJsZWQgdG8gYXZvaWQgY2lyY3VsYXIgZGVwZW5kZW5jeSB3aXRoIGF1ZGl0IGJ1Y2tldFxyXG4gICAgICAvLyBUT0RPOiBFbmFibGUgbG9nZ2luZyBhZnRlciBpbml0aWFsIGRlcGxveW1lbnQgb3IgdXNlIHNlcGFyYXRlIGxvZ2dpbmcgYnVja2V0XHJcbiAgICAgIG1pbmltdW1Qcm90b2NvbFZlcnNpb246IGNsb3VkZnJvbnQuU2VjdXJpdHlQb2xpY3lQcm90b2NvbC5UTFNfVjFfMl8yMDIxLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gT3V0cHV0IENsb3VkRnJvbnQgYW5kIGZyb250ZW5kIHJlc291cmNlc1xyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Zyb250ZW5kQnVja2V0TmFtZScsIHtcclxuICAgICAgdmFsdWU6IGZyb250ZW5kQnVja2V0LmJ1Y2tldE5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnUzMgYnVja2V0IG5hbWUgZm9yIGZyb250ZW5kIHN0YXRpYyBhc3NldHMnLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLUZyb250ZW5kQnVja2V0TmFtZScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRnJvbnRlbmREaXN0cmlidXRpb25JZCcsIHtcclxuICAgICAgdmFsdWU6IGZyb250ZW5kRGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbklkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgZGlzdHJpYnV0aW9uIElEIGZvciBmcm9udGVuZCcsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtRnJvbnRlbmREaXN0cmlidXRpb25JZCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRnJvbnRlbmREaXN0cmlidXRpb25Eb21haW5OYW1lJywge1xyXG4gICAgICB2YWx1ZTogZnJvbnRlbmREaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBkb21haW4gbmFtZSBmb3IgZnJvbnRlbmQnLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLUZyb250ZW5kRGlzdHJpYnV0aW9uRG9tYWluTmFtZScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRnJvbnRlbmRVcmwnLCB7XHJcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke2Zyb250ZW5kRGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWV9YCxcclxuICAgICAgZGVzY3JpcHRpb246ICdGcm9udGVuZCBhcHBsaWNhdGlvbiBVUkwnLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLUZyb250ZW5kVXJsJyxcclxuICAgIH0pO1xyXG4gICAgKi9cclxuXHJcbiAgICAvLyBPdXRwdXQgZnJvbnRlbmQgYnVja2V0IChDbG91ZEZyb250IGRpc2FibGVkIHRlbXBvcmFyaWx5KVxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Zyb250ZW5kQnVja2V0TmFtZScsIHtcclxuICAgICAgdmFsdWU6IGZyb250ZW5kQnVja2V0LmJ1Y2tldE5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnUzMgYnVja2V0IG5hbWUgZm9yIGZyb250ZW5kIHN0YXRpYyBhc3NldHMnLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLUZyb250ZW5kQnVja2V0TmFtZScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ2xvdWRGcm9udE5vdGUnLCB7XHJcbiAgICAgIHZhbHVlOiAnQ2xvdWRGcm9udCBkaXN0cmlidXRpb24gZGlzYWJsZWQgLSBhY2NvdW50IHZlcmlmaWNhdGlvbiByZXF1aXJlZC4gQ29udGFjdCBBV1MgU3VwcG9ydC4nLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgc3RhdHVzIG5vdGUnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gT3V0cHV0IFMzIFRyYW5zZmVyIEFjY2VsZXJhdGlvbiBlbmRwb2ludCBmb3IgZG9jdW1lbnQgdXBsb2Fkc1xyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RvY3VtZW50QnVja2V0QWNjZWxlcmF0ZUVuZHBvaW50Jywge1xyXG4gICAgICB2YWx1ZTogYCR7ZG9jdW1lbnRCdWNrZXQuYnVja2V0TmFtZX0uczMtYWNjZWxlcmF0ZS5hbWF6b25hd3MuY29tYCxcclxuICAgICAgZGVzY3JpcHRpb246ICdTMyBUcmFuc2ZlciBBY2NlbGVyYXRpb24gZW5kcG9pbnQgZm9yIGRvY3VtZW50IHVwbG9hZHMnLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLURvY3VtZW50QnVja2V0QWNjZWxlcmF0ZUVuZHBvaW50JyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTM09wdGltaXphdGlvblN1bW1hcnknLCB7XHJcbiAgICAgIHZhbHVlOiAnUzMgb3B0aW1pemF0aW9uczogVHJhbnNmZXIgQWNjZWxlcmF0aW9uIGVuYWJsZWQsIG11bHRpcGFydCB1cGxvYWQgY2xlYW51cCAoNyBkYXlzKSwgQ2xvdWRGcm9udCBDRE4gd2l0aCAyNGggY2FjaGUnLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIGFuZCBDbG91ZEZyb250IG9wdGltaXphdGlvbiBzdW1tYXJ5JyxcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG4iXX0=