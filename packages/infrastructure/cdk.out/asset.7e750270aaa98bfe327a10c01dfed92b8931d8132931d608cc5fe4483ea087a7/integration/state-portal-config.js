"use strict";
/**
 * State Portal Configuration Management
 *
 * Manages state-specific configuration for government portal integrations.
 * Stores portal endpoints, credentials, and response formats.
 *
 * Requirements: 19.2, 19.4
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStatePortalConfig = getStatePortalConfig;
exports.putStatePortalConfig = putStatePortalConfig;
exports.listStatePortalConfigs = listStatePortalConfigs;
exports.isStatePortalAvailable = isStatePortalAvailable;
exports.initializeDefaultConfigs = initializeDefaultConfigs;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const STATE_CONFIG_TABLE = process.env.STATE_CONFIG_TABLE || 'SatyaMool-StatePortalConfigurations';
/**
 * Get state portal configuration
 */
async function getStatePortalConfig(state) {
    try {
        const result = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: STATE_CONFIG_TABLE,
            Key: { state }
        }));
        return result.Item || null;
    }
    catch (error) {
        console.error(`Failed to get state portal config for ${state}:`, error);
        throw error;
    }
}
/**
 * Create or update state portal configuration
 */
async function putStatePortalConfig(config) {
    try {
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: STATE_CONFIG_TABLE,
            Item: {
                ...config,
                lastUpdated: new Date().toISOString()
            }
        }));
    }
    catch (error) {
        console.error(`Failed to put state portal config for ${config.state}:`, error);
        throw error;
    }
}
/**
 * List all state portal configurations
 */
async function listStatePortalConfigs() {
    try {
        const result = await docClient.send(new lib_dynamodb_1.ScanCommand({
            TableName: STATE_CONFIG_TABLE
        }));
        return (result.Items || []);
    }
    catch (error) {
        console.error('Failed to list state portal configs:', error);
        throw error;
    }
}
/**
 * Check if state portal integration is available
 */
async function isStatePortalAvailable(state) {
    try {
        const config = await getStatePortalConfig(state);
        return config?.enabled === true && config?.status === 'active';
    }
    catch (error) {
        console.error(`Failed to check availability for ${state}:`, error);
        return false;
    }
}
/**
 * Initialize default state configurations (for future use)
 */
async function initializeDefaultConfigs() {
    const defaultConfigs = [
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
        }
        catch (error) {
            console.error(`Failed to initialize config for ${config.state}:`, error);
        }
    }
}
//# sourceMappingURL=state-portal-config.js.map