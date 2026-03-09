import * as lambda from 'aws-cdk-lib/aws-lambda';
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
export declare class ProvisionedConcurrency extends Construct {
    constructor(scope: Construct, id: string, lambdaFunction: lambda.Function, config: ProvisionedConcurrencyConfig);
}
/**
 * Helper function to determine if a function should have provisioned concurrency
 * Based on function criticality and expected traffic patterns
 */
export declare function shouldProvisionConcurrency(functionName: string): boolean;
/**
 * Get recommended provisioned concurrency configuration based on function type
 */
export declare function getProvisionedConcurrencyConfig(functionName: string): ProvisionedConcurrencyConfig;
