/**
 * State Portal Configuration Management
 *
 * Manages state-specific configuration for government portal integrations.
 * Stores portal endpoints, credentials, and response formats.
 *
 * Requirements: 19.2, 19.4
 */
/**
 * State portal configuration schema
 */
export interface StatePortalConfig {
    state: string;
    enabled: boolean;
    status: 'active' | 'inactive' | 'maintenance';
    portalEndpoint: string;
    authType: 'api_key' | 'oauth' | 'certificate';
    credentialsSecretArn?: string;
    requestFormat: {
        method: 'GET' | 'POST' | 'PUT';
        contentType: string;
        requiredFields: string[];
        optionalFields?: string[];
    };
    responseFormat: {
        contentType: string;
        dataPath: string;
        statusField: string;
        errorField?: string;
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
export declare function getStatePortalConfig(state: string): Promise<StatePortalConfig | null>;
/**
 * Create or update state portal configuration
 */
export declare function putStatePortalConfig(config: StatePortalConfig): Promise<void>;
/**
 * List all state portal configurations
 */
export declare function listStatePortalConfigs(): Promise<StatePortalConfig[]>;
/**
 * Check if state portal integration is available
 */
export declare function isStatePortalAvailable(state: string): Promise<boolean>;
/**
 * Initialize default state configurations (for future use)
 */
export declare function initializeDefaultConfigs(): Promise<void>;
