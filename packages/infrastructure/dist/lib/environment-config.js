"use strict";
/**
 * Environment-specific configuration for SatyaMool deployment
 *
 * This file defines configuration for dev, staging, and production environments
 * including resource names, capacity settings, and feature flags.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.prodConfig = exports.stagingConfig = exports.devConfig = void 0;
exports.getEnvironmentConfig = getEnvironmentConfig;
/**
 * Development Environment Configuration
 */
exports.devConfig = {
    environment: 'dev',
    region: 'us-east-1',
    resourcePrefix: 'satyamool-dev',
    dynamodb: {
        billingMode: 'PAY_PER_REQUEST',
        pointInTimeRecovery: false, // Disabled for dev to save costs
        removalPolicy: 'DESTROY', // Allow deletion in dev
    },
    s3: {
        versioning: false, // Disabled for dev
        removalPolicy: 'DESTROY',
        lifecyclePolicies: true,
    },
    lambda: {
        reservedConcurrency: {
            ocr: 10, // Lower concurrency for dev
            translation: 10,
            analysis: 10,
            lineage: 5,
            scoring: 5,
            notification: 10,
            cleanup: 1,
        },
        memorySize: {
            api: 256,
            ocr: 512,
            translation: 512,
            analysis: 1024,
            lineage: 512,
            scoring: 256,
            notification: 256,
            cleanup: 512,
        },
        timeout: {
            api: 30,
            ocr: 300, // 5 minutes
            translation: 120, // 2 minutes
            analysis: 180, // 3 minutes
            lineage: 60, // 1 minute
            scoring: 30,
            notification: 30,
            cleanup: 900, // 15 minutes
        },
        xrayTracing: true,
    },
    api: {
        stageName: 'dev',
        throttling: {
            rateLimit: 10, // Lower rate limit for dev
            burstLimit: 20,
        },
        caching: {
            enabled: false, // Disabled for dev
            ttl: 300,
            cacheClusterSize: '0.5',
        },
        cors: {
            allowOrigins: ['http://localhost:3000', 'http://localhost:5173'], // Local development
        },
    },
    cognito: {
        userPoolName: 'satyamool-dev-users',
        passwordPolicy: {
            minLength: 8,
            requireLowercase: true,
            requireUppercase: true,
            requireDigits: true,
            requireSymbols: false, // Relaxed for dev
        },
        mfaConfiguration: 'OFF', // Disabled for dev
        emailVerification: true,
        phoneVerification: true,
    },
    cloudfront: {
        enabled: false, // Disabled for dev (use S3 directly)
        priceClass: 'PriceClass_100',
        cacheTtl: {
            default: 300,
            max: 3600,
            min: 0,
        },
    },
    monitoring: {
        alarms: {
            enabled: false, // Disabled for dev
        },
        dashboards: {
            enabled: true,
        },
        logRetention: 7, // 7 days for dev
    },
    costOptimization: {
        textractAlarmThreshold: 100, // $100/month for dev
        bedrockAlarmThreshold: 200, // $200/month for dev
        s3StorageAlarmThreshold: 50, // 50 GB for dev
    },
    frontend: {
        bucketName: 'satyamool-dev-frontend',
        websiteUrl: 'http://satyamool-dev-frontend.s3-website-us-east-1.amazonaws.com',
    },
    email: {
        fromAddress: 'noreply-dev@satyamool.com',
    },
};
/**
 * Staging Environment Configuration
 */
exports.stagingConfig = {
    environment: 'staging',
    region: 'us-east-1',
    resourcePrefix: 'satyamool-staging',
    dynamodb: {
        billingMode: 'PAY_PER_REQUEST',
        pointInTimeRecovery: true, // Enabled for staging
        removalPolicy: 'RETAIN', // Retain data in staging
    },
    s3: {
        versioning: true, // Enabled for staging
        removalPolicy: 'RETAIN',
        lifecyclePolicies: true,
    },
    lambda: {
        reservedConcurrency: {
            ocr: 50, // Medium concurrency for staging
            translation: 50,
            analysis: 50,
            lineage: 25,
            scoring: 25,
            notification: 25,
            cleanup: 1,
        },
        memorySize: {
            api: 256,
            ocr: 512,
            translation: 512,
            analysis: 1024,
            lineage: 512,
            scoring: 256,
            notification: 256,
            cleanup: 512,
        },
        timeout: {
            api: 30,
            ocr: 300,
            translation: 120,
            analysis: 180,
            lineage: 60,
            scoring: 30,
            notification: 30,
            cleanup: 900,
        },
        xrayTracing: true,
    },
    api: {
        stageName: 'staging',
        throttling: {
            rateLimit: 50, // Medium rate limit for staging
            burstLimit: 100,
        },
        caching: {
            enabled: true, // Enabled for staging
            ttl: 300,
            cacheClusterSize: '0.5',
        },
        cors: {
            allowOrigins: ['https://staging.satyamool.com'],
        },
    },
    cognito: {
        userPoolName: 'satyamool-staging-users',
        passwordPolicy: {
            minLength: 8,
            requireLowercase: true,
            requireUppercase: true,
            requireDigits: true,
            requireSymbols: true,
        },
        mfaConfiguration: 'OPTIONAL', // Optional for staging
        emailVerification: true,
        phoneVerification: true,
    },
    cloudfront: {
        enabled: true, // Enabled for staging
        priceClass: 'PriceClass_100',
        cacheTtl: {
            default: 86400, // 24 hours
            max: 31536000, // 1 year
            min: 0,
        },
        customDomain: {
            domainName: 'staging.satyamool.com',
            certificateArn: 'arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERT_ID', // TODO: Replace with actual certificate ARN
        },
    },
    monitoring: {
        alarms: {
            enabled: true, // Enabled for staging
            snsTopicEmail: 'ops-staging@satyamool.com',
        },
        dashboards: {
            enabled: true,
        },
        logRetention: 30, // 30 days for staging
    },
    costOptimization: {
        textractAlarmThreshold: 300, // $300/month for staging
        bedrockAlarmThreshold: 500, // $500/month for staging
        s3StorageAlarmThreshold: 200, // 200 GB for staging
    },
    frontend: {
        bucketName: 'satyamool-staging-frontend',
        websiteUrl: 'https://staging.satyamool.com',
    },
    email: {
        fromAddress: 'noreply@satyamool.com',
        replyToAddress: 'support@satyamool.com',
    },
};
/**
 * Production Environment Configuration
 */
