# Lambda Authorizer and RBAC

This directory contains the Lambda authorizer for API Gateway and role-based access control (RBAC) utilities.

## Lambda Authorizer

The Lambda authorizer validates JWT tokens issued by AWS Cognito and enforces role-based access control.

### Features

- Validates JWT tokens using JWKS (JSON Web Key Set)
- Extracts user information from token claims
- Supports three roles: `Standard_User`, `Professional_User`, `Admin_User`
- Generates IAM policies for API Gateway
- Includes user context in request for downstream Lambda functions

### Environment Variables

- `USER_POOL_ID`: AWS Cognito User Pool ID
- `AWS_REGION`: AWS region where the User Pool is located

### Token Claims

The authorizer extracts the following claims from JWT tokens:

- `sub`: User ID (used as principal ID)
- `email`: User email address
- `custom:role`: User role (custom attribute)
- `cognito:groups`: User groups (fallback for role)

### Role Priority

If both `custom:role` and `cognito:groups` are present, `custom:role` takes priority.

## RBAC Utilities

The RBAC module provides utilities for enforcing role-based access control in Lambda functions.

### Usage Example

```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getUserContext, requireMinimumRole, UserRole } from './authorizer/rbac';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Extract user context from authorizer
    const userContext = getUserContext(event.requestContext);
    
    // Enforce role requirement
    requireMinimumRole(userContext.role, UserRole.PROFESSIONAL_USER);
    
    // User has Professional_User or Admin_User role
    // Proceed with business logic
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Success',
        userId: userContext.userId,
      }),
    };
  } catch (error) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        error: 'Access denied',
        message: error.message,
      }),
    };
  }
}
```

### Available Functions

#### Role Checking

- `hasRole(userRole, requiredRole)`: Check if user has exact role
- `hasMinimumRole(userRole, minimumRole)`: Check if user has at least minimum role
- `isStandardUser(userRole)`: Check if user is Standard_User
- `isProfessionalUser(userRole)`: Check if user is Professional_User or higher
- `isAdminUser(userRole)`: Check if user is Admin_User

#### Role Enforcement

- `requireRole(userRole, requiredRole)`: Throw error if user doesn't have exact role
- `requireMinimumRole(userRole, minimumRole)`: Throw error if user doesn't meet minimum role

#### Context Extraction

- `getUserContext(requestContext)`: Extract user context from API Gateway request

## Role Hierarchy

The system uses a role hierarchy where higher roles inherit permissions from lower roles:

1. `Standard_User` (lowest)
2. `Professional_User`
3. `Admin_User` (highest)

For example:
- `Admin_User` has all permissions of `Professional_User` and `Standard_User`
- `Professional_User` has all permissions of `Standard_User`

## Testing

Run tests with:

```bash
npm test
```

Run tests with coverage:

```bash
npm test -- --coverage
```

## Deployment

The Lambda authorizer is deployed as part of the CDK stack. It requires:

1. Cognito User Pool ID
2. AWS region
3. IAM permissions to describe User Pool (optional)

The authorizer is configured with:
- Node.js 20 runtime
- ARM64 architecture (Graviton2)
- 256 MB memory
- 30 second timeout
- X-Ray tracing enabled
