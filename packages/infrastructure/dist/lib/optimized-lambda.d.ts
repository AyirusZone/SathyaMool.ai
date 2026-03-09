import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { LambdaLayers } from './lambda-layers';
/**
 * Configuration for optimized Lambda functions
 */
export interface OptimizedLambdaProps extends Omit<lambda.FunctionProps, 'layers'> {
    /**
     * Whether to enable provisioned concurrency for this function
     * Default: false
     */
    enableProvisionedConcurrency?: boolean;
    /**
     * Whether to use Lambda layers for shared dependencies
     * Default: true
     */
    useLayers?: boolean;
    /**
     * Lambda layers to attach (in addition to common layers)
     */
    additionalLayers?: lambda.ILayerVersion[];
}
/**
 * Optimized Lambda function with cold start optimizations
 *
 * Features:
 * - Lambda layers for shared dependencies
 * - Provisioned concurrency for critical functions
 * - ARM64 architecture (Graviton2)
 * - Right-sized memory allocation
 * - X-Ray tracing enabled
 */
export declare class OptimizedLambda extends Construct {
    readonly function: lambda.Function;
    readonly alias?: lambda.Alias;
    constructor(scope: Construct, id: string, props: OptimizedLambdaProps, layers: LambdaLayers);
}
/**
 * Helper function to create optimized API Lambda functions
 */
export declare function createOptimizedApiLambda(scope: Construct, id: string, props: Omit<OptimizedLambdaProps, 'enableProvisionedConcurrency'>, layers: LambdaLayers): OptimizedLambda;
/**
 * Helper function to create optimized processing Lambda functions
 */
export declare function createOptimizedProcessingLambda(scope: Construct, id: string, props: Omit<OptimizedLambdaProps, 'enableProvisionedConcurrency'>, layers: LambdaLayers): OptimizedLambda;