exports.prodConfig = {
    environment: 'prod',
    region: 'us-east-1',
    resourcePrefix: 'satyamool-prod',
    dynamodb: {
        billingMode: 'PAY_PER_REQUEST', // Start with on-demand, switch to provisioned if predictable
        pointInTimeRecovery: true, // Required for production
        removalPolicy: 'RETAIN', // Never delete production data
    },
    s3: {
        versioning: true, // Required for production
        removalPolicy: 'RETAIN',
        lifecyclePolicies: true,
    },
    lambda: {
        reservedConcurrency: {
            ocr: 100, // Full concurrency for production
            translation: 100,
            analysis: 100,
            lineage: 50,
            scoring: 50,
            notification: 50,
            cleanup: 1,
        },
        memorySize: {
            api: 256,
            ocr: 512,
            translation: 512,
            analysis: 1024,
            lineage: 512,
            scoring: 256,
            notification: 256,
            cleanup: 512,
        },
        timeout: {
            api: 30,
            ocr: 300,
            translation: 120,
            analysis: 180,
            lineage: 60,
            scoring: 30,
            notification: 30,
            cleanup: 900,
        },
        xrayTracing: true,
    },
    api: {
        stageName: 'prod',
        throttling: {
            rateLimit: 100, // Full rate limit for production (100 req/min per user)
            burstLimit: 200,
        },
        caching: {
            enabled: true, // Enabled for production
            ttl: 300,
            cacheClusterSize: '0.5',
        },
        customDomain: {
            domainName: 'api.satyamool.com',
            certificateArn: 'arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERT_ID', // TODO: Replace with actual certificate ARN
        },
        cors: {
            allowOrigins: ['https://app.satyamool.com', 'https://www.satyamool.com'],
        },
    },
    cognito: {
        userPoolName: 'satyamool-prod-users',
        passwordPolicy: {
            minLength: 12, // Stronger password for production
            requireLowercase: true,
            requireUppercase: true,
            requireDigits: true,
            requireSymbols: true,
        },
        mfaConfiguration: 'OPTIONAL', // Optional MFA for production
        emailVerification: true,
        phoneVerification: true,
    },
    cloudfront: {
        enabled: true, // Required for production
        priceClass: 'PriceClass_200', // Better global coverage
        cacheTtl: {
            default: 86400, // 24 hours
            max: 31536000, // 1 year
            min: 0,
        },
        customDomain: {
            domainName: 'app.satyamool.com',
            certificateArn: 'arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERT_ID', // TODO: Replace with actual certificate ARN
        },
    },
    monitoring: {
        alarms: {
            enabled: true, // Required for production
            snsTopicEmail: 'ops@satyamool.com',
        },
        dashboards: {
            enabled: true,
        },
        logRetention: 90, // 90 days for production
    },
    costOptimization: {
        textractAlarmThreshold: 500, // $500/month for production
        bedrockAlarmThreshold: 1000, // $1000/month for production
        s3StorageAlarmThreshold: 1000, // 1 TB for production
    },
    frontend: {
        bucketName: 'satyamool-prod-frontend',
        websiteUrl: 'https://app.satyamool.com',
    },
    email: {
        fromAddress: 'noreply@satyamool.com',
        replyToAddress: 'support@satyamool.com',
    },
};
/**
 * Get environment configuration based on environment variable
 */
