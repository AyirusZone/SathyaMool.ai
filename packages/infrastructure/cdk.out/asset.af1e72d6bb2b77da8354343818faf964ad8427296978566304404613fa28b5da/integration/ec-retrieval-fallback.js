"use strict";
/**
 * EC Retrieval Fallback Logic
 *
 * Detects portal integration availability and falls back to manual EC upload
 * when government portal integration is unavailable.
 *
 * Requirements: 19.3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.determineECRetrievalStrategy = determineECRetrievalStrategy;
exports.isManualUploadRequired = isManualUploadRequired;
exports.getECRetrievalMessage = getECRetrievalMessage;
exports.getManualUploadInstructions = getManualUploadInstructions;
exports.getECRetrievalInfo = getECRetrievalInfo;
const state_portal_config_1 = require("./state-portal-config");
/**
 * Determine EC retrieval strategy for a given state
 *
 * This function checks if government portal integration is available
 * and returns the appropriate strategy (portal or manual).
 *
 * Requirements: 19.3
 */
async function determineECRetrievalStrategy(state) {
    try {
        // Check if state portal integration is available
        const isAvailable = await (0, state_portal_config_1.isStatePortalAvailable)(state);
        if (isAvailable) {
            // Portal integration is available
            const config = await (0, state_portal_config_1.getStatePortalConfig)(state);
            return {
                strategy: 'portal',
                available: true,
                message: `Government portal integration is available for ${state}. EC will be retrieved automatically.`,
                portalEndpoint: config?.portalEndpoint
            };
        }
        else {
            // Portal integration is not available - fallback to manual
            const config = await (0, state_portal_config_1.getStatePortalConfig)(state);
            let fallbackReason = 'Portal integration not configured';
            if (config) {
                if (!config.enabled) {
                    fallbackReason = 'Portal integration is disabled';
                }
                else if (config.status !== 'active') {
                    fallbackReason = `Portal is in ${config.status} status`;
                }
            }
            return {
                strategy: 'manual',
                available: false,
                message: `Government portal integration is not available for ${state}. Please upload Encumbrance Certificate manually.`,
                fallbackReason
            };
        }
    }
    catch (error) {
        console.error(`Error determining EC retrieval strategy for ${state}:`, error);
        // On error, fallback to manual upload
        return {
            strategy: 'manual',
            available: false,
            message: `Unable to check portal availability for ${state}. Please upload Encumbrance Certificate manually.`,
            fallbackReason: 'Error checking portal availability'
        };
    }
}
/**
 * Check if manual EC upload is required
 */
async function isManualUploadRequired(state) {
    const result = await determineECRetrievalStrategy(state);
    return result.strategy === 'manual';
}
/**
 * Get user-friendly message for EC retrieval
 */
async function getECRetrievalMessage(state) {
    const result = await determineECRetrievalStrategy(state);
    return result.message;
}
/**
 * Get fallback instructions for manual upload
 */
function getManualUploadInstructions(state) {
    const stateSpecificInstructions = {
        'Karnataka': 'Visit https://kaveri.karnataka.gov.in to obtain your Encumbrance Certificate, then upload it here.',
        'Tamil Nadu': 'Visit https://tnreginet.gov.in to obtain your Encumbrance Certificate, then upload it here.',
        'Maharashtra': 'Visit https://igrmaharashtra.gov.in to obtain your Encumbrance Certificate, then upload it here.',
        'Telangana': 'Visit https://registration.telangana.gov.in to obtain your Encumbrance Certificate, then upload it here.',
        'Andhra Pradesh': 'Visit https://registration.ap.gov.in to obtain your Encumbrance Certificate, then upload it here.',
        'Kerala': 'Visit https://eregistration.kerala.gov.in to obtain your Encumbrance Certificate, then upload it here.',
        'Gujarat': 'Visit https://igrsgujarat.gov.in to obtain your Encumbrance Certificate, then upload it here.',
        'Rajasthan': 'Visit https://igrsrajasthan.gov.in to obtain your Encumbrance Certificate, then upload it here.',
        'Madhya Pradesh': 'Visit https://mpigr.gov.in to obtain your Encumbrance Certificate, then upload it here.',
        'Uttar Pradesh': 'Visit https://igrsup.gov.in to obtain your Encumbrance Certificate, then upload it here.'
    };
    return stateSpecificInstructions[state] ||
        'Please obtain your Encumbrance Certificate from your state\'s registration department and upload it here.';
}
/**
 * Get comprehensive EC retrieval information
 */
async function getECRetrievalInfo(state) {
    const result = await determineECRetrievalStrategy(state);
    if (result.strategy === 'manual') {
        return {
            ...result,
            manualUploadInstructions: getManualUploadInstructions(state)
        };
    }
    return result;
}
//# sourceMappingURL=ec-retrieval-fallback.js.map