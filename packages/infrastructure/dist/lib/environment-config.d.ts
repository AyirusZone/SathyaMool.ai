/**
 * Environment-specific configuration for SatyaMool deployment
 *
 * This file defines configuration for dev, staging, and production environments
 * including resource names, capacity settings, and feature flags.
 */
export interface EnvironmentConfig {
    environment: 'dev' | 'staging' | 'prod';
    account?: string;
    region: string;
    resourcePrefix: string;
    dynamodb: {
        billingMode: 'PAY_PER_REQUEST' | 'PROVISIONED';
        pointInTimeRecovery: boolean;
        removalPolicy: 'DESTROY' | 'RETAIN';
    };
    s3: {
        versioning: boolean;
        removalPolicy: 'DESTROY' | 'RETAIN';
        lifecyclePolicies: boolean;
    };
    lambda: {
        reservedConcurrency: {
            ocr: number;
            translation: number;
            analysis: number;
            lineage: number;
            scoring: number;
            notification: number;
            cleanup: number;
        };
        memorySize: {
            api: number;
            ocr: number;
            translation: number;
            analysis: number;
            lineage: number;
            scoring: number;
            notification: number;
            cleanup: number;
        };
        timeout: {
            api: number;
            ocr: number;
            translation: number;
            analysis: number;
            lineage: number;
            scoring: number;
            notification: number;
            cleanup: number;
        };
        xrayTracing: boolean;
    };
    api: {
        stageName: string;
        throttling: {
            rateLimit: number;
            burstLimit: number;
        };
        caching: {
            enabled: boolean;
            ttl: number;
            cacheClusterSize: string;
        };
        customDomain?: {
            domainName: string;
            certificateArn: string;
        };
        cors: {
            allowOrigins: string[];
        };
    };
    cognito: {
        userPoolName: string;
        passwordPolicy: {
            minLength: number;
            requireLowercase: boolean;
            requireUppercase: boolean;
            requireDigits: boolean;
            requireSymbols: boolean;
        };
        mfaConfiguration: 'OFF' | 'OPTIONAL' | 'REQUIRED';
        emailVerification: boolean;
        phoneVerification: boolean;
    };
    cloudfront: {
        enabled: boolean;
        priceClass: 'PriceClass_100' | 'PriceClass_200' | 'PriceClass_All';
        cacheTtl: {
            default: number;
            max: number;
            min: number;
        };
        customDomain?: {
            domainName: string;
            certificateArn: string;
        };
    };
    monitoring: {
        alarms: {
            enabled: boolean;
            snsTopicEmail?: string;
        };
        dashboards: {
            enabled: boolean;
        };
        logRetention: number;
    };
    costOptimization: {
        textractAlarmThreshold: number;
        bedrockAlarmThreshold: number;
        s3StorageAlarmThreshold: number;
    };
    frontend: {
        bucketName: string;
        websiteUrl: string;
    };
    email: {
        fromAddress: string;
        replyToAddress?: string;
    };
}
/**
 * Development Environment Configuration
 */
export declare const devConfig: EnvironmentConfig;
/**
 * Staging Environment Configuration
 */
export declare const stagingConfig: EnvironmentConfig;
/**
 * Production Environment Configuration
 */
export declare const prodConfig: EnvironmentConfig;
/**
 * Get environment configuration based on environment variable
 */
export declare function getEnvironmentConfig(): EnvironmentConfig;
