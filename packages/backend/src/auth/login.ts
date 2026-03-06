import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  createAuditLog,
  AuditAction,
  ResourceType,
  extractIpAddress,
  extractUserAgent,
  extractRequestId,
} from '../audit';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID!;
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'SatyaMool-Users';

interface LoginRequest {
  username?: string; // email or phone number
  email?: string; // alternative to username
  phoneNumber?: string; // alternative to username
  password: string;
}

interface LoginResponse {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  userId: string;
  role: string;
}

interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Lambda handler for user login
 * Authenticates users via Cognito and issues JWT tokens with role claims
 * Logs authentication events to AuditLogs table
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Login request received:', JSON.stringify(event, null, 2));

  const requestId = extractRequestId(event);
  const ipAddress = extractIpAddress(event);
  const userAgent = extractUserAgent(event);

  try {
    // Parse request body
    if (!event.body) {
      return createErrorResponse(400, 'MISSING_BODY', 'Request body is required');
    }

    const body: LoginRequest = JSON.parse(event.body);

    // Determine username from email, phoneNumber, or username field
    const username = body.username || body.email || body.phoneNumber;

    // Validate input
    if (!username || !body.password) {
      return createErrorResponse(
        400,
        'MISSING_CREDENTIALS',
        'Username and password are required'
      );
    }

    // Authenticate with Cognito using USER_PASSWORD_AUTH flow
    const authCommand = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: USER_POOL_CLIENT_ID,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: body.password,
      },
    });

    const authResponse = await cognitoClient.send(authCommand);

    if (!authResponse.AuthenticationResult) {
      return createErrorResponse(
        401,
        'AUTHENTICATION_FAILED',
        'Invalid username or password'
      );
    }

    // Extract tokens
    const accessToken = authResponse.AuthenticationResult.AccessToken!;
    const idToken = authResponse.AuthenticationResult.IdToken!;
    const refreshToken = authResponse.AuthenticationResult.RefreshToken!;
    const expiresIn = authResponse.AuthenticationResult.ExpiresIn!;

    // Get user details from Cognito to extract userId and role
    const getUserCommand = new GetUserCommand({
      AccessToken: accessToken,
    });

    const userResponse = await cognitoClient.send(getUserCommand);

    // Extract user attributes
    const userAttributes = userResponse.UserAttributes || [];
    const userId =
      userAttributes.find((attr) => attr.Name === 'sub')?.Value || '';
    const role =
      userAttributes.find((attr) => attr.Name === 'custom:role')?.Value ||
      'Standard_User';

    // Update last login timestamp in DynamoDB Users table
    const now = new Date().toISOString();
    const updateCommand = new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { userId: userId },
      UpdateExpression: 'SET lastLogin = :lastLogin',
      ExpressionAttributeValues: {
        ':lastLogin': now,
      },
    });

    await docClient.send(updateCommand);

    // Log successful authentication event using audit module
    await createAuditLog({
      userId: userId,
      action: AuditAction.USER_LOGIN,
      resourceType: ResourceType.USER,
      resourceId: userId,
      requestId: requestId,
      ipAddress: ipAddress,
      userAgent: userAgent,
      metadata: {
        username: username,
        role: role,
      },
    });

    // Prepare response
    const response: LoginResponse = {
      accessToken: accessToken,
      idToken: idToken,
      refreshToken: refreshToken,
      expiresIn: expiresIn,
      tokenType: 'Bearer',
      userId: userId,
      role: role,
    };

    console.log('Login successful, returning response with userId:', userId, 'role:', role);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('Login error:', error);

    // Handle Cognito-specific errors
    if (error.name === 'NotAuthorizedException') {
      return createErrorResponse(
        401,
        'INVALID_CREDENTIALS',
        'Invalid username or password'
      );
    }

    if (error.name === 'UserNotConfirmedException') {
      return createErrorResponse(
        403,
        'USER_NOT_CONFIRMED',
        'User account is not confirmed. Please verify your account.'
      );
    }

    if (error.name === 'UserNotFoundException') {
      return createErrorResponse(
        401,
        'INVALID_CREDENTIALS',
        'Invalid username or password'
      );
    }

    if (error.name === 'PasswordResetRequiredException') {
      return createErrorResponse(
        403,
        'PASSWORD_RESET_REQUIRED',
        'Password reset is required for this account'
      );
    }

    if (error.name === 'TooManyRequestsException') {
      return createErrorResponse(
        429,
        'TOO_MANY_REQUESTS',
        'Too many login attempts. Please try again later.'
      );
    }

    // Generic error response
    return createErrorResponse(
      500,
      'INTERNAL_ERROR',
      'An error occurred during login. Please try again.'
    );
  }
};

/**
 * Create error response
 */
function createErrorResponse(
  statusCode: number,
  errorCode: string,
  message: string
): APIGatewayProxyResult {
  const errorResponse: ErrorResponse = {
    error: errorCode,
    message: message,
  };

  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(errorResponse),
  };
}
