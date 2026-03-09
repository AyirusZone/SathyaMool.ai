import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
export declare class CognitoConfig extends Construct {
    readonly userPool: cognito.UserPool;
    readonly userPoolClient: cognito.UserPoolClient;
    constructor(scope: Construct, id: string);
}
