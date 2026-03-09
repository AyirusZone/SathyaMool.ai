// Mock environment variables - must be set BEFORE importing the handler
process.env.USER_POOL_ID = 'us-east-1_TEST123456';
process.env.AWS_REGION = 'us-east-1';

// Generate RSA key pair for testing
const crypto = require('crypto');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

const mockPublicKey = publicKey;
const mockPrivateKey = privateKey;

// Mock jwks-rsa
jest.mock('jwks-rsa', () => {
  return {
    __esModule: true,
    default: jest.fn(() => ({
      getSigningKey: jest.fn((kid: string, callback: any) => {
        // Mock signing key
        callback(null, {
          getPublicKey: () => mockPublicKey,
        });
      }),
    })),
  };
});

import { APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
import jwt from 'jsonwebtoken';
import { handler } from '../index';

/**
 * Helper function to create a valid JWT token
 */
function createToken(payload: any): string {
  return jwt.sign(
    payload,
    mockPrivateKey,
    {
      algorithm: 'RS256',
      expiresIn: '1h',
      issuer: `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TEST123456`,
      header: {
        alg: 'RS256',
        kid: 'test-kid-123',
      },
    } as jwt.SignOptions
  );
}

/**
 * Helper function to create a mock authorizer event
 */
function createAuthorizerEvent(token: string): APIGatewayTokenAuthorizerEvent {
  return {
    type: 'TOKEN',
    methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/GET/properties',
    authorizationToken: token,
  };
}

describe('Lambda Authorizer', () => {
  describe('Token Validation', () => {
    it('should allow access with valid token and Standard_User role', async () => {
      const token = createToken({
        sub: 'user-123',
        email: 'user@example.com',
        'custom:role': 'Standard_User',
      });

      const event = createAuthorizerEvent(`Bearer ${token}`);
      const result = await handler(event);

      expect(result.principalId).toBe('user-123');
      expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
      expect(result.context?.userId).toBe('user-123');
      expect(result.context?.email).toBe('user@example.com');
      expect(result.context?.role).toBe('Standard_User');
    });

    it('should allow access with valid token and Professional_User role', async () => {
      const token = createToken({
        sub: 'user-456',
        email: 'professional@example.com',
        'custom:role': 'Professional_User',
      });

      const event = createAuthorizerEvent(`Bearer ${token}`);
      const result = await handler(event);

      expect(result.principalId).toBe('user-456');
      expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
      expect(result.context?.role).toBe('Professional_User');
    });

    it('should allow access with valid token and Admin_User role', async () => {
      const token = createToken({
        sub: 'admin-789',
        email: 'admin@example.com',
        'custom:role': 'Admin_User',
      });

      const event = createAuthorizerEvent(`Bearer ${token}`);
      const result = await handler(event);

      expect(result.principalId).toBe('admin-789');
      expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
      expect(result.context?.role).toBe('Admin_User');
    });

    it('should handle token without Bearer prefix', async () => {
      const token = createToken({
        sub: 'user-123',
        email: 'user@example.com',
        'custom:role': 'Standard_User',
      });

      const event = createAuthorizerEvent(token);
      const result = await handler(event);

      expect(result.principalId).toBe('user-123');
      expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    });

    it('should default to Standard_User when no role is provided', async () => {
      const token = createToken({
        sub: 'user-999',
        email: 'norole@example.com',
      });

      const event = createAuthorizerEvent(`Bearer ${token}`);
      const result = await handler(event);

      expect(result.principalId).toBe('user-999');
      expect(result.context?.role).toBe('Standard_User');
    });

    it('should extract role from cognito:groups when custom:role is not present', async () => {
      const token = createToken({
        sub: 'user-777',
        email: 'group@example.com',
        'cognito:groups': ['Professional_User', 'OtherGroup'],
      });

      const event = createAuthorizerEvent(`Bearer ${token}`);
      const result = await handler(event);

      expect(result.principalId).toBe('user-777');
      expect(result.context?.role).toBe('Professional_User');
    });

    it('should deny access with missing authorization token', async () => {
      const event = createAuthorizerEvent('');

      await expect(handler(event)).rejects.toThrow('Unauthorized');
    });

    it('should deny access with invalid token format', async () => {
      const event = createAuthorizerEvent('Bearer invalid-token-format');

      await expect(handler(event)).rejects.toThrow();
    });

    it('should deny access with expired token', async () => {
      const expiredToken = jwt.sign(
        {
          sub: 'user-123',
          email: 'user@example.com',
          'custom:role': 'Standard_User',
        },
        mockPrivateKey,
        {
          algorithm: 'RS256',
          expiresIn: '-1h', // Expired 1 hour ago
          issuer: `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TEST123456`,
          header: {
            alg: 'RS256',
            kid: 'test-kid-123',
          },
        } as jwt.SignOptions
      );

      const event = createAuthorizerEvent(`Bearer ${expiredToken}`);

      await expect(handler(event)).rejects.toThrow();
    });

    it('should deny access with token from wrong issuer', async () => {
      const wrongIssuerToken = jwt.sign(
        {
          sub: 'user-123',
          email: 'user@example.com',
          'custom:role': 'Standard_User',
        },
        mockPrivateKey,
        {
          algorithm: 'RS256',
          expiresIn: '1h',
          issuer: 'https://wrong-issuer.com',
          header: {
            alg: 'RS256',
            kid: 'test-kid-123',
          },
        } as jwt.SignOptions
      );

      const event = createAuthorizerEvent(`Bearer ${wrongIssuerToken}`);

      await expect(handler(event)).rejects.toThrow();
    });
  });

  describe('Role Extraction', () => {
    it('should handle invalid role by defaulting to Standard_User', async () => {
      const token = createToken({
        sub: 'user-888',
        email: 'invalid@example.com',
        'custom:role': 'InvalidRole',
      });

      const event = createAuthorizerEvent(`Bearer ${token}`);
      const result = await handler(event);

      expect(result.context?.role).toBe('Standard_User');
    });

    it('should handle empty cognito:groups array', async () => {
      const token = createToken({
        sub: 'user-666',
        email: 'empty@example.com',
        'cognito:groups': [],
      });

      const event = createAuthorizerEvent(`Bearer ${token}`);
      const result = await handler(event);

      expect(result.context?.role).toBe('Standard_User');
    });

    it('should prioritize custom:role over cognito:groups', async () => {
      const token = createToken({
        sub: 'user-555',
        email: 'priority@example.com',
        'custom:role': 'Admin_User',
        'cognito:groups': ['Standard_User'],
      });

      const event = createAuthorizerEvent(`Bearer ${token}`);
      const result = await handler(event);

      expect(result.context?.role).toBe('Admin_User');
    });
  });

  describe('Policy Generation', () => {
    it('should generate policy with correct resource ARN', async () => {
      const token = createToken({
        sub: 'user-123',
        email: 'user@example.com',
        'custom:role': 'Standard_User',
      });

      const methodArn = 'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/GET/properties';
      const event = createAuthorizerEvent(`Bearer ${token}`);
      event.methodArn = methodArn;

      const result = await handler(event);

      // Check that the policy document contains the correct resource
      const statement = result.policyDocument.Statement[0];
      expect(statement).toHaveProperty('Resource');
      expect((statement as any).Resource).toBe(methodArn);
    });

    it('should include user context in policy', async () => {
      const token = createToken({
        sub: 'user-123',
        email: 'user@example.com',
        'custom:role': 'Professional_User',
      });

      const event = createAuthorizerEvent(`Bearer ${token}`);
      const result = await handler(event);

      expect(result.context).toBeDefined();
      expect(result.context?.userId).toBe('user-123');
      expect(result.context?.email).toBe('user@example.com');
      expect(result.context?.role).toBe('Professional_User');
    });

    it('should handle missing email in token', async () => {
      const token = createToken({
        sub: 'user-123',
        'custom:role': 'Standard_User',
      });

      const event = createAuthorizerEvent(`Bearer ${token}`);
      const result = await handler(event);

      expect(result.context?.email).toBe('');
    });
  });
});
