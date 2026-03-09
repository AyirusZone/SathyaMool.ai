import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
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
export declare class PropertyLambdas extends Construct {
    readonly createPropertyLambda: lambda.Function;
    readonly listPropertiesLambda: lambda.Function;
    readonly getPropertyLambda: lambda.Function;
    readonly deletePropertyLambda: lambda.Function;
    readonly generateUploadUrlLambda: lambda.Function;
    readonly registerDocumentLambda: lambda.Function;
    readonly getDocumentsLambda: lambda.Function;
    readonly getLineageLambda: lambda.Function;
    readonly getTrustScoreLambda: lambda.Function;
    readonly generateReportLambda: lambda.Function;
    constructor(scope: Construct, id: string, props: PropertyLambdasProps);
}
