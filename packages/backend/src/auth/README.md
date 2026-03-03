# Authentication API

This module contains Lambda functions for user authentication and authorization.

## Registration Endpoint

### POST /v1/auth/register

Registers a new user with either email or phone number authentication.

#### Request Body

```json
{
  "email": "user@example.com",           // Optional: Email address (required if phoneNumber not provided)
  "phoneNumber": "+919876543210",        // Optional: Phone number in E.164 format (required if email not provided)
  "password": "SecurePass@123",          // Required: Password (min 8 chars, must include uppercase, lowercase, number, symbol)
  "givenName": "John",                   // Optional: First name
  "familyName": "Doe",                   // Optional: Last name
  "role": "Standard_User"                // Optional: User role (Standard_User or Professional_User, defaults to Standard_User)
}
```

#### Validation Rules

1. Either `email` or `phoneNumber` must be provided (not both)
2. Email must be in valid format
3. Phone number must be in E.164 format (e.g., +919876543210) or Indian 10-digit format (9876543210)
4. Password must be at least 8 characters and include:
   - Uppercase letter
   - Lowercase letter
   - Number
   - Special character
5. Role must be either `Standard_User` or `Professional_User`

#### Success Response (201 Created)

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Registration successful. Please verify your account using the code sent to you.",
  "userConfirmed": false,
  "codeDeliveryDetails": {
    "destination": "t***@e***.com",
    "deliveryMedium": "EMAIL",
    "attributeName": "email"
  }
}
```

#### Error Responses

**400 Bad Request - Validation Error**
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Either email or phone number is required"
}
```

**400 Bad Request - Invalid Password**
```json
{
  "error": "INVALID_PASSWORD",
  "message": "Password does not meet requirements: minimum 8 characters, must include uppercase, lowercase, number, and special character"
}
```

**409 Conflict - User Exists**
```json
{
  "error": "USER_EXISTS",
  "message": "A user with this email or phone number already exists"
}
```

**500 Internal Server Error**
```json
{
  "error": "INTERNAL_ERROR",
  "message": "An error occurred during registration. Please try again."
}
```

#### Implementation Details

- **Cognito Integration**: User is created in AWS Cognito User Pool
- **DynamoDB Storage**: User metadata is stored in the Users table
- **OTP Verification**: For phone registration, an OTP is sent via SMS
- **Email Verification**: For email registration, a verification code is sent via email
- **Role Assignment**: Custom role attribute is set in Cognito for RBAC
- **Phone Formatting**: Indian 10-digit numbers are automatically formatted to E.164 (+91 prefix)

#### Requirements Satisfied

- **Requirement 1.1**: Phone number authentication with OTP verification
- **Requirement 1.2**: Email and password authentication
- **Requirement 1.3**: OTP sending for phone registration

#### Testing

Run unit tests:
```bash
npm test -- register.test.ts
```

#### Environment Variables

- `USER_POOL_ID`: Cognito User Pool ID
- `USER_POOL_CLIENT_ID`: Cognito User Pool Client ID
- `USERS_TABLE_NAME`: DynamoDB Users table name
- `AWS_REGION`: AWS region
