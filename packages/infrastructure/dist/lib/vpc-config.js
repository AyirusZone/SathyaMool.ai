"use strict";
/**
 * VPC Configuration with VPC Endpoints
 *
 * Creates a VPC with private subnets and VPC endpoints for AWS services
 * to ensure Lambda functions can access AWS services without internet gateway.
 *
 * Requirements: 13.6 - VPC endpoints for AWS services
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VpcConfig = void 0;
const cdk = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const logs = require("aws-cdk-lib/aws-logs");
const constructs_1 = require("constructs");
class VpcConfig extends constructs_1.Construct {
    constructor(scope, id, props) {
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
        this.lambdaSecurityGroup.addIngressRule(this.lambdaSecurityGroup, ec2.Port.allTraffic(), 'Allow Lambda-to-Lambda communication');
        // Create VPC endpoint security group
        const vpcEndpointSecurityGroup = new ec2.SecurityGroup(this, 'VpcEndpointSecurityGroup', {
            vpc: this.vpc,
            securityGroupName: 'SatyaMool-VPC-Endpoint-SG',
            description: 'Security group for VPC endpoints',
            allowAllOutbound: false,
        });
        // Allow inbound HTTPS from Lambda security group
        vpcEndpointSecurityGroup.addIngressRule(this.lambdaSecurityGroup, ec2.Port.tcp(443), 'Allow HTTPS from Lambda functions');
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
                service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.${cdk.Stack.of(this).region}.textract`, 443),
                privateDnsEnabled: true,
                securityGroups: [vpcEndpointSecurityGroup],
                subnets: {
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
            });
        }
        catch (error) {
            console.warn('Textract VPC endpoint not available in this region');
        }
        // ========== Translate Interface Endpoint ==========
        try {
            this.vpc.addInterfaceEndpoint('TranslateInterfaceEndpoint', {
                service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.${cdk.Stack.of(this).region}.translate`, 443),
                privateDnsEnabled: true,
                securityGroups: [vpcEndpointSecurityGroup],
                subnets: {
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
            });
        }
        catch (error) {
            console.warn('Translate VPC endpoint not available in this region');
        }
        // ========== Bedrock Runtime Interface Endpoint ==========
        try {
            this.vpc.addInterfaceEndpoint('BedrockRuntimeInterfaceEndpoint', {
                service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.${cdk.Stack.of(this).region}.bedrock-runtime`, 443),
                privateDnsEnabled: true,
                securityGroups: [vpcEndpointSecurityGroup],
                subnets: {
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
            });
        }
        catch (error) {
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
exports.VpcConfig = VpcConfig;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidnBjLWNvbmZpZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi92cGMtY29uZmlnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7OztHQU9HOzs7QUFFSCxtQ0FBbUM7QUFDbkMsMkNBQTJDO0FBQzNDLDZDQUE2QztBQUM3QywyQ0FBdUM7QUFzQnZDLE1BQWEsU0FBVSxTQUFRLHNCQUFTO0lBSXRDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLElBQUksR0FBRyxLQUFLLEVBQUUsSUFBSSxJQUFJLGFBQWEsQ0FBQztRQUMxQyxNQUFNLE1BQU0sR0FBRyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUMsQ0FBQztRQUNsQyxNQUFNLGNBQWMsR0FBRyxLQUFLLEVBQUUsY0FBYyxLQUFLLEtBQUssQ0FBQztRQUV2RCw4RUFBOEU7UUFDOUUsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUMzQyxPQUFPLEVBQUUsZUFBZTtZQUN4QixXQUFXLEVBQUUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQ3ZDLE1BQU07WUFDTixXQUFXLEVBQUUsQ0FBQyxFQUFFLDZDQUE2QztZQUM3RCxtQkFBbUIsRUFBRTtnQkFDbkI7b0JBQ0UsSUFBSSxFQUFFLFNBQVM7b0JBQ2YsVUFBVSxFQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsZ0JBQWdCO29CQUMzQyxRQUFRLEVBQUUsRUFBRTtpQkFDYjthQUNGO1lBQ0Qsa0JBQWtCLEVBQUUsSUFBSTtZQUN4QixnQkFBZ0IsRUFBRSxJQUFJO1NBQ3ZCLENBQUMsQ0FBQztRQUVILDZDQUE2QztRQUM3QyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxHQUFHLENBQUMsYUFBYSxDQUFDLElBQUks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Q2hDLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFO1lBQy9CLEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUs7WUFDckIsV0FBVyxFQUFFLFFBQVE7WUFDckIsVUFBVSxFQUFFLGlCQUFpQjtTQUM5QixDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQy9DLEtBQUssRUFBRSxJQUFJLENBQUMsbUJBQW1CLENBQUMsZUFBZTtZQUMvQyxXQUFXLEVBQUUsMEJBQTBCO1lBQ3ZDLFVBQVUsRUFBRSxpQ0FBaUM7U0FDOUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSw0QkFBNEIsRUFBRTtZQUNwRCxLQUFLLEVBQUUsd0JBQXdCLENBQUMsZUFBZTtZQUMvQyxXQUFXLEVBQUUsZ0NBQWdDO1lBQzdDLFVBQVUsRUFBRSxzQ0FBc0M7U0FDbkQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUMxQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7WUFDdkUsV0FBVyxFQUFFLG9CQUFvQjtZQUNqQyxVQUFVLEVBQUUsNEJBQTRCO1NBQ3pDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTVRRCw4QkE0UUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogVlBDIENvbmZpZ3VyYXRpb24gd2l0aCBWUEMgRW5kcG9pbnRzXHJcbiAqIFxyXG4gKiBDcmVhdGVzIGEgVlBDIHdpdGggcHJpdmF0ZSBzdWJuZXRzIGFuZCBWUEMgZW5kcG9pbnRzIGZvciBBV1Mgc2VydmljZXNcclxuICogdG8gZW5zdXJlIExhbWJkYSBmdW5jdGlvbnMgY2FuIGFjY2VzcyBBV1Mgc2VydmljZXMgd2l0aG91dCBpbnRlcm5ldCBnYXRld2F5LlxyXG4gKiBcclxuICogUmVxdWlyZW1lbnRzOiAxMy42IC0gVlBDIGVuZHBvaW50cyBmb3IgQVdTIHNlcnZpY2VzXHJcbiAqL1xyXG5cclxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xyXG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFZwY0NvbmZpZ1Byb3BzIHtcclxuICAvKipcclxuICAgKiBDSURSIGJsb2NrIGZvciB0aGUgVlBDXHJcbiAgICogQGRlZmF1bHQgJzEwLjAuMC4wLzE2J1xyXG4gICAqL1xyXG4gIGNpZHI/OiBzdHJpbmc7XHJcblxyXG4gIC8qKlxyXG4gICAqIE1heGltdW0gbnVtYmVyIG9mIEF2YWlsYWJpbGl0eSBab25lcyB0byB1c2VcclxuICAgKiBAZGVmYXVsdCAyXHJcbiAgICovXHJcbiAgbWF4QXpzPzogbnVtYmVyO1xyXG5cclxuICAvKipcclxuICAgKiBFbmFibGUgVlBDIEZsb3cgTG9nc1xyXG4gICAqIEBkZWZhdWx0IHRydWVcclxuICAgKi9cclxuICBlbmFibGVGbG93TG9ncz86IGJvb2xlYW47XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBWcGNDb25maWcgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xyXG4gIHB1YmxpYyByZWFkb25seSB2cGM6IGVjMi5WcGM7XHJcbiAgcHVibGljIHJlYWRvbmx5IGxhbWJkYVNlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IFZwY0NvbmZpZ1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQpO1xyXG5cclxuICAgIGNvbnN0IGNpZHIgPSBwcm9wcz8uY2lkciB8fCAnMTAuMC4wLjAvMTYnO1xyXG4gICAgY29uc3QgbWF4QXpzID0gcHJvcHM/Lm1heEF6cyB8fCAyO1xyXG4gICAgY29uc3QgZW5hYmxlRmxvd0xvZ3MgPSBwcm9wcz8uZW5hYmxlRmxvd0xvZ3MgIT09IGZhbHNlO1xyXG5cclxuICAgIC8vIENyZWF0ZSBWUEMgd2l0aCBwcml2YXRlIHN1Ym5ldHMgb25seSAobm8gTkFUIEdhdGV3YXkgZm9yIGNvc3Qgb3B0aW1pemF0aW9uKVxyXG4gICAgdGhpcy52cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCAnU2F0eWFNb29sVnBjJywge1xyXG4gICAgICB2cGNOYW1lOiAnU2F0eWFNb29sLVZQQycsXHJcbiAgICAgIGlwQWRkcmVzc2VzOiBlYzIuSXBBZGRyZXNzZXMuY2lkcihjaWRyKSxcclxuICAgICAgbWF4QXpzLFxyXG4gICAgICBuYXRHYXRld2F5czogMCwgLy8gTm8gTkFUIEdhdGV3YXkgLSB1c2UgVlBDIGVuZHBvaW50cyBpbnN0ZWFkXHJcbiAgICAgIHN1Ym5ldENvbmZpZ3VyYXRpb246IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBuYW1lOiAnUHJpdmF0ZScsXHJcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVELFxyXG4gICAgICAgICAgY2lkck1hc2s6IDI0LFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICAgIGVuYWJsZURuc0hvc3RuYW1lczogdHJ1ZSxcclxuICAgICAgZW5hYmxlRG5zU3VwcG9ydDogdHJ1ZSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgTGFtYmRhIGZ1bmN0aW9uc1xyXG4gICAgdGhpcy5sYW1iZGFTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdMYW1iZGFTZWN1cml0eUdyb3VwJywge1xyXG4gICAgICB2cGM6IHRoaXMudnBjLFxyXG4gICAgICBzZWN1cml0eUdyb3VwTmFtZTogJ1NhdHlhTW9vbC1MYW1iZGEtU0cnLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBTYXR5YU1vb2wgTGFtYmRhIGZ1bmN0aW9ucycsXHJcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWUsIC8vIEFsbG93IG91dGJvdW5kIHRvIFZQQyBlbmRwb2ludHNcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBzZWxmLXJlZmVyZW5jaW5nIHJ1bGUgZm9yIExhbWJkYS10by1MYW1iZGEgY29tbXVuaWNhdGlvblxyXG4gICAgdGhpcy5sYW1iZGFTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxyXG4gICAgICB0aGlzLmxhbWJkYVNlY3VyaXR5R3JvdXAsXHJcbiAgICAgIGVjMi5Qb3J0LmFsbFRyYWZmaWMoKSxcclxuICAgICAgJ0FsbG93IExhbWJkYS10by1MYW1iZGEgY29tbXVuaWNhdGlvbidcclxuICAgICk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIFZQQyBlbmRwb2ludCBzZWN1cml0eSBncm91cFxyXG4gICAgY29uc3QgdnBjRW5kcG9pbnRTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdWcGNFbmRwb2ludFNlY3VyaXR5R3JvdXAnLCB7XHJcbiAgICAgIHZwYzogdGhpcy52cGMsXHJcbiAgICAgIHNlY3VyaXR5R3JvdXBOYW1lOiAnU2F0eWFNb29sLVZQQy1FbmRwb2ludC1TRycsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIFZQQyBlbmRwb2ludHMnLFxyXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFsbG93IGluYm91bmQgSFRUUFMgZnJvbSBMYW1iZGEgc2VjdXJpdHkgZ3JvdXBcclxuICAgIHZwY0VuZHBvaW50U2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcclxuICAgICAgdGhpcy5sYW1iZGFTZWN1cml0eUdyb3VwLFxyXG4gICAgICBlYzIuUG9ydC50Y3AoNDQzKSxcclxuICAgICAgJ0FsbG93IEhUVFBTIGZyb20gTGFtYmRhIGZ1bmN0aW9ucydcclxuICAgICk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PSBTMyBHYXRld2F5IEVuZHBvaW50ID09PT09PT09PT1cclxuICAgIC8vIEdhdGV3YXkgZW5kcG9pbnRzIGFyZSBmcmVlIGFuZCBkb24ndCByZXF1aXJlIHNlY3VyaXR5IGdyb3Vwc1xyXG4gICAgdGhpcy52cGMuYWRkR2F0ZXdheUVuZHBvaW50KCdTM0dhdGV3YXlFbmRwb2ludCcsIHtcclxuICAgICAgc2VydmljZTogZWMyLkdhdGV3YXlWcGNFbmRwb2ludEF3c1NlcnZpY2UuUzMsXHJcbiAgICAgIHN1Ym5ldHM6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVELFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09IER5bmFtb0RCIEdhdGV3YXkgRW5kcG9pbnQgPT09PT09PT09PVxyXG4gICAgdGhpcy52cGMuYWRkR2F0ZXdheUVuZHBvaW50KCdEeW5hbW9EQkdhdGV3YXlFbmRwb2ludCcsIHtcclxuICAgICAgc2VydmljZTogZWMyLkdhdGV3YXlWcGNFbmRwb2ludEF3c1NlcnZpY2UuRFlOQU1PREIsXHJcbiAgICAgIHN1Ym5ldHM6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVELFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09IFNRUyBJbnRlcmZhY2UgRW5kcG9pbnQgPT09PT09PT09PVxyXG4gICAgdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ1Nxc0ludGVyZmFjZUVuZHBvaW50Jywge1xyXG4gICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNRUyxcclxuICAgICAgcHJpdmF0ZURuc0VuYWJsZWQ6IHRydWUsXHJcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbdnBjRW5kcG9pbnRTZWN1cml0eUdyb3VwXSxcclxuICAgICAgc3VibmV0czoge1xyXG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09IFNlY3JldHMgTWFuYWdlciBJbnRlcmZhY2UgRW5kcG9pbnQgPT09PT09PT09PVxyXG4gICAgdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ1NlY3JldHNNYW5hZ2VySW50ZXJmYWNlRW5kcG9pbnQnLCB7XHJcbiAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuU0VDUkVUU19NQU5BR0VSLFxyXG4gICAgICBwcml2YXRlRG5zRW5hYmxlZDogdHJ1ZSxcclxuICAgICAgc2VjdXJpdHlHcm91cHM6IFt2cGNFbmRwb2ludFNlY3VyaXR5R3JvdXBdLFxyXG4gICAgICBzdWJuZXRzOiB7XHJcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vID09PT09PT09PT0gS01TIEludGVyZmFjZSBFbmRwb2ludCA9PT09PT09PT09XHJcbiAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludCgnS21zSW50ZXJmYWNlRW5kcG9pbnQnLCB7XHJcbiAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuS01TLFxyXG4gICAgICBwcml2YXRlRG5zRW5hYmxlZDogdHJ1ZSxcclxuICAgICAgc2VjdXJpdHlHcm91cHM6IFt2cGNFbmRwb2ludFNlY3VyaXR5R3JvdXBdLFxyXG4gICAgICBzdWJuZXRzOiB7XHJcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vID09PT09PT09PT0gQ2xvdWRXYXRjaCBMb2dzIEludGVyZmFjZSBFbmRwb2ludCA9PT09PT09PT09XHJcbiAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludCgnQ2xvdWRXYXRjaExvZ3NJbnRlcmZhY2VFbmRwb2ludCcsIHtcclxuICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5DTE9VRFdBVENIX0xPR1MsXHJcbiAgICAgIHByaXZhdGVEbnNFbmFibGVkOiB0cnVlLFxyXG4gICAgICBzZWN1cml0eUdyb3VwczogW3ZwY0VuZHBvaW50U2VjdXJpdHlHcm91cF0sXHJcbiAgICAgIHN1Ym5ldHM6IHtcclxuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVELFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PSBTVFMgSW50ZXJmYWNlIEVuZHBvaW50ID09PT09PT09PT1cclxuICAgIC8vIFJlcXVpcmVkIGZvciBJQU0gcm9sZSBhc3N1bXB0aW9uXHJcbiAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludCgnU3RzSW50ZXJmYWNlRW5kcG9pbnQnLCB7XHJcbiAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuU1RTLFxyXG4gICAgICBwcml2YXRlRG5zRW5hYmxlZDogdHJ1ZSxcclxuICAgICAgc2VjdXJpdHlHcm91cHM6IFt2cGNFbmRwb2ludFNlY3VyaXR5R3JvdXBdLFxyXG4gICAgICBzdWJuZXRzOiB7XHJcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vID09PT09PT09PT0gVGV4dHJhY3QgSW50ZXJmYWNlIEVuZHBvaW50ID09PT09PT09PT1cclxuICAgIC8vIE5vdGU6IFRleHRyYWN0IFZQQyBlbmRwb2ludCBtYXkgbm90IGJlIGF2YWlsYWJsZSBpbiBhbGwgcmVnaW9uc1xyXG4gICAgLy8gQ2hlY2sgYXZhaWxhYmlsaXR5OiBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vZ2VuZXJhbC9sYXRlc3QvZ3IvdGV4dHJhY3QuaHRtbFxyXG4gICAgdHJ5IHtcclxuICAgICAgdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ1RleHRyYWN0SW50ZXJmYWNlRW5kcG9pbnQnLCB7XHJcbiAgICAgICAgc2VydmljZTogbmV3IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludFNlcnZpY2UoXHJcbiAgICAgICAgICBgY29tLmFtYXpvbmF3cy4ke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259LnRleHRyYWN0YCxcclxuICAgICAgICAgIDQ0M1xyXG4gICAgICAgICksXHJcbiAgICAgICAgcHJpdmF0ZURuc0VuYWJsZWQ6IHRydWUsXHJcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IFt2cGNFbmRwb2ludFNlY3VyaXR5R3JvdXBdLFxyXG4gICAgICAgIHN1Ym5ldHM6IHtcclxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLndhcm4oJ1RleHRyYWN0IFZQQyBlbmRwb2ludCBub3QgYXZhaWxhYmxlIGluIHRoaXMgcmVnaW9uJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gPT09PT09PT09PSBUcmFuc2xhdGUgSW50ZXJmYWNlIEVuZHBvaW50ID09PT09PT09PT1cclxuICAgIHRyeSB7XHJcbiAgICAgIHRoaXMudnBjLmFkZEludGVyZmFjZUVuZHBvaW50KCdUcmFuc2xhdGVJbnRlcmZhY2VFbmRwb2ludCcsIHtcclxuICAgICAgICBzZXJ2aWNlOiBuZXcgZWMyLkludGVyZmFjZVZwY0VuZHBvaW50U2VydmljZShcclxuICAgICAgICAgIGBjb20uYW1hem9uYXdzLiR7Y2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbn0udHJhbnNsYXRlYCxcclxuICAgICAgICAgIDQ0M1xyXG4gICAgICAgICksXHJcbiAgICAgICAgcHJpdmF0ZURuc0VuYWJsZWQ6IHRydWUsXHJcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IFt2cGNFbmRwb2ludFNlY3VyaXR5R3JvdXBdLFxyXG4gICAgICAgIHN1Ym5ldHM6IHtcclxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLndhcm4oJ1RyYW5zbGF0ZSBWUEMgZW5kcG9pbnQgbm90IGF2YWlsYWJsZSBpbiB0aGlzIHJlZ2lvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09PT09PT0gQmVkcm9jayBSdW50aW1lIEludGVyZmFjZSBFbmRwb2ludCA9PT09PT09PT09XHJcbiAgICB0cnkge1xyXG4gICAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludCgnQmVkcm9ja1J1bnRpbWVJbnRlcmZhY2VFbmRwb2ludCcsIHtcclxuICAgICAgICBzZXJ2aWNlOiBuZXcgZWMyLkludGVyZmFjZVZwY0VuZHBvaW50U2VydmljZShcclxuICAgICAgICAgIGBjb20uYW1hem9uYXdzLiR7Y2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbn0uYmVkcm9jay1ydW50aW1lYCxcclxuICAgICAgICAgIDQ0M1xyXG4gICAgICAgICksXHJcbiAgICAgICAgcHJpdmF0ZURuc0VuYWJsZWQ6IHRydWUsXHJcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IFt2cGNFbmRwb2ludFNlY3VyaXR5R3JvdXBdLFxyXG4gICAgICAgIHN1Ym5ldHM6IHtcclxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLndhcm4oJ0JlZHJvY2sgUnVudGltZSBWUEMgZW5kcG9pbnQgbm90IGF2YWlsYWJsZSBpbiB0aGlzIHJlZ2lvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09PT09PT0gVlBDIEZsb3cgTG9ncyA9PT09PT09PT09XHJcbiAgICBpZiAoZW5hYmxlRmxvd0xvZ3MpIHtcclxuICAgICAgY29uc3QgZmxvd0xvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1ZwY0Zsb3dMb2dHcm91cCcsIHtcclxuICAgICAgICBsb2dHcm91cE5hbWU6ICcvYXdzL3ZwYy9zYXR5YW1vb2wtZmxvdy1sb2dzJyxcclxuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcclxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIG5ldyBlYzIuRmxvd0xvZyh0aGlzLCAnVnBjRmxvd0xvZycsIHtcclxuICAgICAgICByZXNvdXJjZVR5cGU6IGVjMi5GbG93TG9nUmVzb3VyY2VUeXBlLmZyb21WcGModGhpcy52cGMpLFxyXG4gICAgICAgIGRlc3RpbmF0aW9uOiBlYzIuRmxvd0xvZ0Rlc3RpbmF0aW9uLnRvQ2xvdWRXYXRjaExvZ3MoZmxvd0xvZ0dyb3VwKSxcclxuICAgICAgICB0cmFmZmljVHlwZTogZWMyLkZsb3dMb2dUcmFmZmljVHlwZS5BTEwsXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09PT09PT0gTmV0d29yayBBQ0xzID09PT09PT09PT1cclxuICAgIC8vIENyZWF0ZSBOZXR3b3JrIEFDTCBmb3IgcHJpdmF0ZSBzdWJuZXRzXHJcbiAgICBjb25zdCBwcml2YXRlTmV0d29ya0FjbCA9IG5ldyBlYzIuTmV0d29ya0FjbCh0aGlzLCAnUHJpdmF0ZU5ldHdvcmtBY2wnLCB7XHJcbiAgICAgIHZwYzogdGhpcy52cGMsXHJcbiAgICAgIG5ldHdvcmtBY2xOYW1lOiAnU2F0eWFNb29sLVByaXZhdGUtTkFDTCcsXHJcbiAgICAgIHN1Ym5ldFNlbGVjdGlvbjoge1xyXG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBbGxvdyBpbmJvdW5kIEhUVFBTIGZyb20gVlBDIENJRFJcclxuICAgIHByaXZhdGVOZXR3b3JrQWNsLmFkZEVudHJ5KCdBbGxvd0luYm91bmRIdHRwcycsIHtcclxuICAgICAgY2lkcjogZWMyLkFjbENpZHIuaXB2NChjaWRyKSxcclxuICAgICAgcnVsZU51bWJlcjogMTAwLFxyXG4gICAgICB0cmFmZmljOiBlYzIuQWNsVHJhZmZpYy50Y3BQb3J0KDQ0MyksXHJcbiAgICAgIGRpcmVjdGlvbjogZWMyLlRyYWZmaWNEaXJlY3Rpb24uSU5HUkVTUyxcclxuICAgICAgcnVsZUFjdGlvbjogZWMyLkFjdGlvbi5BTExPVyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFsbG93IG91dGJvdW5kIEhUVFBTIHRvIFZQQyBDSURSXHJcbiAgICBwcml2YXRlTmV0d29ya0FjbC5hZGRFbnRyeSgnQWxsb3dPdXRib3VuZEh0dHBzJywge1xyXG4gICAgICBjaWRyOiBlYzIuQWNsQ2lkci5pcHY0KGNpZHIpLFxyXG4gICAgICBydWxlTnVtYmVyOiAxMDAsXHJcbiAgICAgIHRyYWZmaWM6IGVjMi5BY2xUcmFmZmljLnRjcFBvcnQoNDQzKSxcclxuICAgICAgZGlyZWN0aW9uOiBlYzIuVHJhZmZpY0RpcmVjdGlvbi5FR1JFU1MsXHJcbiAgICAgIHJ1bGVBY3Rpb246IGVjMi5BY3Rpb24uQUxMT1csXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBbGxvdyBlcGhlbWVyYWwgcG9ydHMgZm9yIHJldHVybiB0cmFmZmljXHJcbiAgICBwcml2YXRlTmV0d29ya0FjbC5hZGRFbnRyeSgnQWxsb3dJbmJvdW5kRXBoZW1lcmFsJywge1xyXG4gICAgICBjaWRyOiBlYzIuQWNsQ2lkci5pcHY0KGNpZHIpLFxyXG4gICAgICBydWxlTnVtYmVyOiAxMTAsXHJcbiAgICAgIHRyYWZmaWM6IGVjMi5BY2xUcmFmZmljLnRjcFBvcnRSYW5nZSgxMDI0LCA2NTUzNSksXHJcbiAgICAgIGRpcmVjdGlvbjogZWMyLlRyYWZmaWNEaXJlY3Rpb24uSU5HUkVTUyxcclxuICAgICAgcnVsZUFjdGlvbjogZWMyLkFjdGlvbi5BTExPVyxcclxuICAgIH0pO1xyXG5cclxuICAgIHByaXZhdGVOZXR3b3JrQWNsLmFkZEVudHJ5KCdBbGxvd091dGJvdW5kRXBoZW1lcmFsJywge1xyXG4gICAgICBjaWRyOiBlYzIuQWNsQ2lkci5pcHY0KGNpZHIpLFxyXG4gICAgICBydWxlTnVtYmVyOiAxMTAsXHJcbiAgICAgIHRyYWZmaWM6IGVjMi5BY2xUcmFmZmljLnRjcFBvcnRSYW5nZSgxMDI0LCA2NTUzNSksXHJcbiAgICAgIGRpcmVjdGlvbjogZWMyLlRyYWZmaWNEaXJlY3Rpb24uRUdSRVNTLFxyXG4gICAgICBydWxlQWN0aW9uOiBlYzIuQWN0aW9uLkFMTE9XLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PSBPdXRwdXRzID09PT09PT09PT1cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdWcGNJZCcsIHtcclxuICAgICAgdmFsdWU6IHRoaXMudnBjLnZwY0lkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1ZQQyBJRCcsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtVnBjSWQnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0xhbWJkYVNlY3VyaXR5R3JvdXBJZCcsIHtcclxuICAgICAgdmFsdWU6IHRoaXMubGFtYmRhU2VjdXJpdHlHcm91cC5zZWN1cml0eUdyb3VwSWQsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnTGFtYmRhIHNlY3VyaXR5IGdyb3VwIElEJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1NhdHlhTW9vbC1MYW1iZGFTZWN1cml0eUdyb3VwSWQnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1ZwY0VuZHBvaW50U2VjdXJpdHlHcm91cElkJywge1xyXG4gICAgICB2YWx1ZTogdnBjRW5kcG9pbnRTZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZCxcclxuICAgICAgZGVzY3JpcHRpb246ICdWUEMgZW5kcG9pbnQgc2VjdXJpdHkgZ3JvdXAgSUQnLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLVZwY0VuZHBvaW50U2VjdXJpdHlHcm91cElkJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcml2YXRlU3VibmV0SWRzJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy52cGMucHJpdmF0ZVN1Ym5ldHMubWFwKHN1Ym5ldCA9PiBzdWJuZXQuc3VibmV0SWQpLmpvaW4oJywnKSxcclxuICAgICAgZGVzY3JpcHRpb246ICdQcml2YXRlIHN1Ym5ldCBJRHMnLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLVByaXZhdGVTdWJuZXRJZHMnLFxyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcbiJdfQ==