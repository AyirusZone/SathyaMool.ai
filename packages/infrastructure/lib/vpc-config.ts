/**
 * VPC Configuration with VPC Endpoints
 * 
 * Creates a VPC with private subnets and VPC endpoints for AWS services
 * to ensure Lambda functions can access AWS services without internet gateway.
 * 
 * Requirements: 13.6 - VPC endpoints for AWS services
 */

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
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

export class VpcConfig extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: VpcConfigProps) {
    super(scope, id);

    const cidr = props?.cidr || '10.0.0.0/16';
    const maxAzs = props?.maxAzs || 2;
    const enableFlowLogs = props?.enableFlowLogs !== false;

    // Create VPC with private subnets only (no NAT Gateway for cost optimization)
    this.vpc = new ec2.Vpc(this, 'SatyaMoolVpc', {
      vpcName: 'SatyaMool-VPC',
      ipAddresses: ec2.IpAddresses.cidr(cidr),
      maxAzs,
      natGateways: 0, // No NAT Gateway - use VPC endpoints instead
      subnetConfiguration: [
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Create security group for Lambda functions
    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: 'SatyaMool-Lambda-SG',
      description: 'Security group for SatyaMool Lambda functions',
      allowAllOutbound: true, // Allow outbound to VPC endpoints
    });

    // Add self-referencing rule for Lambda-to-Lambda communication
    this.lambdaSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.allTraffic(),
      'Allow Lambda-to-Lambda communication'
    );

