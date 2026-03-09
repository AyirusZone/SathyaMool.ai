import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface PropertyLambdasProps {
  propertiesTable: dynamodb.ITable;
  documentsTable: dynamodb.ITable;
  lineageTable: dynamodb.ITable;
  trustScoresTable: dynamodb.ITable;
  auditLogsTable: dynamodb.ITable;
  idempotencyTable: dynamodb.ITable;
  documentBucket: s3.IBucket;
  processingQueue: sqs.IQueue;
  nodeLayer?: lambda.ILayerVersion;
}

export class PropertyLambdas extends Construct {
  public readonly createPropertyLambda: lambda.Function;
  public readonly listPropertiesLambda: lambda.Function;
  public readonly getPropertyLambda: lambda.Function;
  public readonly deletePropertyLambda: lambda.Function;
  public readonly generateUploadUrlLambda: lambda.Function;
  public readonly registerDocumentLambda: lambda.Function;
  public readonly getDocumentsLambda: lambda.Function;
  public readonly getLineageLambda: lambda.Function;
  public readonly getTrustScoreLambda: lambda.Function;
  public readonly generateReportLambda: lambda.Function;

  constructor(scope: Construct, id: string, props: PropertyLambdasProps) {
    super(scope, id);

    const commonEnv = {
      PROPERTIES_TABLE_NAME: props.propertiesTable.tableName,
      DOCUMENTS_TABLE_NAME: props.documentsTable.tableName,
      LINEAGE_TABLE_NAME: props.lineageTable.tableName,
      TRUST_SCORES_TABLE_NAME: props.trustScoresTable.tableName,
      AUDIT_LOGS_TABLE_NAME: props.auditLogsTable.tableName,
      IDEMPOTENCY_TABLE_NAME: props.idempotencyTable.tableName,
      DOCUMENT_BUCKET_NAME: props.documentBucket.bucketName,
      PROCESSING_QUEUE_URL: props.processingQueue.queueUrl,
    };

    const commonConfig = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      layers: props.nodeLayer ? [props.nodeLayer] : [],
      tracing: lambda.Tracing.ACTIVE,
      logRetention: 7,
    };

    // Create Property Lambda
    this.createPropertyLambda = new lambda.Function(this, 'CreatePropertyFunction', {
      ...commonConfig,
      functionName: 'SatyaMool-CreateProperty',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      handler: 'properties/create-property.handler',
    });

    // List Properties Lambda
    this.listPropertiesLambda = new lambda.Function(this, 'ListPropertiesFunction', {
      ...commonConfig,
      functionName: 'SatyaMool-ListProperties',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      handler: 'properties/list-properties.handler',
    });

    // Get Property Lambda
    this.getPropertyLambda = new lambda.Function(this, 'GetPropertyFunction', {
      ...commonConfig,
      functionName: 'SatyaMool-GetProperty',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      handler: 'properties/get-property.handler',
    });

    // Delete Property Lambda
    this.deletePropertyLambda = new lambda.Function(this, 'DeletePropertyFunction', {
      ...commonConfig,
      functionName: 'SatyaMool-DeleteProperty',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      handler: 'properties/delete-property.handler',
    });

    // Generate Upload URL Lambda
    this.generateUploadUrlLambda = new lambda.Function(this, 'GenerateUploadUrlFunction', {
      ...commonConfig,
      functionName: 'SatyaMool-GenerateUploadUrl',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      handler: 'properties/generate-upload-url.handler',
    });

    // Register Document Lambda
    this.registerDocumentLambda = new lambda.Function(this, 'RegisterDocumentFunction', {
      ...commonConfig,
      functionName: 'SatyaMool-RegisterDocument',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      handler: 'properties/register-document.handler',
    });

    // Get Documents Lambda
    this.getDocumentsLambda = new lambda.Function(this, 'GetDocumentsFunction', {
      ...commonConfig,
      functionName: 'SatyaMool-GetDocuments',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      handler: 'properties/get-documents.handler',
    });

    // Get Lineage Lambda
    this.getLineageLambda = new lambda.Function(this, 'GetLineageFunction', {
      ...commonConfig,
      functionName: 'SatyaMool-GetLineage',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      handler: 'properties/get-lineage.handler',
    });

    // Get Trust Score Lambda
    this.getTrustScoreLambda = new lambda.Function(this, 'GetTrustScoreFunction', {
      ...commonConfig,
      functionName: 'SatyaMool-GetTrustScore',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      handler: 'properties/get-trust-score.handler',
    });

    // Generate Report Lambda
    this.generateReportLambda = new lambda.Function(this, 'GenerateReportFunction', {
      ...commonConfig,
      functionName: 'SatyaMool-GenerateReport',
      timeout: cdk.Duration.seconds(60),
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      handler: 'properties/generate-report.handler',
    });

    // Grant permissions
    const allLambdas = [
      this.createPropertyLambda,
      this.listPropertiesLambda,
      this.getPropertyLambda,
      this.deletePropertyLambda,
      this.generateUploadUrlLambda,
      this.registerDocumentLambda,
      this.getDocumentsLambda,
      this.getLineageLambda,
      this.getTrustScoreLambda,
      this.generateReportLambda,
    ];

    allLambdas.forEach(fn => {
      props.propertiesTable.grantReadWriteData(fn);
      props.documentsTable.grantReadWriteData(fn);
      props.lineageTable.grantReadWriteData(fn);
      props.trustScoresTable.grantReadWriteData(fn);
      props.auditLogsTable.grantWriteData(fn);
      props.idempotencyTable.grantReadWriteData(fn);
      props.documentBucket.grantReadWrite(fn);
      props.processingQueue.grantSendMessages(fn);
    });
  }
}
