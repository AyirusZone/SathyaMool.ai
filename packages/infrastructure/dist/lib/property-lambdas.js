"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PropertyLambdas = void 0;
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const constructs_1 = require("constructs");
const path = require("path");
class PropertyLambdas extends constructs_1.Construct {
    constructor(scope, id, props) {
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
exports.PropertyLambdas = PropertyLambdas;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvcGVydHktbGFtYmRhcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9wcm9wZXJ0eS1sYW1iZGFzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQyxpREFBaUQ7QUFJakQsMkNBQXVDO0FBQ3ZDLDZCQUE2QjtBQWM3QixNQUFhLGVBQWdCLFNBQVEsc0JBQVM7SUFZNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUNuRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sU0FBUyxHQUFHO1lBQ2hCLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxlQUFlLENBQUMsU0FBUztZQUN0RCxvQkFBb0IsRUFBRSxLQUFLLENBQUMsY0FBYyxDQUFDLFNBQVM7WUFDcEQsa0JBQWtCLEVBQUUsS0FBSyxDQUFDLFlBQVksQ0FBQyxTQUFTO1lBQ2hELHVCQUF1QixFQUFFLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTO1lBQ3pELHFCQUFxQixFQUFFLEtBQUssQ0FBQyxjQUFjLENBQUMsU0FBUztZQUNyRCxzQkFBc0IsRUFBRSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsU0FBUztZQUN4RCxvQkFBb0IsRUFBRSxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQVU7WUFDckQsb0JBQW9CLEVBQUUsS0FBSyxDQUFDLGVBQWUsQ0FBQyxRQUFRO1NBQ3JELENBQUM7UUFFRixNQUFNLFlBQVksR0FBRztZQUNuQixPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLFlBQVksRUFBRSxNQUFNLENBQUMsWUFBWSxDQUFDLE1BQU07WUFDeEMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxVQUFVLEVBQUUsR0FBRztZQUNmLFdBQVcsRUFBRSxTQUFTO1lBQ3RCLE1BQU0sRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFD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bmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcclxuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcclxuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcclxuaW1wb3J0ICogYXMgc3FzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zcXMnO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgUHJvcGVydHlMYW1iZGFzUHJvcHMge1xyXG4gIHByb3BlcnRpZXNUYWJsZTogZHluYW1vZGIuSVRhYmxlO1xyXG4gIGRvY3VtZW50c1RhYmxlOiBkeW5hbW9kYi5JVGFibGU7XHJcbiAgbGluZWFnZVRhYmxlOiBkeW5hbW9kYi5JVGFibGU7XHJcbiAgdHJ1c3RTY29yZXNUYWJsZTogZHluYW1vZGIuSVRhYmxlO1xyXG4gIGF1ZGl0TG9nc1RhYmxlOiBkeW5hbW9kYi5JVGFibGU7XHJcbiAgaWRlbXBvdGVuY3lUYWJsZTogZHluYW1vZGIuSVRhYmxlO1xyXG4gIGRvY3VtZW50QnVja2V0OiBzMy5JQnVja2V0O1xyXG4gIHByb2Nlc3NpbmdRdWV1ZTogc3FzLklRdWV1ZTtcclxuICBub2RlTGF5ZXI/OiBsYW1iZGEuSUxheWVyVmVyc2lvbjtcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFByb3BlcnR5TGFtYmRhcyBleHRlbmRzIENvbnN0cnVjdCB7XHJcbiAgcHVibGljIHJlYWRvbmx5IGNyZWF0ZVByb3BlcnR5TGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XHJcbiAgcHVibGljIHJlYWRvbmx5IGxpc3RQcm9wZXJ0aWVzTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XHJcbiAgcHVibGljIHJlYWRvbmx5IGdldFByb3BlcnR5TGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XHJcbiAgcHVibGljIHJlYWRvbmx5IGRlbGV0ZVByb3BlcnR5TGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XHJcbiAgcHVibGljIHJlYWRvbmx5IGdlbmVyYXRlVXBsb2FkVXJsTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XHJcbiAgcHVibGljIHJlYWRvbmx5IHJlZ2lzdGVyRG9jdW1lbnRMYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcclxuICBwdWJsaWMgcmVhZG9ubHkgZ2V0RG9jdW1lbnRzTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XHJcbiAgcHVibGljIHJlYWRvbmx5IGdldExpbmVhZ2VMYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcclxuICBwdWJsaWMgcmVhZG9ubHkgZ2V0VHJ1c3RTY29yZUxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xyXG4gIHB1YmxpYyByZWFkb25seSBnZW5lcmF0ZVJlcG9ydExhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogUHJvcGVydHlMYW1iZGFzUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCk7XHJcblxyXG4gICAgY29uc3QgY29tbW9uRW52ID0ge1xyXG4gICAgICBQUk9QRVJUSUVTX1RBQkxFX05BTUU6IHByb3BzLnByb3BlcnRpZXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIERPQ1VNRU5UU19UQUJMRV9OQU1FOiBwcm9wcy5kb2N1bWVudHNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIExJTkVBR0VfVEFCTEVfTkFNRTogcHJvcHMubGluZWFnZVRhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgVFJVU1RfU0NPUkVTX1RBQkxFX05BTUU6IHByb3BzLnRydXN0U2NvcmVzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICBBVURJVF9MT0dTX1RBQkxFX05BTUU6IHByb3BzLmF1ZGl0TG9nc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgSURFTVBPVEVOQ1lfVEFCTEVfTkFNRTogcHJvcHMuaWRlbXBvdGVuY3lUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIERPQ1VNRU5UX0JVQ0tFVF9OQU1FOiBwcm9wcy5kb2N1bWVudEJ1Y2tldC5idWNrZXROYW1lLFxyXG4gICAgICBQUk9DRVNTSU5HX1FVRVVFX1VSTDogcHJvcHMucHJvY2Vzc2luZ1F1ZXVlLnF1ZXVlVXJsLFxyXG4gICAgfTtcclxuXHJcbiAgICBjb25zdCBjb21tb25Db25maWcgPSB7XHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxyXG4gICAgICBhcmNoaXRlY3R1cmU6IGxhbWJkYS5BcmNoaXRlY3R1cmUuQVJNXzY0LFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXHJcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgICAgbGF5ZXJzOiBwcm9wcy5ub2RlTGF5ZXIgPyBbcHJvcHMubm9kZUxheWVyXSA6IFtdLFxyXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsXHJcbiAgICAgIGxvZ1JldGVudGlvbjogNyxcclxuICAgIH07XHJcblxyXG4gICAgLy8gQ3JlYXRlIFByb3BlcnR5IExhbWJkYVxyXG4gICAgdGhpcy5jcmVhdGVQcm9wZXJ0eUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0NyZWF0ZVByb3BlcnR5RnVuY3Rpb24nLCB7XHJcbiAgICAgIC4uLmNvbW1vbkNvbmZpZyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiAnU2F0eWFNb29sLUNyZWF0ZVByb3BlcnR5JyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL2Rpc3QnKSksXHJcbiAgICAgIGhhbmRsZXI6ICdwcm9wZXJ0aWVzL2NyZWF0ZS1wcm9wZXJ0eS5oYW5kbGVyJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIExpc3QgUHJvcGVydGllcyBMYW1iZGFcclxuICAgIHRoaXMubGlzdFByb3BlcnRpZXNMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdMaXN0UHJvcGVydGllc0Z1bmN0aW9uJywge1xyXG4gICAgICAuLi5jb21tb25Db25maWcsXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ1NhdHlhTW9vbC1MaXN0UHJvcGVydGllcycsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9kaXN0JykpLFxyXG4gICAgICBoYW5kbGVyOiAncHJvcGVydGllcy9saXN0LXByb3BlcnRpZXMuaGFuZGxlcicsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHZXQgUHJvcGVydHkgTGFtYmRhXHJcbiAgICB0aGlzLmdldFByb3BlcnR5TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnR2V0UHJvcGVydHlGdW5jdGlvbicsIHtcclxuICAgICAgLi4uY29tbW9uQ29uZmlnLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6ICdTYXR5YU1vb2wtR2V0UHJvcGVydHknLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvZGlzdCcpKSxcclxuICAgICAgaGFuZGxlcjogJ3Byb3BlcnRpZXMvZ2V0LXByb3BlcnR5LmhhbmRsZXInLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gRGVsZXRlIFByb3BlcnR5IExhbWJkYVxyXG4gICAgdGhpcy5kZWxldGVQcm9wZXJ0eUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0RlbGV0ZVByb3BlcnR5RnVuY3Rpb24nLCB7XHJcbiAgICAgIC4uLmNvbW1vbkNvbmZpZyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiAnU2F0eWFNb29sLURlbGV0ZVByb3BlcnR5JyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL2Rpc3QnKSksXHJcbiAgICAgIGhhbmRsZXI6ICdwcm9wZXJ0aWVzL2RlbGV0ZS1wcm9wZXJ0eS5oYW5kbGVyJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdlbmVyYXRlIFVwbG9hZCBVUkwgTGFtYmRhXHJcbiAgICB0aGlzLmdlbmVyYXRlVXBsb2FkVXJsTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnR2VuZXJhdGVVcGxvYWRVcmxGdW5jdGlvbicsIHtcclxuICAgICAgLi4uY29tbW9uQ29uZmlnLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6ICdTYXR5YU1vb2wtR2VuZXJhdGVVcGxvYWRVcmwnLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvZGlzdCcpKSxcclxuICAgICAgaGFuZGxlcjogJ3Byb3BlcnRpZXMvZ2VuZXJhdGUtdXBsb2FkLXVybC5oYW5kbGVyJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFJlZ2lzdGVyIERvY3VtZW50IExhbWJkYVxyXG4gICAgdGhpcy5yZWdpc3RlckRvY3VtZW50TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUmVnaXN0ZXJEb2N1bWVudEZ1bmN0aW9uJywge1xyXG4gICAgICAuLi5jb21tb25Db25maWcsXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ1NhdHlhTW9vbC1SZWdpc3RlckRvY3VtZW50JyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL2Rpc3QnKSksXHJcbiAgICAgIGhhbmRsZXI6ICdwcm9wZXJ0aWVzL3JlZ2lzdGVyLWRvY3VtZW50LmhhbmRsZXInLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gR2V0IERvY3VtZW50cyBMYW1iZGFcclxuICAgIHRoaXMuZ2V0RG9jdW1lbnRzTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnR2V0RG9jdW1lbnRzRnVuY3Rpb24nLCB7XHJcbiAgICAgIC4uLmNvbW1vbkNvbmZpZyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiAnU2F0eWFNb29sLUdldERvY3VtZW50cycsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9kaXN0JykpLFxyXG4gICAgICBoYW5kbGVyOiAncHJvcGVydGllcy9nZXQtZG9jdW1lbnRzLmhhbmRsZXInLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gR2V0IExpbmVhZ2UgTGFtYmRhXHJcbiAgICB0aGlzLmdldExpbmVhZ2VMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdHZXRMaW5lYWdlRnVuY3Rpb24nLCB7XHJcbiAgICAgIC4uLmNvbW1vbkNvbmZpZyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiAnU2F0eWFNb29sLUdldExpbmVhZ2UnLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvZGlzdCcpKSxcclxuICAgICAgaGFuZGxlcjogJ3Byb3BlcnRpZXMvZ2V0LWxpbmVhZ2UuaGFuZGxlcicsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHZXQgVHJ1c3QgU2NvcmUgTGFtYmRhXHJcbiAgICB0aGlzLmdldFRydXN0U2NvcmVMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdHZXRUcnVzdFNjb3JlRnVuY3Rpb24nLCB7XHJcbiAgICAgIC4uLmNvbW1vbkNvbmZpZyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiAnU2F0eWFNb29sLUdldFRydXN0U2NvcmUnLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvZGlzdCcpKSxcclxuICAgICAgaGFuZGxlcjogJ3Byb3BlcnRpZXMvZ2V0LXRydXN0LXNjb3JlLmhhbmRsZXInLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gR2VuZXJhdGUgUmVwb3J0IExhbWJkYVxyXG4gICAgdGhpcy5nZW5lcmF0ZVJlcG9ydExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0dlbmVyYXRlUmVwb3J0RnVuY3Rpb24nLCB7XHJcbiAgICAgIC4uLmNvbW1vbkNvbmZpZyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiAnU2F0eWFNb29sLUdlbmVyYXRlUmVwb3J0JyxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvZGlzdCcpKSxcclxuICAgICAgaGFuZGxlcjogJ3Byb3BlcnRpZXMvZ2VuZXJhdGUtcmVwb3J0LmhhbmRsZXInLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnNcclxuICAgIGNvbnN0IGFsbExhbWJkYXMgPSBbXHJcbiAgICAgIHRoaXMuY3JlYXRlUHJvcGVydHlMYW1iZGEsXHJcbiAgICAgIHRoaXMubGlzdFByb3BlcnRpZXNMYW1iZGEsXHJcbiAgICAgIHRoaXMuZ2V0UHJvcGVydHlMYW1iZGEsXHJcbiAgICAgIHRoaXMuZGVsZXRlUHJvcGVydHlMYW1iZGEsXHJcbiAgICAgIHRoaXMuZ2VuZXJhdGVVcGxvYWRVcmxMYW1iZGEsXHJcbiAgICAgIHRoaXMucmVnaXN0ZXJEb2N1bWVudExhbWJkYSxcclxuICAgICAgdGhpcy5nZXREb2N1bWVudHNMYW1iZGEsXHJcbiAgICAgIHRoaXMuZ2V0TGluZWFnZUxhbWJkYSxcclxuICAgICAgdGhpcy5nZXRUcnVzdFNjb3JlTGFtYmRhLFxyXG4gICAgICB0aGlzLmdlbmVyYXRlUmVwb3J0TGFtYmRhLFxyXG4gICAgXTtcclxuXHJcbiAgICBhbGxMYW1iZGFzLmZvckVhY2goZm4gPT4ge1xyXG4gICAgICBwcm9wcy5wcm9wZXJ0aWVzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGZuKTtcclxuICAgICAgcHJvcHMuZG9jdW1lbnRzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGZuKTtcclxuICAgICAgcHJvcHMubGluZWFnZVRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShmbik7XHJcbiAgICAgIHByb3BzLnRydXN0U2NvcmVzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGZuKTtcclxuICAgICAgcHJvcHMuYXVkaXRMb2dzVGFibGUuZ3JhbnRXcml0ZURhdGEoZm4pO1xyXG4gICAgICBwcm9wcy5pZGVtcG90ZW5jeVRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShmbik7XHJcbiAgICAgIHByb3BzLmRvY3VtZW50QnVja2V0LmdyYW50UmVhZFdyaXRlKGZuKTtcclxuICAgICAgcHJvcHMucHJvY2Vzc2luZ1F1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKGZuKTtcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG4iXX0=