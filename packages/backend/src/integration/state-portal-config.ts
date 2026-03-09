/**
 * State Portal Configuration Management
 * 
 * Manages state-specific configuration for government portal integrations.
 * Stores portal endpoints, credentials, and response formats.
 * 
 * Requirements: 19.2, 19.4
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const STATE_CONFIG_TABLE = process.env.STATE_CONFIG_TABLE || 'SatyaMool-StatePortalConfigurations';

/**
 * State portal configuration schema
 */
export interface StatePortalConfig {
  state: string; // Primary key: State name (e.g., "Karnataka", "Tamil Nadu")
  enabled: boolean; // Whether integration is enabled
  status: 'active' | 'inactive' | 'maintenance'; // Current status
  portalEndpoint: string; // API endpoint for the state portal
  authType: 'api_key' | 'oauth' | 'certificate'; // Authentication method
  credentialsSecretArn?: string; // ARN of AWS Secrets Manager secret containing credentials
  requestFormat: {
    method: 'GET' | 'POST' | 'PUT';
    contentType: string;
    requiredFields: string[]; // Required fields for EC retrieval
    optionalFields?: string[];
  };
  responseFormat: {
    contentType: string;
    dataPath: string; // JSON path to extract EC data
    statusField: string; // Field indicating request status
    errorField?: string; // Field containing error messages
  };
  webhookConfig?: {
    enabled: boolean;
    callbackUrl: string;
    authToken?: string;
  };
  rateLimits?: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
  metadata?: {
    contactEmail?: string;
    documentationUrl?: string;
    lastUpdated?: string;
    notes?: string;
  };
}

/**
 * Get state portal configuration
 */
export async function getStatePortalConfig(state: string): Promise<StatePortalConfig | null> {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: STATE_CONFIG_TABLE,
      Key: { state }
    }));

    return result.Item as StatePortalConfig || null;
  } catch (error) {
    console.error(`Failed to get state portal config for ${state}:`, error);
    throw error;
  }
}

/**
 * Create or update state portal configuration
 */
export async function putStatePortalConfig(config: StatePortalConfig): Promise<void> {
  try {
    await docClient.send(new PutCommand({
      TableName: STATE_CONFIG_TABLE,
      Item: {
        ...config,
        lastUpdated: new Date().toISOString()
      }
    }));
  } catch (error) {
    console.error(`Failed to put state portal config for ${config.state}:`, error);
    throw error;
  }
}

/**
 * List all state portal configurations
 */
export async function listStatePortalConfigs(): Promise<StatePortalConfig[]> {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: STATE_CONFIG_TABLE
    }));

    return (result.Items || []) as StatePortalConfig[];
  } catch (error) {
    console.error('Failed to list state portal configs:', error);
    throw error;
  }
}

/**
 * Check if state portal integration is available
 */
export async function isStatePortalAvailable(state: string): Promise<boolean> {
  try {
    const config = await getStatePortalConfig(state);
    return config?.enabled === true && config?.status === 'active';
  } catch (error) {
    console.error(`Failed to check availability for ${state}:`, error);
    return false;
  }
}

/**
 * Initialize default state configurations (for future use)
 */
export async function initializeDefaultConfigs(): Promise<void> {
  const defaultConfigs: StatePortalConfig[] = [
    {
      state: 'Karnataka',
      enabled: false,
      status: 'inactive',
      portalEndpoint: 'https://kaveri.karnataka.gov.in/api/ec',
      authType: 'api_key',
      requestFormat: {
        method: 'POST',
        contentType: 'application/json',
        requiredFields: ['surveyNumber', 'district', 'taluk', 'village']
      },
      responseFormat: {
        contentType: 'application/json',
        dataPath: 'data.encumbranceCertificate',
        statusField: 'status'
      },
      metadata: {
        notes: 'Placeholder configuration for Karnataka Kaveri portal integration'
      }
    },
    {
      state: 'Tamil Nadu',
      enabled: false,
      status: 'inactive',
      portalEndpoint: 'https://tnreginet.gov.in/api/ec',
      authType: 'api_key',
      requestFormat: {
        method: 'POST',
        contentType: 'application/json',
        requiredFields: ['surveyNumber', 'district', 'taluk', 'village']
      },
      responseFormat: {
        contentType: 'application/json',
        dataPath: 'data.ec',
        statusField: 'status'
      },
      metadata: {
        notes: 'Placeholder configuration for Tamil Nadu TNREGINET portal integration'
      }
    },
    {
      state: 'Maharashtra',
      enabled: false,
      status: 'inactive',
      portalEndpoint: 'https://igrmaharashtra.gov.in/api/ec',
      authType: 'api_key',
      requestFormat: {
        method: 'POST',
        contentType: 'application/json',
        requiredFields: ['surveyNumber', 'district', 'taluk']
      },
      responseFormat: {
        contentType: 'application/json',
        dataPath: 'data.encumbrance',
        statusField: 'status'
      },
      metadata: {
        notes: 'Placeholder configuration for Maharashtra IGR portal integration'
      }
    }
  ];

  for (const config of defaultConfigs) {
    try {
      await putStatePortalConfig(config);
      console.log(`Initialized config for ${config.state}`);
    } catch (error) {
      console.error(`Failed to initialize config for ${config.state}:`, error);
    }
  }
}
