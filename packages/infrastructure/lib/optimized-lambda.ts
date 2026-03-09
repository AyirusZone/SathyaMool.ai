import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { LambdaLayers } from './lambda-layers';
import { ProvisionedConcurrency, getProvisionedConcurrencyConfig } from './provisioned-concurrency';

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
export class OptimizedLambda extends Construct {
  public readonly function: lambda.Function;
  public readonly alias?: lambda.Alias;

  constructor(scope: Construct, id: string, props: OptimizedLambdaProps, layers: LambdaLayers) {
    super(scope, id);

    // Determine which layers to use based on runtime
    const lambdaLayers: lambda.ILayerVersion[] = [];
    
    if (props.useLayers !== false) {
      if (props.runtime.family === lambda.RuntimeFamily.NODEJS) {
        lambdaLayers.push(layers.nodejsCommonLayer);
        lambdaLayers.push(layers.awsSdkLayer);
      } else if (props.runtime.family === lambda.RuntimeFamily.PYTHON) {
        lambdaLayers.push(layers.pythonCommonLayer);
      }
    }

    // Add any additional layers
    if (props.additionalLayers) {
      lambdaLayers.push(...props.additionalLayers);
    }

    // Create the Lambda function with optimizations
    this.function = new lambda.Function(this, 'Function', {
      ...props,
      architecture: lambda.Architecture.ARM_64, // Graviton2 for better performance
      tracing: lambda.Tracing.ACTIVE, // Enable X-Ray tracing
      layers: lambdaLayers,
      // Ensure environment variables include X-Ray tracing name
      environment: {
        ...props.environment,
        AWS_XRAY_TRACING_NAME: props.functionName || id,
      },
    });

    // Add provisioned concurrency if enabled
    if (props.enableProvisionedConcurrency) {
      const config = getProvisionedConcurrencyConfig(props.functionName || id);
      
      new ProvisionedConcurrency(this, 'ProvisionedConcurrency', this.function, config);
    }

    // Output function details
    new cdk.CfnOutput(this, 'FunctionArn', {
      value: this.function.functionArn,
      description: `ARN of ${props.functionName || id}`,
    });

    new cdk.CfnOutput(this, 'OptimizationSummary', {
      value: JSON.stringify({
        function: props.functionName || id,
        architecture: 'ARM64',
        layers: lambdaLayers.length,
        provisionedConcurrency: props.enableProvisionedConcurrency || false,
        memorySize: props.memorySize || 128,
        timeout: props.timeout?.toSeconds() || 3,
      }),
      description: `Optimization summary for ${props.functionName || id}`,
    });
  }
}

/**
 * Helper function to create optimized API Lambda functions
 */
export function createOptimizedApiLambda(
  scope: Construct,
  id: string,
  props: Omit<OptimizedLambdaProps, 'enableProvisionedConcurrency'>,
  layers: LambdaLayers
): OptimizedLambda {
  // API functions are critical and should have provisioned concurrency
  return new OptimizedLambda(scope, id, {
    ...props,
    enableProvisionedConcurrency: true,
    memorySize: props.memorySize || 256, // Default 256MB for API functions
    timeout: props.timeout || cdk.Duration.seconds(30), // Default 30s timeout
  }, layers);
}

/**
 * Helper function to create optimized processing Lambda functions
 */
export function createOptimizedProcessingLambda(
  scope: Construct,
  id: string,
  props: Omit<OptimizedLambdaProps, 'enableProvisionedConcurrency'>,
  layers: LambdaLayers
): OptimizedLambda {
  // Processing functions don't need provisioned concurrency (async processing)
  return new OptimizedLambda(scope, id, {
    ...props,
    enableProvisionedConcurrency: false,
  }, layers);
}
