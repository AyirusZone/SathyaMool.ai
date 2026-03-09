import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * Lambda Layers for shared dependencies
 * Reduces package sizes and improves cold start performance
 */
export class LambdaLayers extends Construct {
  public readonly nodejsCommonLayer: lambda.LayerVersion;
  public readonly pythonCommonLayer: lambda.LayerVersion;
  public readonly awsSdkLayer: lambda.LayerVersion;

  constructor(scope: Construct, id: string) {
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