function getEnvironmentConfig() {
    const env = process.env.DEPLOYMENT_ENV || 'dev';
    switch (env) {
        case 'staging':
            return exports.stagingConfig;
        case 'prod':
        case 'production':
            return exports.prodConfig;
        case 'dev':
        case 'development':
        default:
            return exports.devConfig;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnQtY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2Vudmlyb25tZW50LWNvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7O0dBS0c7OztBQXdnQkgsb0RBY0M7QUF0WUQ7O0dBRUc7QUFDVSxRQUFBLFNBQVMsR0FBc0I7SUFDMUMsV0FBVyxFQUFFLEtBQUs7SUFDbEIsTUFBTSxFQUFFLFdBQVc7SUFDbkIsY0FBYyxFQUFFLGVBQWU7SUFFL0IsUUFBUSxFQUFFO1FBQ1IsV0FBVyxFQUFFLGlCQUFpQjtRQUM5QixtQkFBbUIsRUFBRSxLQUFLLEVBQUUsaUNBQWlDO1FBQzdELGFBQWEsRUFBRSxTQUFTLEVBQUUsd0JBQXdCO0tBQ25EO0lBRUQsRUFBRSxFQUFFO1FBQ0YsVUFBVSxFQUFFLEtBQUssRUFBRSxtQkFBbUI7UUFDdEMsYUFBYSxFQUFFLFNBQVM7UUFDeEIsaUJBQWlCLEVBQUUsSUFBSTtLQUN4QjtJQUVELE1BQU0sRUFBRTtRQUNOLG1CQUFtQixFQUFFO1lBQ25CLEdBQUcsRUFBRSxFQUFFLEVBQUUsNEJBQTRCO1lBQ3JDLFdBQVcsRUFBRSxFQUFFO1lBQ2YsUUFBUSxFQUFFLEVBQUU7WUFDWixPQUFPLEVBQUUsQ0FBQztZQUNWLE9BQU8sRUFBRSxDQUFDO1lBQ1YsWUFBWSxFQUFFLEVBQUU7WUFDaEIsT0FBTyxFQUFFLENBQUM7U0FDWDtRQUNELFVBQVUsRUFBRTtZQUNWLEdBQUcsRUFBRSxHQUFHO1lBQ1IsR0FBRyxFQUFFLEdBQUc7WUFDUixXQUFXLEVBQUUsR0FBRztZQUNoQixRQUFRLEVBQUUsSUFBSTtZQUNkLE9BQU8sRUFBRSxHQUFHO1lBQ1osT0FBTyxFQUFFLEdBQUc7WUFDWixZQUFZLEVBQUUsR0FBRztZQUNqQixPQUFPLEVBQUUsR0FBRztTQUNiO1FBQ0QsT0FBTyxFQUFFO1lBQ1AsR0FBRyxFQUFFLEVBQUU7WUFDUCxHQUFHLEVBQUUsR0FBRyxFQUFFLFlB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LDRCQUE0QjtRQUN6RCxxQkFBcUIsRUFBRSxJQUFJLEVBQUUsNkJBQTZCO1FBQzFELHVCQUF1QixFQUFFLElBQUksRUFBRSxzQkFBc0I7S0FDdEQ7SUFFRCxRQUFRLEVBQUU7UUFDUixVQUFVLEVBQUUseUJBQXlCO1FBQ3JDLFVBQVUsRUFBRSwyQkFBMkI7S0FDeEM7SUFFRCxLQUFLLEVBQUU7UUFDTCxXQUFXLEVBQUUsdUJBQXVCO1FBQ3BDLGNBQWMsRUFBRSx1QkFBdUI7S0FDeEM7Q0FDRixDQUFDO0FBRUY7O0dBRUc7QUFDSCxTQUFnQixvQkFBb0I7SUFDbEMsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLElBQUksS0FBSyxDQUFDO0lBRWhELFFBQVEsR0FBRyxFQUFFLENBQUM7UUFDWixLQUFLLFNBQVM7WUFDWixPQUFPLHFCQUFhLENBQUM7UUFDdkIsS0FBSyxNQUFNLENBQUM7UUFDWixLQUFLLFlBQVk7WUFDZixPQUFPLGtCQUFVLENBQUM7UUFDcEIsS0FBSyxLQUFLLENBQUM7UUFDWCxLQUFLLGFBQWEsQ0FBQztRQUNuQjtZQUNFLE9BQU8saUJBQVMsQ0FBQztJQUNyQixDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBFbnZpcm9ubWVudC1zcGVjaWZpYyBjb25maWd1cmF0aW9uIGZvciBTYXR5YU1vb2wgZGVwbG95bWVudFxyXG4gKiBcclxuICogVGhpcyBmaWxlIGRlZmluZXMgY29uZmlndXJhdGlvbiBmb3IgZGV2LCBzdGFnaW5nLCBhbmQgcHJvZHVjdGlvbiBlbnZpcm9ubWVudHNcclxuICogaW5jbHVkaW5nIHJlc291cmNlIG5hbWVzLCBjYXBhY2l0eSBzZXR0aW5ncywgYW5kIGZlYXR1cmUgZmxhZ3MuXHJcbiAqL1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBFbnZpcm9ubWVudENvbmZpZyB7XHJcbiAgLy8gRW52aXJvbm1lbnQgaWRlbnRpZmllclxyXG4gIGVudmlyb25tZW50OiAnZGV2JyB8ICdzdGFnaW5nJyB8ICdwcm9kJztcclxuICBcclxuICAvLyBBV1MgQWNjb3VudCBhbmQgUmVnaW9uXHJcbiAgYWNjb3VudD86IHN0cmluZztcclxuICByZWdpb246IHN0cmluZztcclxuICBcclxuICAvLyBSZXNvdXJjZSBuYW1pbmdcclxuICByZXNvdXJjZVByZWZpeDogc3RyaW5nO1xyXG4gIFxyXG4gIC8vIER5bmFtb0RCIENvbmZpZ3VyYXRpb25cclxuICBkeW5hbW9kYjoge1xyXG4gICAgYmlsbGluZ01vZGU6ICdQQVlfUEVSX1JFUVVFU1QnIHwgJ1BST1ZJU0lPTkVEJztcclxuICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IGJvb2xlYW47XHJcbiAgICByZW1vdmFsUG9saWN5OiAnREVTVFJPWScgfCAnUkVUQUlOJztcclxuICB9O1xyXG4gIFxyXG4gIC8vIFMzIENvbmZpZ3VyYXRpb25cclxuICBzMzoge1xyXG4gICAgdmVyc2lvbmluZzogYm9vbGVhbjtcclxuICAgIHJlbW92YWxQb2xpY3k6ICdERVNUUk9ZJyB8ICdSRVRBSU4nO1xyXG4gICAgbGlmZWN5Y2xlUG9saWNpZXM6IGJvb2xlYW47XHJcbiAgfTtcclxuICBcclxuICAvLyBMYW1iZGEgQ29uZmlndXJhdGlvblxyXG4gIGxhbWJkYToge1xyXG4gICAgcmVzZXJ2ZWRDb25jdXJyZW5jeToge1xyXG4gICAgICBvY3I6IG51bWJlcjtcclxuICAgICAgdHJhbnNsYXRpb246IG51bWJlcjtcclxuICAgICAgYW5hbHlzaXM6IG51bWJlcjtcclxuICAgICAgbGluZWFnZTogbnVtYmVyO1xyXG4gICAgICBzY29yaW5nOiBudW1iZXI7XHJcbiAgICAgIG5vdGlmaWNhdGlvbjogbnVtYmVyO1xyXG4gICAgICBjbGVhbnVwOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgbWVtb3J5U2l6ZToge1xyXG4gICAgICBhcGk6IG51bWJlcjtcclxuICAgICAgb2NyOiBudW1iZXI7XHJcbiAgICAgIHRyYW5zbGF0aW9uOiBudW1iZXI7XHJcbiAgICAgIGFuYWx5c2lzOiBudW1iZXI7XHJcbiAgICAgIGxpbmVhZ2U6IG51bWJlcjtcclxuICAgICAgc2NvcmluZzogbnVtYmVyO1xyXG4gICAgICBub3RpZmljYXRpb246IG51bWJlcjtcclxuICAgICAgY2xlYW51cDogbnVtYmVyO1xyXG4gICAgfTtcclxuICAgIHRpbWVvdXQ6IHtcclxuICAgICAgYXBpOiBudW1iZXI7IC8vIHNlY29uZHNcclxuICAgICAgb2NyOiBudW1iZXI7IC8vIHNlY29uZHNcclxuICAgICAgdHJhbnNsYXRpb246IG51bWJlcjsgLy8gc2Vjb25kc1xyXG4gICAgICBhbmFseXNpczogbnVtYmVyOyAvLyBzZWNvbmRzXHJcbiAgICAgIGxpbmVhZ2U6IG51bWJlcjsgLy8gc2Vjb25kc1xyXG4gICAgICBzY29yaW5nOiBudW1iZXI7IC8vIHNlY29uZHNcclxuICAgICAgbm90aWZpY2F0aW9uOiBudW1iZXI7IC8vIHNlY29uZHNcclxuICAgICAgY2xlYW51cDogbnVtYmVyOyAvLyBzZWNvbmRzXHJcbiAgICB9O1xyXG4gICAgeHJheVRyYWNpbmc6IGJvb2xlYW47XHJcbiAgfTtcclxuICBcclxuICAvLyBBUEkgR2F0ZXdheSBDb25maWd1cmF0aW9uXHJcbiAgYXBpOiB7XHJcbiAgICBzdGFnZU5hbWU6IHN0cmluZztcclxuICAgIHRocm90dGxpbmc6IHtcclxuICAgICAgcmF0ZUxpbWl0OiBudW1iZXI7IC8vIHJlcXVlc3RzIHBlciBzZWNvbmRcclxuICAgICAgYnVyc3RMaW1pdDogbnVtYmVyO1xyXG4gICAgfTtcclxuICAgIGNhY2hpbmc6IHtcclxuICAgICAgZW5hYmxlZDogYm9vbGVhbjtcclxuICAgICAgdHRsOiBudW1iZXI7IC8vIHNlY29uZHNcclxuICAgICAgY2FjaGVDbHVzdGVyU2l6ZTogc3RyaW5nOyAvLyAnMC41JyB8ICcxLjYnIHwgJzYuMScgfCAnMTMuNScgfCAnMjguNCcgfCAnNTguMicgfCAnMTE4JyB8ICcyMzcnXHJcbiAgICB9O1xyXG4gICAgY3VzdG9tRG9tYWluPzoge1xyXG4gICAgICBkb21haW5OYW1lOiBzdHJpbmc7XHJcbiAgICAgIGNlcnRpZmljYXRlQXJuOiBzdHJpbmc7XHJcbiAgICB9O1xyXG4gICAgY29yczoge1xyXG4gICAgICBhbGxvd09yaWdpbnM6IHN0cmluZ1tdO1xyXG4gICAgfTtcclxuICB9O1xyXG4gIFxyXG4gIC8vIENvZ25pdG8gQ29uZmlndXJhdGlvblxyXG4gIGNvZ25pdG86IHtcclxuICAgIHVzZXJQb29sTmFtZTogc3RyaW5nO1xyXG4gICAgcGFzc3dvcmRQb2xpY3k6IHtcclxuICAgICAgbWluTGVuZ3RoOiBudW1iZXI7XHJcbiAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IGJvb2xlYW47XHJcbiAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IGJvb2xlYW47XHJcbiAgICAgIHJlcXVpcmVEaWdpdHM6IGJvb2xlYW47XHJcbiAgICAgIHJlcXVpcmVTeW1ib2xzOiBib29sZWFuO1xyXG4gICAgfTtcclxuICAgIG1mYUNvbmZpZ3VyYXRpb246ICdPRkYnIHwgJ09QVElPTkFMJyB8ICdSRVFVSVJFRCc7XHJcbiAgICBlbWFpbFZlcmlmaWNhdGlvbjogYm9vbGVhbjtcclxuICAgIHBob25lVmVyaWZpY2F0aW9uOiBib29sZWFuO1xyXG4gIH07XHJcbiAgXHJcbiAgLy8gQ2xvdWRGcm9udCBDb25maWd1cmF0aW9uXHJcbiAgY2xvdWRmcm9udDoge1xyXG4gICAgZW5hYmxlZDogYm9vbGVhbjtcclxuICAgIHByaWNlQ2xhc3M6ICdQcmljZUNsYXNzXzEwMCcgfCAnUHJpY2VDbGFzc18yMDAnIHwgJ1ByaWNlQ2xhc3NfQWxsJztcclxuICAgIGNhY2hlVHRsOiB7XHJcbiAgICAgIGRlZmF1bHQ6IG51bWJlcjsgLy8gc2Vjb25kc1xyXG4gICAgICBtYXg6IG51bWJlcjsgLy8gc2Vjb25kc1xyXG4gICAgICBtaW46IG51bWJlcjsgLy8gc2Vjb25kc1xyXG4gICAgfTtcclxuICAgIGN1c3RvbURvbWFpbj86IHtcclxuICAgICAgZG9tYWluTmFtZTogc3RyaW5nO1xyXG4gICAgICBjZXJ0aWZpY2F0ZUFybjogc3RyaW5nO1xyXG4gICAgfTtcclxuICB9O1xyXG4gIFxyXG4gIC8vIE1vbml0b3JpbmcgQ29uZmlndXJhdGlvblxyXG4gIG1vbml0b3Jpbmc6IHtcclxuICAgIGFsYXJtczoge1xyXG4gICAgICBlbmFibGVkOiBib29sZWFuO1xyXG4gICAgICBzbnNUb3BpY0VtYWlsPzogc3RyaW5nO1xyXG4gICAgfTtcclxuICAgIGRhc2hib2FyZHM6IHtcclxuICAgICAgZW5hYmxlZDogYm9vbGVhbjtcclxuICAgIH07XHJcbiAgICBsb2dSZXRlbnRpb246IG51bWJlcjsgLy8gZGF5c1xyXG4gIH07XHJcbiAgXHJcbiAgLy8gQ29zdCBPcHRpbWl6YXRpb25cclxuICBjb3N0T3B0aW1pemF0aW9uOiB7XHJcbiAgICB0ZXh0cmFjdEFsYXJtVGhyZXNob2xkOiBudW1iZXI7IC8vIGRvbGxhcnMgcGVyIG1vbnRoXHJcbiAgICBiZWRyb2NrQWxhcm1UaHJlc2hvbGQ6IG51bWJlcjsgLy8gZG9sbGFycyBwZXIgbW9udGhcclxuICAgIHMzU3RvcmFnZUFsYXJtVGhyZXNob2xkOiBudW1iZXI7IC8vIEdCXHJcbiAgfTtcclxuICBcclxuICAvLyBGcm9udGVuZCBDb25maWd1cmF0aW9uXHJcbiAgZnJvbnRlbmQ6IHtcclxuICAgIGJ1Y2tldE5hbWU6IHN0cmluZztcclxuICAgIHdlYnNpdGVVcmw6IHN0cmluZztcclxuICB9O1xyXG4gIFxyXG4gIC8vIEVtYWlsIENvbmZpZ3VyYXRpb25cclxuICBlbWFpbDoge1xyXG4gICAgZnJvbUFkZHJlc3M6IHN0cmluZztcclxuICAgIHJlcGx5VG9BZGRyZXNzPzogc3RyaW5nO1xyXG4gIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBEZXZlbG9wbWVudCBFbnZpcm9ubWVudCBDb25maWd1cmF0aW9uXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZGV2Q29uZmlnOiBFbnZpcm9ubWVudENvbmZpZyA9IHtcclxuICBlbnZpcm9ubWVudDogJ2RldicsXHJcbiAgcmVnaW9uOiAndXMtZWFzdC0xJyxcclxuICByZXNvdXJjZVByZWZpeDogJ3NhdHlhbW9vbC1kZXYnLFxyXG4gIFxyXG4gIGR5bmFtb2RiOiB7XHJcbiAgICBiaWxsaW5nTW9kZTogJ1BBWV9QRVJfUkVRVUVTVCcsXHJcbiAgICBwb2ludEluVGltZVJlY292ZXJ5OiBmYWxzZSwgLy8gRGlzYWJsZWQgZm9yIGRldiB0byBzYXZlIGNvc3RzXHJcbiAgICByZW1vdmFsUG9saWN5OiAnREVTVFJPWScsIC8vIEFsbG93IGRlbGV0aW9uIGluIGRldlxyXG4gIH0sXHJcbiAgXHJcbiAgczM6IHtcclxuICAgIHZlcnNpb25pbmc6IGZhbHNlLCAvLyBEaXNhYmxlZCBmb3IgZGV2XHJcbiAgICByZW1vdmFsUG9saWN5OiAnREVTVFJPWScsXHJcbiAgICBsaWZlY3ljbGVQb2xpY2llczogdHJ1ZSxcclxuICB9LFxyXG4gIFxyXG4gIGxhbWJkYToge1xyXG4gICAgcmVzZXJ2ZWRDb25jdXJyZW5jeToge1xyXG4gICAgICBvY3I6IDEwLCAvLyBMb3dlciBjb25jdXJyZW5jeSBmb3IgZGV2XHJcbiAgICAgIHRyYW5zbGF0aW9uOiAxMCxcclxuICAgICAgYW5hbHlzaXM6IDEwLFxyXG4gICAgICBsaW5lYWdlOiA1LFxyXG4gICAgICBzY29yaW5nOiA1LFxyXG4gICAgICBub3RpZmljYXRpb246IDEwLFxyXG4gICAgICBjbGVhbnVwOiAxLFxyXG4gICAgfSxcclxuICAgIG1lbW9yeVNpemU6IHtcclxuICAgICAgYXBpOiAyNTYsXHJcbiAgICAgIG9jcjogNTEyLFxyXG4gICAgICB0cmFuc2xhdGlvbjogNTEyLFxyXG4gICAgICBhbmFseXNpczogMTAyNCxcclxuICAgICAgbGluZWFnZTogNTEyLFxyXG4gICAgICBzY29yaW5nOiAyNTYsXHJcbiAgICAgIG5vdGlmaWNhdGlvbjogMjU2LFxyXG4gICAgICBjbGVhbnVwOiA1MTIsXHJcbiAgICB9LFxyXG4gICAgdGltZW91dDoge1xyXG4gICAgICBhcGk6IDMwLFxyXG4gICAgICBvY3I6IDMwMCwgLy8gNSBtaW51dGVzXHJcbiAgICAgIHRyYW5zbGF0aW9uOiAxMjAsIC8vIDIgbWludXRlc1xyXG4gICAgICBhbmFseXNpczogMTgwLCAvLyAzIG1pbnV0ZXNcclxuICAgICAgbGluZWFnZTogNjAsIC8vIDEgbWludXRlXHJcbiAgICAgIHNjb3Jpbmc6IDMwLFxyXG4gICAgICBub3RpZmljYXRpb246IDMwLFxyXG4gICAgICBjbGVhbnVwOiA5MDAsIC8vIDE1IG1pbnV0ZXNcclxuICAgIH0sXHJcbiAgICB4cmF5VHJhY2luZzogdHJ1ZSxcclxuICB9LFxyXG4gIFxyXG4gIGFwaToge1xyXG4gICAgc3RhZ2VOYW1lOiAnZGV2JyxcclxuICAgIHRocm90dGxpbmc6IHtcclxuICAgICAgcmF0ZUxpbWl0OiAxMCwgLy8gTG93ZXIgcmF0ZSBsaW1pdCBmb3IgZGV2XHJcbiAgICAgIGJ1cnN0TGltaXQ6IDIwLFxyXG4gICAgfSxcclxuICAgIGNhY2hpbmc6IHtcclxuICAgICAgZW5hYmxlZDogZmFsc2UsIC8vIERpc2FibGVkIGZvciBkZXZcclxuICAgICAgdHRsOiAzMDAsXHJcbiAgICAgIGNhY2hlQ2x1c3RlclNpemU6ICcwLjUnLFxyXG4gICAgfSxcclxuICAgIGNvcnM6IHtcclxuICAgICAgYWxsb3dPcmlnaW5zOiBbJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsICdodHRwOi8vbG9jYWxob3N0OjUxNzMnXSwgLy8gTG9jYWwgZGV2ZWxvcG1lbnRcclxuICAgIH0sXHJcbiAgfSxcclxuICBcclxuICBjb2duaXRvOiB7XHJcbiAgICB1c2VyUG9vbE5hbWU6ICdzYXR5YW1vb2wtZGV2LXVzZXJzJyxcclxuICAgIHBhc3N3b3JkUG9saWN5OiB7XHJcbiAgICAgIG1pbkxlbmd0aDogOCxcclxuICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcclxuICAgICAgcmVxdWlyZVVwcGVyY2FzZTogdHJ1ZSxcclxuICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcclxuICAgICAgcmVxdWlyZVN5bWJvbHM6IGZhbHNlLCAvLyBSZWxheGVkIGZvciBkZXZcclxuICAgIH0sXHJcbiAgICBtZmFDb25maWd1cmF0aW9uOiAnT0ZGJywgLy8gRGlzYWJsZWQgZm9yIGRldlxyXG4gICAgZW1haWxWZXJpZmljYXRpb246IHRydWUsXHJcbiAgICBwaG9uZVZlcmlmaWNhdGlvbjogdHJ1ZSxcclxuICB9LFxyXG4gIFxyXG4gIGNsb3VkZnJvbnQ6IHtcclxuICAgIGVuYWJsZWQ6IGZhbHNlLCAvLyBEaXNhYmxlZCBmb3IgZGV2ICh1c2UgUzMgZGlyZWN0bHkpXHJcbiAgICBwcmljZUNsYXNzOiAnUHJpY2VDbGFzc18xMDAnLFxyXG4gICAgY2FjaGVUdGw6IHtcclxuICAgICAgZGVmYXVsdDogMzAwLFxyXG4gICAgICBtYXg6IDM2MDAsXHJcbiAgICAgIG1pbjogMCxcclxuICAgIH0sXHJcbiAgfSxcclxuICBcclxuICBtb25pdG9yaW5nOiB7XHJcbiAgICBhbGFybXM6IHtcclxuICAgICAgZW5hYmxlZDogZmFsc2UsIC8vIERpc2FibGVkIGZvciBkZXZcclxuICAgIH0sXHJcbiAgICBkYXNoYm9hcmRzOiB7XHJcbiAgICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICB9LFxyXG4gICAgbG9nUmV0ZW50aW9uOiA3LCAvLyA3IGRheXMgZm9yIGRldlxyXG4gIH0sXHJcbiAgXHJcbiAgY29zdE9wdGltaXphdGlvbjoge1xyXG4gICAgdGV4dHJhY3RBbGFybVRocmVzaG9sZDogMTAwLCAvLyAkMTAwL21vbnRoIGZvciBkZXZcclxuICAgIGJlZHJvY2tBbGFybVRocmVzaG9sZDogMjAwLCAvLyAkMjAwL21vbnRoIGZvciBkZXZcclxuICAgIHMzU3RvcmFnZUFsYXJtVGhyZXNob2xkOiA1MCwgLy8gNTAgR0IgZm9yIGRldlxyXG4gIH0sXHJcbiAgXHJcbiAgZnJvbnRlbmQ6IHtcclxuICAgIGJ1Y2tldE5hbWU6ICdzYXR5YW1vb2wtZGV2LWZyb250ZW5kJyxcclxuICAgIHdlYnNpdGVVcmw6ICdodHRwOi8vc2F0eWFtb29sLWRldi1mcm9udGVuZC5zMy13ZWJzaXRlLXVzLWVhc3QtMS5hbWF6b25hd3MuY29tJyxcclxuICB9LFxyXG4gIFxyXG4gIGVtYWlsOiB7XHJcbiAgICBmcm9tQWRkcmVzczogJ25vcmVwbHktZGV2QHNhdHlhbW9vbC5jb20nLFxyXG4gIH0sXHJcbn07XHJcblxyXG4vKipcclxuICogU3RhZ2luZyBFbnZpcm9ubWVudCBDb25maWd1cmF0aW9uXHJcbiAqL1xyXG5leHBvcnQgY29uc3Qgc3RhZ2luZ0NvbmZpZzogRW52aXJvbm1lbnRDb25maWcgPSB7XHJcbiAgZW52aXJvbm1lbnQ6ICdzdGFnaW5nJyxcclxuICByZWdpb246ICd1cy1lYXN0LTEnLFxyXG4gIHJlc291cmNlUHJlZml4OiAnc2F0eWFtb29sLXN0YWdpbmcnLFxyXG4gIFxyXG4gIGR5bmFtb2RiOiB7XHJcbiAgICBiaWxsaW5nTW9kZTogJ1BBWV9QRVJfUkVRVUVTVCcsXHJcbiAgICBwb2ludEluVGltZVJlY292ZXJ5OiB0cnVlLCAvLyBFbmFibGVkIGZvciBzdGFnaW5nXHJcbiAgICByZW1vdmFsUG9saWN5OiAnUkVUQUlOJywgLy8gUmV0YWluIGRhdGEgaW4gc3RhZ2luZ1xyXG4gIH0sXHJcbiAgXHJcbiAgczM6IHtcclxuICAgIHZlcnNpb25pbmc6IHRydWUsIC8vIEVuYWJsZWQgZm9yIHN0YWdpbmdcclxuICAgIHJlbW92YWxQb2xpY3k6ICdSRVRBSU4nLFxyXG4gICAgbGlmZWN5Y2xlUG9saWNpZXM6IHRydWUsXHJcbiAgfSxcclxuICBcclxuICBsYW1iZGE6IHtcclxuICAgIHJlc2VydmVkQ29uY3VycmVuY3k6IHtcclxuICAgICAgb2NyOiA1MCwgLy8gTWVkaXVtIGNvbmN1cnJlbmN5IGZvciBzdGFnaW5nXHJcbiAgICAgIHRyYW5zbGF0aW9uOiA1MCxcclxuICAgICAgYW5hbHlzaXM6IDUwLFxyXG4gICAgICBsaW5lYWdlOiAyNSxcclxuICAgICAgc2NvcmluZzogMjUsXHJcbiAgICAgIG5vdGlmaWNhdGlvbjogMjUsXHJcbiAgICAgIGNsZWFudXA6IDEsXHJcbiAgICB9LFxyXG4gICAgbWVtb3J5U2l6ZToge1xyXG4gICAgICBhcGk6IDI1NixcclxuICAgICAgb2NyOiA1MTIsXHJcbiAgICAgIHRyYW5zbGF0aW9uOiA1MTIsXHJcbiAgICAgIGFuYWx5c2lzOiAxMDI0LFxyXG4gICAgICBsaW5lYWdlOiA1MTIsXHJcbiAgICAgIHNjb3Jpbmc6IDI1NixcclxuICAgICAgbm90aWZpY2F0aW9uOiAyNTYsXHJcbiAgICAgIGNsZWFudXA6IDUxMixcclxuICAgIH0sXHJcbiAgICB0aW1lb3V0OiB7XHJcbiAgICAgIGFwaTogMzAsXHJcbiAgICAgIG9jcjogMzAwLFxyXG4gICAgICB0cmFuc2xhdGlvbjogMTIwLFxyXG4gICAgICBhbmFseXNpczogMTgwLFxyXG4gICAgICBsaW5lYWdlOiA2MCxcclxuICAgICAgc2NvcmluZzogMzAsXHJcbiAgICAgIG5vdGlmaWNhdGlvbjogMzAsXHJcbiAgICAgIGNsZWFudXA6IDkwMCxcclxuICAgIH0sXHJcbiAgICB4cmF5VHJhY2luZzogdHJ1ZSxcclxuICB9LFxyXG4gIFxyXG4gIGFwaToge1xyXG4gICAgc3RhZ2VOYW1lOiAnc3RhZ2luZycsXHJcbiAgICB0aHJvdHRsaW5nOiB7XHJcbiAgICAgIHJhdGVMaW1pdDogNTAsIC8vIE1lZGl1bSByYXRlIGxpbWl0IGZvciBzdGFnaW5nXHJcbiAgICAgIGJ1cnN0TGltaXQ6IDEwMCxcclxuICAgIH0sXHJcbiAgICBjYWNoaW5nOiB7XHJcbiAgICAgIGVuYWJsZWQ6IHRydWUsIC8vIEVuYWJsZWQgZm9yIHN0YWdpbmdcclxuICAgICAgdHRsOiAzMDAsXHJcbiAgICAgIGNhY2hlQ2x1c3RlclNpemU6ICcwLjUnLFxyXG4gICAgfSxcclxuICAgIGNvcnM6IHtcclxuICAgICAgYWxsb3dPcmlnaW5zOiBbJ2h0dHBzOi8vc3RhZ2luZy5zYXR5YW1vb2wuY29tJ10sXHJcbiAgICB9LFxyXG4gIH0sXHJcbiAgXHJcbiAgY29nbml0bzoge1xyXG4gICAgdXNlclBvb2xOYW1lOiAnc2F0eWFtb29sLXN0YWdpbmctdXNlcnMnLFxyXG4gICAgcGFzc3dvcmRQb2xpY3k6IHtcclxuICAgICAgbWluTGVuZ3RoOiA4LFxyXG4gICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxyXG4gICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxyXG4gICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxyXG4gICAgICByZXF1aXJlU3ltYm9sczogdHJ1ZSxcclxuICAgIH0sXHJcbiAgICBtZmFDb25maWd1cmF0aW9uOiAnT1BUSU9OQUwnLCAvLyBPcHRpb25hbCBmb3Igc3RhZ2luZ1xyXG4gICAgZW1haWxWZXJpZmljYXRpb246IHRydWUsXHJcbiAgICBwaG9uZVZlcmlmaWNhdGlvbjogdHJ1ZSxcclxuICB9LFxyXG4gIFxyXG4gIGNsb3VkZnJvbnQ6IHtcclxuICAgIGVuYWJsZWQ6IHRydWUsIC8vIEVuYWJsZWQgZm9yIHN0YWdpbmdcclxuICAgIHByaWNlQ2xhc3M6ICdQcmljZUNsYXNzXzEwMCcsXHJcbiAgICBjYWNoZVR0bDoge1xyXG4gICAgICBkZWZhdWx0OiA4NjQwMCwgLy8gMjQgaG91cnNcclxuICAgICAgbWF4OiAzMTUzNjAwMCwgLy8gMSB5ZWFyXHJcbiAgICAgIG1pbjogMCxcclxuICAgIH0sXHJcbiAgICBjdXN0b21Eb21haW46IHtcclxuICAgICAgZG9tYWluTmFtZTogJ3N0YWdpbmcuc2F0eWFtb29sLmNvbScsXHJcbiAgICAgIGNlcnRpZmljYXRlQXJuOiAnYXJuOmF3czphY206dXMtZWFzdC0xOkFDQ09VTlRfSUQ6Y2VydGlmaWNhdGUvQ0VSVF9JRCcsIC8vIFRPRE86IFJlcGxhY2Ugd2l0aCBhY3R1YWwgY2VydGlmaWNhdGUgQVJOXHJcbiAgICB9LFxyXG4gIH0sXHJcbiAgXHJcbiAgbW9uaXRvcmluZzoge1xyXG4gICAgYWxhcm1zOiB7XHJcbiAgICAgIGVuYWJsZWQ6IHRydWUsIC8vIEVuYWJsZWQgZm9yIHN0YWdpbmdcclxuICAgICAgc25zVG9waWNFbWFpbDogJ29wcy1zdGFnaW5nQHNhdHlhbW9vbC5jb20nLFxyXG4gICAgfSxcclxuICAgIGRhc2hib2FyZHM6IHtcclxuICAgICAgZW5hYmxlZDogdHJ1ZSxcclxuICAgIH0sXHJcbiAgICBsb2dSZXRlbnRpb246IDMwLCAvLyAzMCBkYXlzIGZvciBzdGFnaW5nXHJcbiAgfSxcclxuICBcclxuICBjb3N0T3B0aW1pemF0aW9uOiB7XHJcbiAgICB0ZXh0cmFjdEFsYXJtVGhyZXNob2xkOiAzMDAsIC8vICQzMDAvbW9udGggZm9yIHN0YWdpbmdcclxuICAgIGJlZHJvY2tBbGFybVRocmVzaG9sZDogNTAwLCAvLyAkNTAwL21vbnRoIGZvciBzdGFnaW5nXHJcbiAgICBzM1N0b3JhZ2VBbGFybVRocmVzaG9sZDogMjAwLCAvLyAyMDAgR0IgZm9yIHN0YWdpbmdcclxuICB9LFxyXG4gIFxyXG4gIGZyb250ZW5kOiB7XHJcbiAgICBidWNrZXROYW1lOiAnc2F0eWFtb29sLXN0YWdpbmctZnJvbnRlbmQnLFxyXG4gICAgd2Vic2l0ZVVybDogJ2h0dHBzOi8vc3RhZ2luZy5zYXR5YW1vb2wuY29tJyxcclxuICB9LFxyXG4gIFxyXG4gIGVtYWlsOiB7XHJcbiAgICBmcm9tQWRkcmVzczogJ25vcmVwbHlAc2F0eWFtb29sLmNvbScsXHJcbiAgICByZXBseVRvQWRkcmVzczogJ3N1cHBvcnRAc2F0eWFtb29sLmNvbScsXHJcbiAgfSxcclxufTtcclxuXHJcbi8qKlxyXG4gKiBQcm9kdWN0aW9uIEVudmlyb25tZW50IENvbmZpZ3VyYXRpb25cclxuICovXHJcbmV4cG9ydCBjb25zdCBwcm9kQ29uZmlnOiBFbnZpcm9ubWVudENvbmZpZyA9IHtcclxuICBlbnZpcm9ubWVudDogJ3Byb2QnLFxyXG4gIHJlZ2lvbjogJ3VzLWVhc3QtMScsXHJcbiAgcmVzb3VyY2VQcmVmaXg6ICdzYXR5YW1vb2wtcHJvZCcsXHJcbiAgXHJcbiAgZHluYW1vZGI6IHtcclxuICAgIGJpbGxpbmdNb2RlOiAnUEFZX1BFUl9SRVFVRVNUJywgLy8gU3RhcnQgd2l0aCBvbi1kZW1hbmQsIHN3aXRjaCB0byBwcm92aXNpb25lZCBpZiBwcmVkaWN0YWJsZVxyXG4gICAgcG9pbnRJblRpbWVSZWNvdmVyeTogdHJ1ZSwgLy8gUmVxdWlyZWQgZm9yIHByb2R1Y3Rpb25cclxuICAgIHJlbW92YWxQb2xpY3k6ICdSRVRBSU4nLCAvLyBOZXZlciBkZWxldGUgcHJvZHVjdGlvbiBkYXRhXHJcbiAgfSxcclxuICBcclxuICBzMzoge1xyXG4gICAgdmVyc2lvbmluZzogdHJ1ZSwgLy8gUmVxdWlyZWQgZm9yIHByb2R1Y3Rpb25cclxuICAgIHJlbW92YWxQb2xpY3k6ICdSRVRBSU4nLFxyXG4gICAgbGlmZWN5Y2xlUG9saWNpZXM6IHRydWUsXHJcbiAgfSxcclxuICBcclxuICBsYW1iZGE6IHtcclxuICAgIHJlc2VydmVkQ29uY3VycmVuY3k6IHtcclxuICAgICAgb2NyOiAxMDAsIC8vIEZ1bGwgY29uY3VycmVuY3kgZm9yIHByb2R1Y3Rpb25cclxuICAgICAgdHJhbnNsYXRpb246IDEwMCxcclxuICAgICAgYW5hbHlzaXM6IDEwMCxcclxuICAgICAgbGluZWFnZTogNTAsXHJcbiAgICAgIHNjb3Jpbmc6IDUwLFxyXG4gICAgICBub3RpZmljYXRpb246IDUwLFxyXG4gICAgICBjbGVhbnVwOiAxLFxyXG4gICAgfSxcclxuICAgIG1lbW9yeVNpemU6IHtcclxuICAgICAgYXBpOiAyNTYsXHJcbiAgICAgIG9jcjogNTEyLFxyXG4gICAgICB0cmFuc2xhdGlvbjogNTEyLFxyXG4gICAgICBhbmFseXNpczogMTAyNCxcclxuICAgICAgbGluZWFnZTogNTEyLFxyXG4gICAgICBzY29yaW5nOiAyNTYsXHJcbiAgICAgIG5vdGlmaWNhdGlvbjogMjU2LFxyXG4gICAgICBjbGVhbnVwOiA1MTIsXHJcbiAgICB9LFxyXG4gICAgdGltZW91dDoge1xyXG4gICAgICBhcGk6IDMwLFxyXG4gICAgICBvY3I6IDMwMCxcclxuICAgICAgdHJhbnNsYXRpb246IDEyMCxcclxuICAgICAgYW5hbHlzaXM6IDE4MCxcclxuICAgICAgbGluZWFnZTogNjAsXHJcbiAgICAgIHNjb3Jpbmc6IDMwLFxyXG4gICAgICBub3RpZmljYXRpb246IDMwLFxyXG4gICAgICBjbGVhbnVwOiA5MDAsXHJcbiAgICB9LFxyXG4gICAgeHJheVRyYWNpbmc6IHRydWUsXHJcbiAgfSxcclxuICBcclxuICBhcGk6IHtcclxuICAgIHN0YWdlTmFtZTogJ3Byb2QnLFxyXG4gICAgdGhyb3R0bGluZzoge1xyXG4gICAgICByYXRlTGltaXQ6IDEwMCwgLy8gRnVsbCByYXRlIGxpbWl0IGZvciBwcm9kdWN0aW9uICgxMDAgcmVxL21pbiBwZXIgdXNlcilcclxuICAgICAgYnVyc3RMaW1pdDogMjAwLFxyXG4gICAgfSxcclxuICAgIGNhY2hpbmc6IHtcclxuICAgICAgZW5hYmxlZDogdHJ1ZSwgLy8gRW5hYmxlZCBmb3IgcHJvZHVjdGlvblxyXG4gICAgICB0dGw6IDMwMCxcclxuICAgICAgY2FjaGVDbHVzdGVyU2l6ZTogJzAuNScsXHJcbiAgICB9LFxyXG4gICAgY3VzdG9tRG9tYWluOiB7XHJcbiAgICAgIGRvbWFpbk5hbWU6ICdhcGkuc2F0eWFtb29sLmNvbScsXHJcbiAgICAgIGNlcnRpZmljYXRlQXJuOiAnYXJuOmF3czphY206dXMtZWFzdC0xOkFDQ09VTlRfSUQ6Y2VydGlmaWNhdGUvQ0VSVF9JRCcsIC8vIFRPRE86IFJlcGxhY2Ugd2l0aCBhY3R1YWwgY2VydGlmaWNhdGUgQVJOXHJcbiAgICB9LFxyXG4gICAgY29yczoge1xyXG4gICAgICBhbGxvd09yaWdpbnM6IFsnaHR0cHM6Ly9hcHAuc2F0eWFtb29sLmNvbScsICdodHRwczovL3d3dy5zYXR5YW1vb2wuY29tJ10sXHJcbiAgICB9LFxyXG4gIH0sXHJcbiAgXHJcbiAgY29nbml0bzoge1xyXG4gICAgdXNlclBvb2xOYW1lOiAnc2F0eWFtb29sLXByb2QtdXNlcnMnLFxyXG4gICAgcGFzc3dvcmRQb2xpY3k6IHtcclxuICAgICAgbWluTGVuZ3RoOiAxMiwgLy8gU3Ryb25nZXIgcGFzc3dvcmQgZm9yIHByb2R1Y3Rpb25cclxuICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcclxuICAgICAgcmVxdWlyZVVwcGVyY2FzZTogdHJ1ZSxcclxuICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcclxuICAgICAgcmVxdWlyZVN5bWJvbHM6IHRydWUsXHJcbiAgICB9LFxyXG4gICAgbWZhQ29uZmlndXJhdGlvbjogJ09QVElPTkFMJywgLy8gT3B0aW9uYWwgTUZBIGZvciBwcm9kdWN0aW9uXHJcbiAgICBlbWFpbFZlcmlmaWNhdGlvbjogdHJ1ZSxcclxuICAgIHBob25lVmVyaWZpY2F0aW9uOiB0cnVlLFxyXG4gIH0sXHJcbiAgXHJcbiAgY2xvdWRmcm9udDoge1xyXG4gICAgZW5hYmxlZDogdHJ1ZSwgLy8gUmVxdWlyZWQgZm9yIHByb2R1Y3Rpb25cclxuICAgIHByaWNlQ2xhc3M6ICdQcmljZUNsYXNzXzIwMCcsIC8vIEJldHRlciBnbG9iYWwgY292ZXJhZ2VcclxuICAgIGNhY2hlVHRsOiB7XHJcbiAgICAgIGRlZmF1bHQ6IDg2NDAwLCAvLyAyNCBob3Vyc1xyXG4gICAgICBtYXg6IDMxNTM2MDAwLCAvLyAxIHllYXJcclxuICAgICAgbWluOiAwLFxyXG4gICAgfSxcclxuICAgIGN1c3RvbURvbWFpbjoge1xyXG4gICAgICBkb21haW5OYW1lOiAnYXBwLnNhdHlhbW9vbC5jb20nLFxyXG4gICAgICBjZXJ0aWZpY2F0ZUFybjogJ2Fybjphd3M6YWNtOnVzLWVhc3QtMTpBQ0NPVU5UX0lEOmNlcnRpZmljYXRlL0NFUlRfSUQnLCAvLyBUT0RPOiBSZXBsYWNlIHdpdGggYWN0dWFsIGNlcnRpZmljYXRlIEFSTlxyXG4gICAgfSxcclxuICB9LFxyXG4gIFxyXG4gIG1vbml0b3Jpbmc6IHtcclxuICAgIGFsYXJtczoge1xyXG4gICAgICBlbmFibGVkOiB0cnVlLCAvLyBSZXF1aXJlZCBmb3IgcHJvZHVjdGlvblxyXG4gICAgICBzbnNUb3BpY0VtYWlsOiAnb3BzQHNhdHlhbW9vbC5jb20nLFxyXG4gICAgfSxcclxuICAgIGRhc2hib2FyZHM6IHtcclxuICAgICAgZW5hYmxlZDogdHJ1ZSxcclxuICAgIH0sXHJcbiAgICBsb2dSZXRlbnRpb246IDkwLCAvLyA5MCBkYXlzIGZvciBwcm9kdWN0aW9uXHJcbiAgfSxcclxuICBcclxuICBjb3N0T3B0aW1pemF0aW9uOiB7XHJcbiAgICB0ZXh0cmFjdEFsYXJtVGhyZXNob2xkOiA1MDAsIC8vICQ1MDAvbW9udGggZm9yIHByb2R1Y3Rpb25cclxuICAgIGJlZHJvY2tBbGFybVRocmVzaG9sZDogMTAwMCwgLy8gJDEwMDAvbW9udGggZm9yIHByb2R1Y3Rpb25cclxuICAgIHMzU3RvcmFnZUFsYXJtVGhyZXNob2xkOiAxMDAwLCAvLyAxIFRCIGZvciBwcm9kdWN0aW9uXHJcbiAgfSxcclxuICBcclxuICBmcm9udGVuZDoge1xyXG4gICAgYnVja2V0TmFtZTogJ3NhdHlhbW9vbC1wcm9kLWZyb250ZW5kJyxcclxuICAgIHdlYnNpdGVVcmw6ICdodHRwczovL2FwcC5zYXR5YW1vb2wuY29tJyxcclxuICB9LFxyXG4gIFxyXG4gIGVtYWlsOiB7XHJcbiAgICBmcm9tQWRkcmVzczogJ25vcmVwbHlAc2F0eWFtb29sLmNvbScsXHJcbiAgICByZXBseVRvQWRkcmVzczogJ3N1cHBvcnRAc2F0eWFtb29sLmNvbScsXHJcbiAgfSxcclxufTtcclxuXHJcbi8qKlxyXG4gKiBHZXQgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvbiBiYXNlZCBvbiBlbnZpcm9ubWVudCB2YXJpYWJsZVxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGdldEVudmlyb25tZW50Q29uZmlnKCk6IEVudmlyb25tZW50Q29uZmlnIHtcclxuICBjb25zdCBlbnYgPSBwcm9jZXNzLmVudi5ERVBMT1lNRU5UX0VOViB8fCAnZGV2JztcclxuICBcclxuICBzd2l0Y2ggKGVudikge1xyXG4gICAgY2FzZSAnc3RhZ2luZyc6XHJcbiAgICAgIHJldHVybiBzdGFnaW5nQ29uZmlnO1xyXG4gICAgY2FzZSAncHJvZCc6XHJcbiAgICBjYXNlICdwcm9kdWN0aW9uJzpcclxuICAgICAgcmV0dXJuIHByb2RDb25maWc7XHJcbiAgICBjYXNlICdkZXYnOlxyXG4gICAgY2FzZSAnZGV2ZWxvcG1lbnQnOlxyXG4gICAgZGVmYXVsdDpcclxuICAgICAgcmV0dXJuIGRldkNvbmZpZztcclxuICB9XHJcbn1cclxuIl19