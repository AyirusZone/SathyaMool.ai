import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import { Construct } from 'constructs';

/**
 * Configuration for Lambda provisioned concurrency
 * Reduces cold starts for critical API functions
 */
export interface ProvisionedConcurrencyConfig {
  /**
   * Minimum provisioned concurrency (always warm)
   */
  minCapacity: number;

  /**
   * Maximum provisioned concurrency (scale up to)
   */
  maxCapacity: number;

  /**
   * Target utilization percentage for auto-scaling
   * Default: 0.70 (70%)
   */
  targetUtilization?: number;
}

/**
 * Adds provisioned concurrency to a Lambda function with auto-scaling
 */
export class ProvisionedConcurrency extends Construct {
  constructor(
    scope: Construct,
    id: string,
    lambdaFunction: lambda.Function,
    config: ProvisionedConcurrencyConfig
  ) {
    super(scope, id);

    // Create alias for the Lambda function
    // Provisioned concurrency requires an alias or version
    const alias = new lambda.Alias(this, 'Alias', {
      aliasName: 'live',
      version: lambdaFunction.currentVersion,
      provisionedConcurrentExecutions: config.minCapacity,
    });

    // Create auto-scaling target
    const target = new applicationautoscaling.ScalableTarget(this, 'ScalableTarget', {
      serviceNamespace: applicationautoscaling.ServiceNamespace.LAMBDA,
      maxCapacity: config.maxCapacity,
      minCapacity: config.minCapacity,
      resourceId: `function:${lambdaFunction.functionName}:${alias.aliasName}`,
      scalableDimension: 'lambda:function:ProvisionedConcurrentExecutions',
    });

    // Add target tracking scaling policy
    target.scaleToTrackMetric('ProvisionedConcurrencyUtilization', {
      targetValue: config.targetUtilization || 0.70,
      predefinedMetric: applicationautoscaling.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
      scaleInCooldown: cdk.Duration.minutes(3),
      scaleOutCooldown: cdk.Duration.minutes(1),
    });

    // Output alias ARN
    new cdk.CfnOutput(this, 'AliasArn', {
      value: alias.functionArn,
      description: `Alias ARN for ${lambdaFunction.functionName} with provisioned concurrency`,
    });

    // Output provisioned concurrency configuration
    new cdk.CfnOutput(this, 'ProvisionedConcurrencyConfig', {
      value: JSON.stringify({
        function: lambdaFunction.functionName,
        minCapacity: config.minCapacity,
        maxCapacity: config.maxCapacity,
        targetUtilization: config.targetUtilization || 0.70,
      }),
      description: `Provisioned concurrency configuration for ${lambdaFunction.functionName}`,
    });
  }
}

/**
 * Helper function to determine if a function should have provisioned concurrency
 * Based on function criticality and expected traffic patterns
 */
export function shouldProvisionConcurrency(functionName: string): boolean {
  // Critical API functions that benefit from provisioned concurrency
  const criticalFunctions = [
    'auth-login',
    'auth-register',
    'auth-verify-otp',
    'properties-list',
    'properties-get',
    'properties-create',
    'upload-url-generator',
  ];

  return criticalFunctions.some(name => functionName.toLowerCase().includes(name));
}

/**
 * Get recommended provisioned concurrency configuration based on function type
 */
export function getProvisionedConcurrencyConfig(functionName: string): ProvisionedConcurrencyConfig {
  // Authentication functions: High traffic, need fast response
  if (functionName.includes('auth')) {
    return {
      minCapacity: 5,
      maxCapacity: 50,
      targetUtilization: 0.70,
    };
  }

  // Property management functions: Medium traffic
  if (functionName.includes('properties')) {
    return {
      minCapacity: 3,
      maxCapacity: 30,
      targetUtilization: 0.70,
    };
  }

  // Default configuration for other critical functions
  return {
    minCapacity: 2,
    maxCapacity: 20,
    targetUtilization: 0.70,
  };
}