    // Create VPC endpoint security group
    const vpcEndpointSecurityGroup = new ec2.SecurityGroup(this, 'VpcEndpointSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: 'SatyaMool-VPC-Endpoint-SG',
      description: 'Security group for VPC endpoints',
      allowAllOutbound: false,
    });

    // Allow inbound HTTPS from Lambda security group
    vpcEndpointSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(443),
      'Allow HTTPS from Lambda functions'
    );

    // ========== S3 Gateway Endpoint ==========
    // Gateway endpoints are free and don't require security groups
    this.vpc.addGatewayEndpoint('S3GatewayEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [
        {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // ========== DynamoDB Gateway Endpoint ==========
    this.vpc.addGatewayEndpoint('DynamoDBGatewayEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [
        {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // ========== SQS Interface Endpoint ==========
    this.vpc.addInterfaceEndpoint('SqsInterfaceEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SQS,
      privateDnsEnabled: true,
      securityGroups: [vpcEndpointSecurityGroup],
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    // ========== Secrets Manager Interface Endpoint ==========
    this.vpc.addInterfaceEndpoint('SecretsManagerInterfaceEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      privateDnsEnabled: true,
      securityGroups: [vpcEndpointSecurityGroup],
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    // ========== KMS Interface Endpoint ==========
    this.vpc.addInterfaceEndpoint('KmsInterfaceEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.KMS,
      privateDnsEnabled: true,
      securityGroups: [vpcEndpointSecurityGroup],
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    // ========== CloudWatch Logs Interface Endpoint ==========
    this.vpc.addInterfaceEndpoint('CloudWatchLogsInterfaceEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      privateDnsEnabled: true,
      securityGroups: [vpcEndpointSecurityGroup],
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    // ========== STS Interface Endpoint ==========
    // Required for IAM role assumption
    this.vpc.addInterfaceEndpoint('StsInterfaceEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.STS,
      privateDnsEnabled: true,
      securityGroups: [vpcEndpointSecurityGroup],
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    // ========== Textract Interface Endpoint ==========
    // Note: Textract VPC endpoint may not be available in all regions
    // Check availability: https://docs.aws.amazon.com/general/latest/gr/textract.html
    try {
      this.vpc.addInterfaceEndpoint('TextractInterfaceEndpoint', {
        service: new ec2.InterfaceVpcEndpointService(
          `com.amazonaws.${cdk.Stack.of(this).region}.textract`,
          443
        ),
        privateDnsEnabled: true,
        securityGroups: [vpcEndpointSecurityGroup],
        subnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      });
    } catch (error) {
      console.warn('Textract VPC endpoint not available in this region');
    }

    // ========== Translate Interface Endpoint ==========
    try {
      this.vpc.addInterfaceEndpoint('TranslateInterfaceEndpoint', {
        service: new ec2.InterfaceVpcEndpointService(
          `com.amazonaws.${cdk.Stack.of(this).region}.translate`,
          443
        ),
        privateDnsEnabled: true,
        securityGroups: [vpcEndpointSecurityGroup],
        subnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      });
    } catch (error) {
      console.warn('Translate VPC endpoint not available in this region');
    }

    // ========== Bedrock Runtime Interface Endpoint ==========
    try {
      this.vpc.addInterfaceEndpoint('BedrockRuntimeInterfaceEndpoint', {
        service: new ec2.InterfaceVpcEndpointService(
          `com.amazonaws.${cdk.Stack.of(this).region}.bedrock-runtime`,
          443
        ),
        privateDnsEnabled: true,
        securityGroups: [vpcEndpointSecurityGroup],
        subnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      });
    } catch (error) {
      console.warn('Bedrock Runtime VPC endpoint not available in this region');
    }

    // ========== VPC Flow Logs ==========
    if (enableFlowLogs) {
      const flowLogGroup = new logs.LogGroup(this, 'VpcFlowLogGroup', {
        logGroupName: '/aws/vpc/satyamool-flow-logs',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      new ec2.FlowLog(this, 'VpcFlowLog', {
        resourceType: ec2.FlowLogResourceType.fromVpc(this.vpc),
        destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup),
        trafficType: ec2.FlowLogTrafficType.ALL,
      });
    }

    // ========== Network ACLs ==========
    // Create Network ACL for private subnets
    const privateNetworkAcl = new ec2.NetworkAcl(this, 'PrivateNetworkAcl', {
      vpc: this.vpc,
      networkAclName: 'SatyaMool-Private-NACL',
      subnetSelection: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    // Allow inbound HTTPS from VPC CIDR
    privateNetworkAcl.addEntry('AllowInboundHttps', {
      cidr: ec2.AclCidr.ipv4(cidr),
      ruleNumber: 100,
      traffic: ec2.AclTraffic.tcpPort(443),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    // Allow outbound HTTPS to VPC CIDR
    privateNetworkAcl.addEntry('AllowOutboundHttps', {
      cidr: ec2.AclCidr.ipv4(cidr),
      ruleNumber: 100,
      traffic: ec2.AclTraffic.tcpPort(443),
      direction: ec2.TrafficDirection.EGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    // Allow ephemeral ports for return traffic
    privateNetworkAcl.addEntry('AllowInboundEphemeral', {
      cidr: ec2.AclCidr.ipv4(cidr),
      ruleNumber: 110,
      traffic: ec2.AclTraffic.tcpPortRange(1024, 65535),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    privateNetworkAcl.addEntry('AllowOutboundEphemeral', {
      cidr: ec2.AclCidr.ipv4(cidr),
      ruleNumber: 110,
      traffic: ec2.AclTraffic.tcpPortRange(1024, 65535),
      direction: ec2.TrafficDirection.EGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    // ========== Outputs ==========
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: 'SatyaMool-VpcId',
    });

    new cdk.CfnOutput(this, 'LambdaSecurityGroupId', {
      value: this.lambdaSecurityGroup.securityGroupId,
      description: 'Lambda security group ID',
      exportName: 'SatyaMool-LambdaSecurityGroupId',
    });

    new cdk.CfnOutput(this, 'VpcEndpointSecurityGroupId', {
      value: vpcEndpointSecurityGroup.securityGroupId,
      description: 'VPC endpoint security group ID',
      exportName: 'SatyaMool-VpcEndpointSecurityGroupId',
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: this.vpc.privateSubnets.map(subnet => subnet.subnetId).join(','),
      description: 'Private subnet IDs',
      exportName: 'SatyaMool-PrivateSubnetIds',
    });
  }
}
