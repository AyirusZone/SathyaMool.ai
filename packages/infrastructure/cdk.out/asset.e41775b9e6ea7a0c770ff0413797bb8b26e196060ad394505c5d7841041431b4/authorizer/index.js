"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwks_rsa_1 = __importDefault(require("jwks-rsa"));
// Environment variables
const USER_POOL_ID = process.env.USER_POOL_ID;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
// Valid roles
var UserRole;
(function (UserRole) {
    UserRole["STANDARD_USER"] = "Standard_User";
    UserRole["PROFESSIONAL_USER"] = "Professional_User";
    UserRole["ADMIN_USER"] = "Admin_User";
})(UserRole || (UserRole = {}));
// JWKS client for fetching public keys
const client = (0, jwks_rsa_1.default)({
    jwksUri: `https://cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`,
    cache: true,
    cacheMaxAge: 3600000, // 1 hour
    rateLimit: true,
    jwksRequestsPerMinute: 10,
});
/**
 * Get signing key from JWKS
 */
function getSigningKey(kid) {
    return new Promise((resolve, reject) => {
        client.getSigningKey(kid, (err, key) => {
            if (err) {
                reject(err);
            }
            else {
                const signingKey = key?.getPublicKey();
                resolve(signingKey);
            }
        });
    });
}
/**
 * Verify and decode JWT token
 */
async function verifyToken(token) {
    // Decode token header to get kid
    const decodedHeader = jsonwebtoken_1.default.decode(token, { complete: true });
    if (!decodedHeader || typeof decodedHeader === 'string') {
        throw new Error('Invalid token format');
    }
    const kid = decodedHeader.header.kid;
    if (!kid) {
        throw new Error('Token missing kid in header');
    }
    // Get signing key
    const signingKey = await getSigningKey(kid);
    // Verify token
    const decoded = jsonwebtoken_1.default.verify(token, signingKey, {
        algorithms: ['RS256'],
        issuer: `https://cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}`,
    });
    return decoded;
}
/**
 * Extract role from token claims
 */
function extractRole(decodedToken) {
    // Role can be in custom:role attribute or cognito:groups
    const customRole = decodedToken['custom:role'];
    const groups = decodedToken['cognito:groups'];
    let role;
    if (customRole) {
        role = customRole;
    }
    else if (groups && Array.isArray(groups) && groups.length > 0) {
        role = groups[0]; // Take first group as role
    }
    // Validate role
    if (!role || !Object.values(UserRole).includes(role)) {
        // Default to Standard_User if no valid role found
        return UserRole.STANDARD_USER;
    }
    return role;
}
/**
 * Generate IAM policy for API Gateway
 */
function generatePolicy(principalId, effect, resource, context) {
    const policyDocument = {
        Version: '2012-10-17',
        Statement: [
            {
                Action: 'execute-api:Invoke',
                Effect: effect,
                Resource: resource,
            },
        ],
    };
    return {
        principalId,
        policyDocument,
        context,
    };
}
/**
 * Lambda authorizer handler
 */
async function handler(event) {
    console.log('Authorizer invoked', { methodArn: event.methodArn });
    try {
        // Extract token from Authorization header
        const token = event.authorizationToken;
        if (!token) {
            console.error('No authorization token provided');
            throw new Error('Unauthorized');
        }
        // Remove 'Bearer ' prefix if present
        const cleanToken = token.replace(/^Bearer\s+/i, '');
        // Verify token
        const decodedToken = await verifyToken(cleanToken);
        console.log('Token verified successfully', { sub: decodedToken.sub });
        // Extract user information
        const userId = decodedToken.sub;
        const email = decodedToken.email;
        const role = extractRole(decodedToken);
        console.log('User authenticated', { userId, email, role });
        // Generate allow policy with user context
        // Use wildcard to allow all API calls after authentication
        // Format: arn:aws:execute-api:region:account:api-id/stage/*/*
        const arnParts = event.methodArn.split('/');
        const apiGatewayArnPrefix = arnParts.slice(0, 2).join('/'); // arn:aws:execute-api:region:account:api-id/stage
        const wildcardArn = `${apiGatewayArnPrefix}/*/*`;
        return generatePolicy(userId, 'Allow', wildcardArn, {
            userId,
            email: email || '',
            role,
        });
    }
    catch (error) {
        console.error('Authorization failed', { error });
        // Return deny policy
        // Note: In production, you might want to return a more specific error
        throw new Error('Unauthorized');
    }
}
//# sourceMappingURL=index.js.map