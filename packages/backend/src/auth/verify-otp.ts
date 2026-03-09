import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID!;
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'SatyaMool-Users';

interface VerifyOtpRequest {
  username: string; // email or phone number
  code: string;
}

interface VerifyOtpResponse {
  message: string;
  userId: string;
  status: string;
}

interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Lambda handler for OTP verification
 * Verifies phone OTP and completes user registration
 * Requirement 1.3: Verify OTP before account creation
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('OTP verification request received:', JSON.stringify(event, null, 2));

  try {
    // Parse request body
    if (!event.body) {
      return createErrorResponse(400, 'MISSING_BODY', 'Request body is required');
    }

    const body: VerifyOtpRequest = JSON.parse(event.body);

    // Validate input
    if (!body.username || !body.code) {
      return createErrorResponse(
        400,
        'MISSING_PARAMETERS',
        'Username and verification code are required'
      );
    }

    // Confirm sign up with Cognito
    const confirmCommand = new ConfirmSignUpCommand({
      ClientId: USER_POOL_CLIENT_ID,
      Username: body.username,
      ConfirmationCode: body.code,
    });

    await cognitoClient.send(confirmCommand);

    console.log('OTP verification successful for user:', body.username);

    // Update user status in DynamoDB to 'active'
    // First, find the user by username (email or phone)
    const userId = await findUserIdByUsername(body.username);

    if (userId) {
      const updateCommand = new UpdateCommand({
        TableName: USERS_TABLE_NAME,
        Key: { userId: userId },
        UpdateExpression: 'SET #status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': 'active',
        },
      });

      await docClient.send(updateCommand);

      console.log('User status updated to active in DynamoDB:', userId);
    }

    // Prepare response
    const response: VerifyOtpResponse = {
      message: 'Account verified successfully. You can now log in.',
      userId: userId || 'unknown',
      status: 'active',
    };

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
    console.error('OTP verification error:', error);

    // Handle Cognito-specific errors
    if (error.name === 'CodeMismatchException') {
      return createErrorResponse(
        400,
        'INVALID_CODE',
        'Invalid verification code. Please check and try again.'
      );
    }

    if (error.name === 'ExpiredCodeException') {
      return createErrorResponse(
        400,
        'EXPIRED_CODE',
        'Verification code has expired. Please request a new code.'
      );
    }

    if (error.name === 'NotAuthorizedException') {
      return createErrorResponse(
        403,
        'NOT_AUTHORIZED',
        'User cannot be confirmed. Account may already be verified.'
      );
    }

    if (error.name === 'UserNotFoundException') {
      return createErrorResponse(
        404,
        'USER_NOT_FOUND',
        'User not found. Please check the username.'
      );
    }

    if (error.name === 'TooManyFailedAttemptsException') {
      return createErrorResponse(
        429,
        'TOO_MANY_ATTEMPTS',
        'Too many failed verification attempts. Please try again later.'
      );
    }

    if (error.name === 'LimitExceededException') {
      return createErrorResponse(
        429,
        'LIMIT_EXCEEDED',
        'Attempt limit exceeded. Please try again later.'
      );
    }

    // Generic error response
    return createErrorResponse(
      500,
      'INTERNAL_ERROR',
      'An error occurred during verification. Please try again.'
    );
  }
};

/**
 * Find userId by username (email or phone number)
 * Scans the Users table to find matching user
 */
async function findUserIdByUsername(username: string): Promise<string | null> {
  try {
    // Try to find by email
    const emailQuery = new QueryCommand({
      TableName: USERS_TABLE_NAME,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': username,
      },
      Limit: 1,
    });

    try {
      const emailResult = await docClient.send(emailQuery);
      if (emailResult.Items && emailResult.Items.length > 0) {
        return emailResult.Items[0].userId;
      }
    } catch (emailError) {
      // Index might not exist, continue to phone lookup
      console.log('Email index query failed, trying phone lookup');
    }

    // Try to find by phone number
    const phoneQuery = new QueryCommand({
      TableName: USERS_TABLE_NAME,
      IndexName: 'phoneNumber-index',
      KeyConditionExpression: 'phoneNumber = :phoneNumber',
      ExpressionAttributeValues: {
        ':phoneNumber': username,
      },
      Limit: 1,
    });

    try {
      const phoneResult = await docClient.send(phoneQuery);
      if (phoneResult.Items && phoneResult.Items.length > 0) {
        return phoneResult.Items[0].userId;
      }
    } catch (phoneError) {
      // Index might not exist
      console.log('Phone index query failed');
    }

    console.warn('User not found in DynamoDB for username:', username);
    return null;
  } catch (error) {
    console.error('Error finding user by username:', error);
    return null;
  }
}

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
