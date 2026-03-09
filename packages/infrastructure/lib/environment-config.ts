/**
 * Environment-specific configuration for SatyaMool deployment
 * 
 * This file defines configuration for dev, staging, and production environments
 * including resource names, capacity settings, and feature flags.
 */

export interface EnvironmentConfig {
  // Environment identifier
  environment: 'dev' | 'staging' | 'prod';
  
  // AWS Account and Region
  account?: string;
  region: string;
  
  // Resource naming
  resourcePrefix: string;
  
  // DynamoDB Configuration
  dynamodb: {
    billingMode: 'PAY_PER_REQUEST' | 'PROVISIONED';
    pointInTimeRecovery: boolean;
    removalPolicy: 'DESTROY' | 'RETAIN';
  };
  
  // S3 Configuration
  s3: {
    versioning: boolean;
    removalPolicy: 'DESTROY' | 'RETAIN';
    lifecyclePolicies: boolean;
  };
  
  // Lambda Configuration
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
      api: number; // seconds
      ocr: number; // seconds
      translation: number; // seconds
      analysis: number; // seconds
      lineage: number; // seconds
      scoring: number; // seconds
      notification: number; // seconds
      cleanup: number; // seconds
    };
    xrayTracing: boolean;
  };
  
  // API Gateway Configuration
  api: {
    stageName: string;
    throttling: {
      rateLimit: number; // requests per second
      burstLimit: number;
    };
    caching: {
      enabled: boolean;
      ttl: number; // seconds
      cacheClusterSize: string; // '0.5' | '1.6' | '6.1' | '13.5' | '28.4' | '58.2' | '118' | '237'
    };
    customDomain?: {
      domainName: string;
      certificateArn: string;
    };
    cors: {
      allowOrigins: string[];
    };
  };
  
  // Cognito Configuration
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
  
  // CloudFront Configuration
  cloudfront: {
    enabled: boolean;
    priceClass: 'PriceClass_100' | 'PriceClass_200' | 'PriceClass_All';
    cacheTtl: {
      default: number; // seconds
      max: number; // seconds
      min: number; // seconds
    };
    customDomain?: {
      domainName: string;
      certificateArn: string;
    };
  };
  
  // Monitoring Configuration
  monitoring: {
    alarms: {
      enabled: boolean;
      snsTopicEmail?: string;
    };
    dashboards: {
      enabled: boolean;
    };
    logRetention: number; // days
  };
  
  // Cost Optimization
  costOptimization: {
    textractAlarmThreshold: number; // dollars per month
    bedrockAlarmThreshold: number; // dollars per month
    s3StorageAlarmThreshold: number; // GB
  };
  
  // Frontend Configuration
  frontend: {
    bucketName: string;
    websiteUrl: string;
  };
  
  // Email Configuration
  email: {
    fromAddress: string;
    replyToAddress?: string;
  };
}

/**
 * Development Environment Configuration
 */
export const devConfig: EnvironmentConfig = {
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
export const stagingConfig: EnvironmentConfig = {
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
export const prodConfig: EnvironmentConfig = {
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
export function getEnvironmentConfig(): EnvironmentConfig {
  const env = process.env.DEPLOYMENT_ENV || 'dev';
  
  switch (env) {
    case 'staging':
      return stagingConfig;
    case 'prod':
    case 'production':
      return prodConfig;
    case 'dev':
    case 'development':
    default:
      return devConfig;
  }
}
