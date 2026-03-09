/**
 * VPC Configuration with VPC Endpoints
 *
 * Creates a VPC with private subnets and VPC endpoints for AWS services
 * to ensure Lambda functions can access AWS services without internet gateway.
 *
 * Requirements: 13.6 - VPC endpoints for AWS services
 */
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
export interface VpcConfigProps {
    /**
     * CIDR block for the VPC
     * @default '10.0.0.0/16'
     */
    cidr?: string;
    /**
     * Maximum number of Availability Zones to use
     * @default 2
     */
    maxAzs?: number;
    /**
     * Enable VPC Flow Logs
     * @default true
     */
    enableFlowLogs?: boolean;
}
export declare class VpcConfig extends Construct {
    readonly vpc: ec2.Vpc;
    readonly lambdaSecurityGroup: ec2.SecurityGroup;
    constructor(scope: Construct, id: string, props?: VpcConfigProps);
}
