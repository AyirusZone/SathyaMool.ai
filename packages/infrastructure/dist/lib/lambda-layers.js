"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LambdaLayers = void 0;
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const constructs_1 = require("constructs");
const path = require("path");
/**
 * Lambda Layers for shared dependencies
 * Reduces package sizes and improves cold start performance
 */
class LambdaLayers extends constructs_1.Construct {
    constructor(scope, id) {
        super(scope, id);
        // Node.js Common Layer
        // Contains shared dependencies: aws-sdk, uuid, date-fns, etc.
        this.nodejsCommonLayer = new lambda.LayerVersion(this, 'NodejsCommonLayer', {
            layerVersionName: 'satyamool-nodejs-common',
            description: 'Common Node.js dependencies for SatyaMool Lambda functions',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../layers/nodejs-common')),
            compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
            compatibleArchitectures: [lambda.Architecture.ARM_64],
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        // Python Common Layer
        // Contains shared dependencies: boto3, botocore, etc.
        this.pythonCommonLayer = new lambda.LayerVersion(this, 'PythonCommonLayer', {
            layerVersionName: 'satyamool-python-common',
            description: 'Common Python dependencies for SatyaMool Lambda functions',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../layers/python-common')),
            compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
            compatibleArchitectures: [lambda.Architecture.ARM_64],
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        // AWS SDK Layer (for Node.js functions)
        // Separate layer for AWS SDK to enable independent updates
        this.awsSdkLayer = new lambda.LayerVersion(this, 'AwsSdkLayer', {
            layerVersionName: 'satyamool-aws-sdk',
            description: 'AWS SDK v3 for SatyaMool Lambda functions',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../layers/aws-sdk')),
            compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
            compatibleArchitectures: [lambda.Architecture.ARM_64],
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        // Output layer ARNs
        new cdk.CfnOutput(this, 'NodejsCommonLayerArn', {
            value: this.nodejsCommonLayer.layerVersionArn,
            description: 'ARN of Node.js common layer',
            exportName: 'SatyaMool-NodejsCommonLayerArn',
        });
        new cdk.CfnOutput(this, 'PythonCommonLayerArn', {
            value: this.pythonCommonLayer.layerVersionArn,
            description: 'ARN of Python common layer',
            exportName: 'SatyaMool-PythonCommonLayerArn',
        });
        new cdk.CfnOutput(this, 'AwsSdkLayerArn', {
            value: this.awsSdkLayer.layerVersionArn,
            description: 'ARN of AWS SDK layer',
            exportName: 'SatyaMool-AwsSdkLayerArn',
        });
    }
}
exports.LambdaLayers = LambdaLayers;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFtYmRhLWxheWVycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9sYW1iZGEtbGF5ZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQyxpREFBaUQ7QUFDakQsMkNBQXVDO0FBQ3ZDLDZCQUE2QjtBQUU3Qjs7O0dBR0c7QUFDSCxNQUFhLFlBQWEsU0FBUSxzQkFBUztJQUt6QyxZQUFZLEtBQWdCLEVBQUUsRUFBVTtRQUN0QyxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLHVCQUF1QjtRQUN2Qiw4REFBOEQ7UUFDOUQsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksTUFBTSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDMUUsZ0JBQWdCLEVBQUUseUJBQXlCO1lBQzNDLFdBQVcsRUFBRSw0REFBNEQ7WUFDekUsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDRCQUE0QixDQUFDLENBQUM7WUFDL0Usa0JBQWtCLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQztZQUNoRCx1QkFBdUIsRUFBRSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDO1lBQ3JELGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU07U0FDeEMsQ0FBQyxDQUFDO1FBRUgsc0JBQXNCO1FBQ3RCLHNEQUFzRDtRQUN0RCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxNQUFNLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMxRSxnQkFBZ0IsRUFBRSx5QkFBeUI7WUFDM0MsV0FBVyxFQUFFLDJEQUEyRDtZQUN4RSxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztZQUMvRSxrQkFBa0IsRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDO1lBQ2hELHVCQUF1QixFQUFFLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUM7WUFDckQsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtTQUN4QyxDQUFDLENBQUM7UUFFSCx3Q0FBd0M7UUFDeEMsMkRBQTJEO1FBQzNELElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxNQUFNLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDOUQsZ0JBQWdCLEVBQUUsbUJBQW1CO1lBQ3JDLFdBQVcsRUFBRSwyQ0FBMkM7WUFDeEQsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLHNCQUFzQixDQUFDLENBQUM7WUFDekUsa0JBQWtCLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQztZQUNoRCx1QkFBdUIsRUFBRSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDO1lBQ3JELGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU07U0FDeEMsQ0FBQyxDQUFDO1FBRUgsb0JBQW9CO1FBQ3BCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDOUMsS0FBSyxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxlQUFlO1lBQzdDLFdBQVcsRUFBRSw2QkFBNkI7WUFDMUMsVUFBVSxFQUFFLGdDQUFnQztTQUM3QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQzlDLEtBQUssRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsZUFBZTtZQUM3QyxXQUFXLEVBQUUsNEJBQTRCO1lBQ3pDLFVBQVUsRUFBRSxnQ0FBZ0M7U0FDN0MsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUN4QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxlQUFlO1lBQ3ZDLFdBQVcsRUFBRSxzQkFBc0I7WUFDbkMsVUFBVSxFQUFFLDBCQUEwQjtTQUN2QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE1REQsb0NBNERDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcclxuXHJcbi8qKlxyXG4gKiBMYW1iZGEgTGF5ZXJzIGZvciBzaGFyZWQgZGVwZW5kZW5jaWVzXHJcbiAqIFJlZHVjZXMgcGFja2FnZSBzaXplcyBhbmQgaW1wcm92ZXMgY29sZCBzdGFydCBwZXJmb3JtYW5jZVxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIExhbWJkYUxheWVycyBleHRlbmRzIENvbnN0cnVjdCB7XHJcbiAgcHVibGljIHJlYWRvbmx5IG5vZGVqc0NvbW1vbkxheWVyOiBsYW1iZGEuTGF5ZXJWZXJzaW9uO1xyXG4gIHB1YmxpYyByZWFkb25seSBweXRob25Db21tb25MYXllcjogbGFtYmRhLkxheWVyVmVyc2lvbjtcclxuICBwdWJsaWMgcmVhZG9ubHkgYXdzU2RrTGF5ZXI6IGxhbWJkYS5MYXllclZlcnNpb247XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCk7XHJcblxyXG4gICAgLy8gTm9kZS5qcyBDb21tb24gTGF5ZXJcclxuICAgIC8vIENvbnRhaW5zIHNoYXJlZCBkZXBlbmRlbmNpZXM6IGF3cy1zZGssIHV1aWQsIGRhdGUtZm5zLCBldGMuXHJcbiAgICB0aGlzLm5vZGVqc0NvbW1vbkxheWVyID0gbmV3IGxhbWJkYS5MYXllclZlcnNpb24odGhpcywgJ05vZGVqc0NvbW1vbkxheWVyJywge1xyXG4gICAgICBsYXllclZlcnNpb25OYW1lOiAnc2F0eWFtb29sLW5vZGVqcy1jb21tb24nLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvbW1vbiBOb2RlLmpzIGRlcGVuZGVuY2llcyBmb3IgU2F0eWFNb29sIExhbWJkYSBmdW5jdGlvbnMnLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xheWVycy9ub2RlanMtY29tbW9uJykpLFxyXG4gICAgICBjb21wYXRpYmxlUnVudGltZXM6IFtsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWF0sXHJcbiAgICAgIGNvbXBhdGlibGVBcmNoaXRlY3R1cmVzOiBbbGFtYmRhLkFyY2hpdGVjdHVyZS5BUk1fNjRdLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBQeXRob24gQ29tbW9uIExheWVyXHJcbiAgICAvLyBDb250YWlucyBzaGFyZWQgZGVwZW5kZW5jaWVzOiBib3RvMywgYm90b2NvcmUsIGV0Yy5cclxuICAgIHRoaXMucHl0aG9uQ29tbW9uTGF5ZXIgPSBuZXcgbGFtYmRhLkxheWVyVmVyc2lvbih0aGlzLCAnUHl0aG9uQ29tbW9uTGF5ZXInLCB7XHJcbiAgICAgIGxheWVyVmVyc2lvbk5hbWU6ICdzYXR5YW1vb2wtcHl0aG9uLWNvbW1vbicsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29tbW9uIFB5dGhvbiBkZXBlbmRlbmNpZXMgZm9yIFNhdHlhTW9vbCBMYW1iZGEgZnVuY3Rpb25zJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYXllcnMvcHl0aG9uLWNvbW1vbicpKSxcclxuICAgICAgY29tcGF0aWJsZVJ1bnRpbWVzOiBbbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTJdLFxyXG4gICAgICBjb21wYXRpYmxlQXJjaGl0ZWN0dXJlczogW2xhbWJkYS5BcmNoaXRlY3R1cmUuQVJNXzY0XSxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQVdTIFNESyBMYXllciAoZm9yIE5vZGUuanMgZnVuY3Rpb25zKVxyXG4gICAgLy8gU2VwYXJhdGUgbGF5ZXIgZm9yIEFXUyBTREsgdG8gZW5hYmxlIGluZGVwZW5kZW50IHVwZGF0ZXNcclxuICAgIHRoaXMuYXdzU2RrTGF5ZXIgPSBuZXcgbGFtYmRhLkxheWVyVmVyc2lvbih0aGlzLCAnQXdzU2RrTGF5ZXInLCB7XHJcbiAgICAgIGxheWVyVmVyc2lvbk5hbWU6ICdzYXR5YW1vb2wtYXdzLXNkaycsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVdTIFNESyB2MyBmb3IgU2F0eWFNb29sIExhbWJkYSBmdW5jdGlvbnMnLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xheWVycy9hd3Mtc2RrJykpLFxyXG4gICAgICBjb21wYXRpYmxlUnVudGltZXM6IFtsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWF0sXHJcbiAgICAgIGNvbXBhdGlibGVBcmNoaXRlY3R1cmVzOiBbbGFtYmRhLkFyY2hpdGVjdHVyZS5BUk1fNjRdLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBPdXRwdXQgbGF5ZXIgQVJOc1xyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ05vZGVqc0NvbW1vbkxheWVyQXJuJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5ub2RlanNDb21tb25MYXllci5sYXllclZlcnNpb25Bcm4sXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVJOIG9mIE5vZGUuanMgY29tbW9uIGxheWVyJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1NhdHlhTW9vbC1Ob2RlanNDb21tb25MYXllckFybicsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHl0aG9uQ29tbW9uTGF5ZXJBcm4nLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLnB5dGhvbkNvbW1vbkxheWVyLmxheWVyVmVyc2lvbkFybixcclxuICAgICAgZGVzY3JpcHRpb246ICdBUk4gb2YgUHl0aG9uIGNvbW1vbiBsYXllcicsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtUHl0aG9uQ29tbW9uTGF5ZXJBcm4nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0F3c1Nka0xheWVyQXJuJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5hd3NTZGtMYXllci5sYXllclZlcnNpb25Bcm4sXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVJOIG9mIEFXUyBTREsgbGF5ZXInLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLUF3c1Nka0xheWVyQXJuJyxcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG4iXX0=