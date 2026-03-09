import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
/**
 * Lambda Layers for shared dependencies
 * Reduces package sizes and improves cold start performance
 */
export declare class LambdaLayers extends Construct {
    readonly nodejsCommonLayer: lambda.LayerVersion;
    readonly pythonCommonLayer: lambda.LayerVersion;
    readonly awsSdkLayer: lambda.LayerVersion;
    constructor(scope: Construct, id: string);
}
