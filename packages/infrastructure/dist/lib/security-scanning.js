"use strict";
/**
 * Security Scanning Configuration
 *
 * Configures AWS GuardDuty, AWS Config, and dependency scanning
 * for threat detection and compliance monitoring.
 *
 * Requirements: 13.8 - Implement security scanning
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityScanning = void 0;
const cdk = require("aws-cdk-lib");
const guardduty = require("aws-cdk-lib/aws-guardduty");
const config = require("aws-cdk-lib/aws-config");
const sns = require("aws-cdk-lib/aws-sns");
const subscriptions = require("aws-cdk-lib/aws-sns-subscriptions");
const events = require("aws-cdk-lib/aws-events");
const targets = require("aws-cdk-lib/aws-events-targets");
const iam = require("aws-cdk-lib/aws-iam");
const s3 = require("aws-cdk-lib/aws-s3");
const constructs_1 = require("constructs");
class SecurityScanning extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const enableGuardDuty = props?.enableGuardDuty !== false;
        const enableConfig = props?.enableConfig !== false;
        // Create SNS topic for security notifications
        this.securityTopic = new sns.Topic(this, 'SecurityNotificationTopic', {
            topicName: 'SatyaMool-Security-Notifications',
            displayName: 'SatyaMool Security Notifications',
        });
        // Add email subscription if provided
        if (props?.securityEmail) {
            this.securityTopic.addSubscription(new subscriptions.EmailSubscription(props.securityEmail));
        }
        // ========== AWS GuardDuty ==========
        if (enableGuardDuty) {
            // Enable GuardDuty detector
            this.guardDutyDetector = new guardduty.CfnDetector(this, 'GuardDutyDetector', {
                enable: true,
                findingPublishingFrequency: 'FIFTEEN_MINUTES',
                dataSources: {
                    s3Logs: {
                        enable: true, // Monitor S3 data events
                    },
                    kubernetes: {
                        auditLogs: {
                            enable: false, // Not using EKS
                        },
                    },
                    // Note: malwareProtection removed as it's not applicable for serverless architecture
                },
            });
            // Create EventBridge rule for GuardDuty findings
            const guardDutyRule = new events.Rule(this, 'GuardDutyFindingsRule', {
                ruleName: 'SatyaMool-GuardDuty-Findings',
                description: 'Capture GuardDuty findings and send to SNS',
                eventPattern: {
                    source: ['aws.guardduty'],
                    detailType: ['GuardDuty Finding'],
                    detail: {
                        severity: [4, 4.0, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 5, 5.0, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 6, 6.0, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 7, 7.0, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 8, 8.0, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9], // Medium to High severity (4.0+)
                    },
                },
            });
            // Send GuardDuty findings to SNS
            guardDutyRule.addTarget(new targets.SnsTopic(this.securityTopic, {
                message: events.RuleTargetInput.fromText(`GuardDuty Finding Detected:
          
Severity: ${events.EventField.fromPath('$.detail.severity')}
Type: ${events.EventField.fromPath('$.detail.type')}
Description: ${events.EventField.fromPath('$.detail.description')}
Resource: ${events.EventField.fromPath('$.detail.resource.resourceType')}
Account: ${events.EventField.fromPath('$.detail.accountId')}
Region: ${events.EventField.fromPath('$.detail.region')}
Time: ${events.EventField.fromPath('$.detail.updatedAt')}

View in Console: https://console.aws.amazon.com/guardduty/home?region=${events.EventField.fromPath('$.detail.region')}#/findings?search=id%3D${events.EventField.fromPath('$.detail.id')}`),
            }));
            new cdk.CfnOutput(this, 'GuardDutyDetectorId', {
                value: this.guardDutyDetector.ref,
                description: 'GuardDuty detector ID',
                exportName: 'SatyaMool-GuardDutyDetectorId',
            });
        }
        // ========== AWS Config ==========
        if (enableConfig) {
            // Create S3 bucket for Config snapshots if not provided
            const configBucket = props?.configBucket || new s3.Bucket(this, 'ConfigBucket', {
                bucketName: `satyamool-config-${cdk.Stack.of(this).account}`,
                encryption: s3.BucketEncryption.S3_MANAGED,
                blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
                versioned: true,
                lifecycleRules: [
                    {
                        id: 'DeleteOldSnapshots',
                        enabled: true,
                        expiration: cdk.Duration.days(90),
                    },
                ],
                removalPolicy: cdk.RemovalPolicy.RETAIN,
            });
            // Create IAM role for Config
            const configRole = new iam.Role(this, 'ConfigRole', {
                roleName: 'SatyaMool-Config-Role',
                assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
                managedPolicies: [
                    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/ConfigRole'),
                ],
            });
            // Grant Config permissions to write to S3
            configBucket.grantWrite(configRole);
            // Create Config recorder
            const configRecorder = new config.CfnConfigurationRecorder(this, 'ConfigRecorder', {
                name: 'SatyaMool-Config-Recorder',
                roleArn: configRole.roleArn,
                recordingGroup: {
                    allSupported: true,
                    includeGlobalResourceTypes: true,
                    resourceTypes: [],
                },
            });
            // Create Config delivery channel
            const deliveryChannel = new config.CfnDeliveryChannel(this, 'ConfigDeliveryChannel', {
                name: 'SatyaMool-Config-Delivery-Channel',
                s3BucketName: configBucket.bucketName,
                snsTopicArn: this.securityTopic.topicArn,
                configSnapshotDeliveryProperties: {
                    deliveryFrequency: 'TwentyFour_Hours',
                },
            });
            // Ensure recorder is created before delivery channel
            deliveryChannel.addDependency(configRecorder);
            // ========== AWS Config Rules ==========
            // Rule: S3 bucket encryption enabled
            new config.ManagedRule(this, 'S3BucketEncryptionRule', {
                configRuleName: 'satyamool-s3-bucket-encryption-enabled',
                description: 'Checks that S3 buckets have encryption enabled',
                identifier: config.ManagedRuleIdentifiers.S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED,
                ruleScope: config.RuleScope.fromResources([config.ResourceType.S3_BUCKET]),
            });
            // Rule: S3 bucket public access blocked
            new config.ManagedRule(this, 'S3BucketPublicAccessRule', {
                configRuleName: 'satyamool-s3-bucket-public-read-prohibited',
                description: 'Checks that S3 buckets do not allow public read access',
                identifier: config.ManagedRuleIdentifiers.S3_BUCKET_PUBLIC_READ_PROHIBITED,
                ruleScope: config.RuleScope.fromResources([config.ResourceType.S3_BUCKET]),
            });
            // Rule: DynamoDB encryption enabled
            new config.ManagedRule(this, 'DynamoDBEncryptionRule', {
                configRuleName: 'satyamool-dynamodb-table-encrypted-kms',
                description: 'Checks that DynamoDB tables are encrypted',
                identifier: config.ManagedRuleIdentifiers.DYNAMODB_TABLE_ENCRYPTED_KMS,
                ruleScope: config.RuleScope.fromResources([config.ResourceType.DYNAMODB_TABLE]),
            });
            // Rule: Lambda function in VPC
            new config.ManagedRule(this, 'LambdaInVpcRule', {
                configRuleName: 'satyamool-lambda-inside-vpc',
                description: 'Checks that Lambda functions are in a VPC',
                identifier: config.ManagedRuleIdentifiers.LAMBDA_INSIDE_VPC,
                ruleScope: config.RuleScope.fromResources([config.ResourceType.LAMBDA_FUNCTION]),
            });
            // Rule: IAM password policy
            new config.ManagedRule(this, 'IamPasswordPolicyRule', {
                configRuleName: 'satyamool-iam-password-policy',
                description: 'Checks that IAM password policy meets requirements',
                identifier: config.ManagedRuleIdentifiers.IAM_PASSWORD_POLICY,
                inputParameters: {
                    RequireUppercaseCharacters: true,
                    RequireLowercaseCharacters: true,
                    RequireSymbols: true,
                    RequireNumbers: true,
                    MinimumPasswordLength: 14,
                    PasswordReusePrevention: 24,
                    MaxPasswordAge: 90,
                },
            });
            // Rule: Root account MFA enabled
            new config.ManagedRule(this, 'RootAccountMfaRule', {
                configRuleName: 'satyamool-root-account-mfa-enabled',
                description: 'Checks that root account has MFA enabled',
                identifier: config.ManagedRuleIdentifiers.ROOT_ACCOUNT_MFA_ENABLED,
            });
            // Rule: CloudTrail enabled
            new config.ManagedRule(this, 'CloudTrailEnabledRule', {
                configRuleName: 'satyamool-cloudtrail-enabled',
                description: 'Checks that CloudTrail is enabled',
                identifier: config.ManagedRuleIdentifiers.CLOUD_TRAIL_ENABLED,
            });
            // Rule: KMS key rotation enabled
            new config.ManagedRule(this, 'KmsKeyRotationRule', {
                configRuleName: 'satyamool-cmk-backing-key-rotation-enabled',
                description: 'Checks that KMS keys have rotation enabled',
                identifier: config.ManagedRuleIdentifiers.CMK_BACKING_KEY_ROTATION_ENABLED,
                ruleScope: config.RuleScope.fromResources([config.ResourceType.KMS_KEY]),
            });
            new cdk.CfnOutput(this, 'ConfigBucketName', {
                value: configBucket.bucketName,
                description: 'S3 bucket name for Config snapshots',
                exportName: 'SatyaMool-ConfigBucketName',
            });
        }
        // ========== Dependency Scanning ==========
        // Note: Dependency scanning is typically done in CI/CD pipeline
        // This is a placeholder for documentation
        new cdk.CfnOutput(this, 'DependencyScanningNote', {
            value: 'Configure dependency scanning in CI/CD pipeline using npm audit, Snyk, or Dependabot',
            description: 'Dependency scanning configuration note',
        });
        // Output security topic ARN
        new cdk.CfnOutput(this, 'SecurityTopicArn', {
            value: this.securityTopic.topicArn,
            description: 'SNS topic ARN for security notifications',
            exportName: 'SatyaMool-SecurityTopicArn',
        });
    }
}
exports.SecurityScanning = SecurityScanning;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJpdHktc2Nhbm5pbmcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvc2VjdXJpdHktc2Nhbm5pbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7O0dBT0c7OztBQUVILG1DQUFtQztBQUNuQyx1REFBdUQ7QUFDdkQsaURBQWlEO0FBQ2pELDJDQUEyQztBQUMzQyxtRUFBbUU7QUFDbkUsaURBQWlEO0FBQ2pELDBEQUEwRDtBQUMxRCwyQ0FBMkM7QUFDM0MseUNBQXlDO0FBQ3pDLDJDQUF1QztBQTBCdkMsTUFBYSxnQkFBaUIsU0FBUSxzQkFBUztJQUk3QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTZCO1FBQ3JFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxlQUFlLEdBQUcsS0FBSyxFQUFFLGVBQWUsS0FBSyxLQUFLLENBQUM7UUFDekQsTUFBTSxZQUFZLEdBQUcsS0FBSyxFQUFFLFlBQVksS0FBSyxLQUFLLENBQUM7UUFFbkQsOENBQThDO1FBQzlDLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSwyQkFBMkIsRUFBRTtZQUNwRSxTQUFTLEVBQUUsa0NBQWtDO1lBQzdDLFdBQVcsRUFBRSxrQ0FBa0M7U0FDaEQsQ0FBQyxDQUFDO1FBRUgscUNBQXFDO1FBQ3JDLElBQUksS0FBSyxFQUFFLGFBQWEsRUFBRSxDQUFDO1lBQ3pCLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUNoQyxJQUFJLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQ3pELENBQUM7UUFDSixDQUFDO1FBRUQsc0NBQXNDO1FBQ3RDLElBQUksZUFBZSxFQUFFLENBQUM7WUFDcEIsNEJBQTRCO1lBQzVCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFF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QUFDO1FBRUQsNENBQTRDO1FBQzVDLGdFQUFnRTtRQUNoRSwwQ0FBMEM7UUFFMUMsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNoRCxLQUFLLEVBQUUsc0ZBQXNGO1lBQzdGLFdBQVcsRUFBRSx3Q0FBd0M7U0FDdEQsQ0FBQyxDQUFDO1FBRUgsNEJBQTRCO1FBQzVCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUTtZQUNsQyxXQUFXLEVBQUUsMENBQTBDO1lBQ3ZELFVBQVUsRUFBRSw0QkFBNEI7U0FDekMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBcE9ELDRDQW9PQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBTZWN1cml0eSBTY2FubmluZyBDb25maWd1cmF0aW9uXHJcbiAqIFxyXG4gKiBDb25maWd1cmVzIEFXUyBHdWFyZER1dHksIEFXUyBDb25maWcsIGFuZCBkZXBlbmRlbmN5IHNjYW5uaW5nXHJcbiAqIGZvciB0aHJlYXQgZGV0ZWN0aW9uIGFuZCBjb21wbGlhbmNlIG1vbml0b3JpbmcuXHJcbiAqIFxyXG4gKiBSZXF1aXJlbWVudHM6IDEzLjggLSBJbXBsZW1lbnQgc2VjdXJpdHkgc2Nhbm5pbmdcclxuICovXHJcblxyXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBndWFyZGR1dHkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWd1YXJkZHV0eSc7XHJcbmltcG9ydCAqIGFzIGNvbmZpZyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29uZmlnJztcclxuaW1wb3J0ICogYXMgc25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xyXG5pbXBvcnQgKiBhcyBzdWJzY3JpcHRpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMtc3Vic2NyaXB0aW9ucyc7XHJcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcclxuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzLXRhcmdldHMnO1xyXG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XHJcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBTZWN1cml0eVNjYW5uaW5nUHJvcHMge1xyXG4gIC8qKlxyXG4gICAqIEVtYWlsIGFkZHJlc3MgZm9yIHNlY3VyaXR5IG5vdGlmaWNhdGlvbnNcclxuICAgKi9cclxuICBzZWN1cml0eUVtYWlsPzogc3RyaW5nO1xyXG5cclxuICAvKipcclxuICAgKiBFbmFibGUgR3VhcmREdXR5IHRocmVhdCBkZXRlY3Rpb25cclxuICAgKiBAZGVmYXVsdCB0cnVlXHJcbiAgICovXHJcbiAgZW5hYmxlR3VhcmREdXR5PzogYm9vbGVhbjtcclxuXHJcbiAgLyoqXHJcbiAgICogRW5hYmxlIEFXUyBDb25maWcgY29tcGxpYW5jZSBtb25pdG9yaW5nXHJcbiAgICogQGRlZmF1bHQgdHJ1ZVxyXG4gICAqL1xyXG4gIGVuYWJsZUNvbmZpZz86IGJvb2xlYW47XHJcblxyXG4gIC8qKlxyXG4gICAqIFMzIGJ1Y2tldCBmb3IgQ29uZmlnIHNuYXBzaG90c1xyXG4gICAqL1xyXG4gIGNvbmZpZ0J1Y2tldD86IHMzLklCdWNrZXQ7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBTZWN1cml0eVNjYW5uaW5nIGV4dGVuZHMgQ29uc3RydWN0IHtcclxuICBwdWJsaWMgcmVhZG9ubHkgc2VjdXJpdHlUb3BpYzogc25zLlRvcGljO1xyXG4gIHB1YmxpYyByZWFkb25seSBndWFyZER1dHlEZXRlY3Rvcj86IGd1YXJkZHV0eS5DZm5EZXRlY3RvcjtcclxuXHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBTZWN1cml0eVNjYW5uaW5nUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCk7XHJcblxyXG4gICAgY29uc3QgZW5hYmxlR3VhcmREdXR5ID0gcHJvcHM/LmVuYWJsZUd1YXJkRHV0eSAhPT0gZmFsc2U7XHJcbiAgICBjb25zdCBlbmFibGVDb25maWcgPSBwcm9wcz8uZW5hYmxlQ29uZmlnICE9PSBmYWxzZTtcclxuXHJcbiAgICAvLyBDcmVhdGUgU05TIHRvcGljIGZvciBzZWN1cml0eSBub3RpZmljYXRpb25zXHJcbiAgICB0aGlzLnNlY3VyaXR5VG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdTZWN1cml0eU5vdGlmaWNhdGlvblRvcGljJywge1xyXG4gICAgICB0b3BpY05hbWU6ICdTYXR5YU1vb2wtU2VjdXJpdHktTm90aWZpY2F0aW9ucycsXHJcbiAgICAgIGRpc3BsYXlOYW1lOiAnU2F0eWFNb29sIFNlY3VyaXR5IE5vdGlmaWNhdGlvbnMnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkIGVtYWlsIHN1YnNjcmlwdGlvbiBpZiBwcm92aWRlZFxyXG4gICAgaWYgKHByb3BzPy5zZWN1cml0eUVtYWlsKSB7XHJcbiAgICAgIHRoaXMuc2VjdXJpdHlUb3BpYy5hZGRTdWJzY3JpcHRpb24oXHJcbiAgICAgICAgbmV3IHN1YnNjcmlwdGlvbnMuRW1haWxTdWJzY3JpcHRpb24ocHJvcHMuc2VjdXJpdHlFbWFpbClcclxuICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyA9PT09PT09PT09IEFXUyBHdWFyZER1dHkgPT09PT09PT09PVxyXG4gICAgaWYgKGVuYWJsZUd1YXJkRHV0eSkge1xyXG4gICAgICAvLyBFbmFibGUgR3VhcmREdXR5IGRldGVjdG9yXHJcbiAgICAgIHRoaXMuZ3VhcmREdXR5RGV0ZWN0b3IgPSBuZXcgZ3VhcmRkdXR5LkNmbkRldGVjdG9yKHRoaXMsICdHdWFyZER1dHlEZXRlY3RvcicsIHtcclxuICAgICAgICBlbmFibGU6IHRydWUsXHJcbiAgICAgICAgZmluZGluZ1B1Ymxpc2hpbmdGcmVxdWVuY3k6ICdGSUZURUVOX01JTlVURVMnLFxyXG4gICAgICAgIGRhdGFTb3VyY2VzOiB7XHJcbiAgICAgICAgICBzM0xvZ3M6IHtcclxuICAgICAgICAgICAgZW5hYmxlOiB0cnVlLCAvLyBNb25pdG9yIFMzIGRhdGEgZXZlbnRzXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAga3ViZXJuZXRlczoge1xyXG4gICAgICAgICAgICBhdWRpdExvZ3M6IHtcclxuICAgICAgICAgICAgICBlbmFibGU6IGZhbHNlLCAvLyBOb3QgdXNpbmcgRUtTXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgLy8gTm90ZTogbWFsd2FyZVByb3RlY3Rpb24gcmVtb3ZlZCBhcyBpdCdzIG5vdCBhcHBsaWNhYmxlIGZvciBzZXJ2ZXJsZXNzIGFyY2hpdGVjdHVyZVxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gQ3JlYXRlIEV2ZW50QnJpZGdlIHJ1bGUgZm9yIEd1YXJkRHV0eSBmaW5kaW5nc1xyXG4gICAgICBjb25zdCBndWFyZER1dHlSdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdHdWFyZER1dHlGaW5kaW5nc1J1bGUnLCB7XHJcbiAgICAgICAgcnVsZU5hbWU6ICdTYXR5YU1vb2wtR3VhcmREdXR5LUZpbmRpbmdzJyxcclxuICAgICAgICBkZXNjcmlwdGlvbjogJ0NhcHR1cmUgR3VhcmREdXR5IGZpbmRpbmdzIGFuZCBzZW5kIHRvIFNOUycsXHJcbiAgICAgICAgZXZlbnRQYXR0ZXJuOiB7XHJcbiAgICAgICAgICBzb3VyY2U6IFsnYXdzLmd1YXJkZHV0eSddLFxyXG4gICAgICAgICAgZGV0YWlsVHlwZTogWydHdWFyZER1dHkgRmluZGluZyddLFxyXG4gICAgICAgICAgZGV0YWlsOiB7XHJcbiAgICAgICAgICAgIHNldmVyaXR5OiBbNCwgNC4wLCA0LjEsIDQuMiwgNC4zLCA0LjQsIDQuNSwgNC42LCA0LjcsIDQuOCwgNC45LCA1LCA1LjAsIDUuMSwgNS4yLCA1LjMsIDUuNCwgNS41LCA1LjYsIDUuNywgNS44LCA1LjksIDYsIDYuMCwgNi4xLCA2LjIsIDYuMywgNi40LCA2LjUsIDYuNiwgNi43LCA2LjgsIDYuOSwgNywgNy4wLCA3LjEsIDcuMiwgNy4zLCA3LjQsIDcuNSwgNy42LCA3LjcsIDcuOCwgNy45LCA4LCA4LjAsIDguMSwgOC4yLCA4LjMsIDguNCwgOC41LCA4LjYsIDguNywgOC44LCA4LjldLCAvLyBNZWRpdW0gdG8gSGlnaCBzZXZlcml0eSAoNC4wKylcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBTZW5kIEd1YXJkRHV0eSBmaW5kaW5ncyB0byBTTlNcclxuICAgICAgZ3VhcmREdXR5UnVsZS5hZGRUYXJnZXQobmV3IHRhcmdldHMuU25zVG9waWModGhpcy5zZWN1cml0eVRvcGljLCB7XHJcbiAgICAgICAgbWVzc2FnZTogZXZlbnRzLlJ1bGVUYXJnZXRJbnB1dC5mcm9tVGV4dChcclxuICAgICAgICAgIGBHdWFyZER1dHkgRmluZGluZyBEZXRlY3RlZDpcclxuICAgICAgICAgIFxyXG5TZXZlcml0eTogJHtldmVudHMuRXZlbnRGaWVsZC5mcm9tUGF0aCgnJC5kZXRhaWwuc2V2ZXJpdHknKX1cclxuVHlwZTogJHtldmVudHMuRXZlbnRGaWVsZC5mcm9tUGF0aCgnJC5kZXRhaWwudHlwZScpfVxyXG5EZXNjcmlwdGlvbjogJHtldmVudHMuRXZlbnRGaWVsZC5mcm9tUGF0aCgnJC5kZXRhaWwuZGVzY3JpcHRpb24nKX1cclxuUmVzb3VyY2U6ICR7ZXZlbnRzLkV2ZW50RmllbGQuZnJvbVBhdGgoJyQuZGV0YWlsLnJlc291cmNlLnJlc291cmNlVHlwZScpfVxyXG5BY2NvdW50OiAke2V2ZW50cy5FdmVudEZpZWxkLmZyb21QYXRoKCckLmRldGFpbC5hY2NvdW50SWQnKX1cclxuUmVnaW9uOiAke2V2ZW50cy5FdmVudEZpZWxkLmZyb21QYXRoKCckLmRldGFpbC5yZWdpb24nKX1cclxuVGltZTogJHtldmVudHMuRXZlbnRGaWVsZC5mcm9tUGF0aCgnJC5kZXRhaWwudXBkYXRlZEF0Jyl9XHJcblxyXG5WaWV3IGluIENvbnNvbGU6IGh0dHBzOi8vY29uc29sZS5hd3MuYW1hem9uLmNvbS9ndWFyZGR1dHkvaG9tZT9yZWdpb249JHtldmVudHMuRXZlbnRGaWVsZC5mcm9tUGF0aCgnJC5kZXRhaWwucmVnaW9uJyl9Iy9maW5kaW5ncz9zZWFyY2g9aWQlM0Qke2V2ZW50cy5FdmVudEZpZWxkLmZyb21QYXRoKCckLmRldGFpbC5pZCcpfWBcclxuICAgICAgICApLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnR3VhcmREdXR5RGV0ZWN0b3JJZCcsIHtcclxuICAgICAgICB2YWx1ZTogdGhpcy5ndWFyZER1dHlEZXRlY3Rvci5yZWYsXHJcbiAgICAgICAgZGVzY3JpcHRpb246ICdHdWFyZER1dHkgZGV0ZWN0b3IgSUQnLFxyXG4gICAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtR3VhcmREdXR5RGV0ZWN0b3JJZCcsXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09PT09PT0gQVdTIENvbmZpZyA9PT09PT09PT09XHJcbiAgICBpZiAoZW5hYmxlQ29uZmlnKSB7XHJcbiAgICAgIC8vIENyZWF0ZSBTMyBidWNrZXQgZm9yIENvbmZpZyBzbmFwc2hvdHMgaWYgbm90IHByb3ZpZGVkXHJcbiAgICAgIGNvbnN0IGNvbmZpZ0J1Y2tldCA9IHByb3BzPy5jb25maWdCdWNrZXQgfHwgbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQ29uZmlnQnVja2V0Jywge1xyXG4gICAgICAgIGJ1Y2tldE5hbWU6IGBzYXR5YW1vb2wtY29uZmlnLSR7Y2RrLlN0YWNrLm9mKHRoaXMpLmFjY291bnR9YCxcclxuICAgICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXHJcbiAgICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcclxuICAgICAgICB2ZXJzaW9uZWQ6IHRydWUsXHJcbiAgICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgaWQ6ICdEZWxldGVPbGRTbmFwc2hvdHMnLFxyXG4gICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxyXG4gICAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg5MCksXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIENyZWF0ZSBJQU0gcm9sZSBmb3IgQ29uZmlnXHJcbiAgICAgIGNvbnN0IGNvbmZpZ1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0NvbmZpZ1JvbGUnLCB7XHJcbiAgICAgICAgcm9sZU5hbWU6ICdTYXR5YU1vb2wtQ29uZmlnLVJvbGUnLFxyXG4gICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdjb25maWcuYW1hem9uYXdzLmNvbScpLFxyXG4gICAgICAgIG1hbmFnZWRQb2xpY2llczogW1xyXG4gICAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQ29uZmlnUm9sZScpLFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gR3JhbnQgQ29uZmlnIHBlcm1pc3Npb25zIHRvIHdyaXRlIHRvIFMzXHJcbiAgICAgIGNvbmZpZ0J1Y2tldC5ncmFudFdyaXRlKGNvbmZpZ1JvbGUpO1xyXG5cclxuICAgICAgLy8gQ3JlYXRlIENvbmZpZyByZWNvcmRlclxyXG4gICAgICBjb25zdCBjb25maWdSZWNvcmRlciA9IG5ldyBjb25maWcuQ2ZuQ29uZmlndXJhdGlvblJlY29yZGVyKHRoaXMsICdDb25maWdSZWNvcmRlcicsIHtcclxuICAgICAgICBuYW1lOiAnU2F0eWFNb29sLUNvbmZpZy1SZWNvcmRlcicsXHJcbiAgICAgICAgcm9sZUFybjogY29uZmlnUm9sZS5yb2xlQXJuLFxyXG4gICAgICAgIHJlY29yZGluZ0dyb3VwOiB7XHJcbiAgICAgICAgICBhbGxTdXBwb3J0ZWQ6IHRydWUsXHJcbiAgICAgICAgICBpbmNsdWRlR2xvYmFsUmVzb3VyY2VUeXBlczogdHJ1ZSxcclxuICAgICAgICAgIHJlc291cmNlVHlwZXM6IFtdLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gQ3JlYXRlIENvbmZpZyBkZWxpdmVyeSBjaGFubmVsXHJcbiAgICAgIGNvbnN0IGRlbGl2ZXJ5Q2hhbm5lbCA9IG5ldyBjb25maWcuQ2ZuRGVsaXZlcnlDaGFubmVsKHRoaXMsICdDb25maWdEZWxpdmVyeUNoYW5uZWwnLCB7XHJcbiAgICAgICAgbmFtZTogJ1NhdHlhTW9vbC1Db25maWctRGVsaXZlcnktQ2hhbm5lbCcsXHJcbiAgICAgICAgczNCdWNrZXROYW1lOiBjb25maWdCdWNrZXQuYnVja2V0TmFtZSxcclxuICAgICAgICBzbnNUb3BpY0FybjogdGhpcy5zZWN1cml0eVRvcGljLnRvcGljQXJuLFxyXG4gICAgICAgIGNvbmZpZ1NuYXBzaG90RGVsaXZlcnlQcm9wZXJ0aWVzOiB7XHJcbiAgICAgICAgICBkZWxpdmVyeUZyZXF1ZW5jeTogJ1R3ZW50eUZvdXJfSG91cnMnLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gRW5zdXJlIHJlY29yZGVyIGlzIGNyZWF0ZWQgYmVmb3JlIGRlbGl2ZXJ5IGNoYW5uZWxcclxuICAgICAgZGVsaXZlcnlDaGFubmVsLmFkZERlcGVuZGVuY3koY29uZmlnUmVjb3JkZXIpO1xyXG5cclxuICAgICAgLy8gPT09PT09PT09PSBBV1MgQ29uZmlnIFJ1bGVzID09PT09PT09PT1cclxuXHJcbiAgICAgIC8vIFJ1bGU6IFMzIGJ1Y2tldCBlbmNyeXB0aW9uIGVuYWJsZWRcclxuICAgICAgbmV3IGNvbmZpZy5NYW5hZ2VkUnVsZSh0aGlzLCAnUzNCdWNrZXRFbmNyeXB0aW9uUnVsZScsIHtcclxuICAgICAgICBjb25maWdSdWxlTmFtZTogJ3NhdHlhbW9vbC1zMy1idWNrZXQtZW5jcnlwdGlvbi1lbmFibGVkJyxcclxuICAgICAgICBkZXNjcmlwdGlvbjogJ0NoZWNrcyB0aGF0IFMzIGJ1Y2tldHMgaGF2ZSBlbmNyeXB0aW9uIGVuYWJsZWQnLFxyXG4gICAgICAgIGlkZW50aWZpZXI6IGNvbmZpZy5NYW5hZ2VkUnVsZUlkZW50aWZpZXJzLlMzX0JVQ0tFVF9TRVJWRVJfU0lERV9FTkNSWVBUSU9OX0VOQUJMRUQsXHJcbiAgICAgICAgcnVsZVNjb3BlOiBjb25maWcuUnVsZVNjb3BlLmZyb21SZXNvdXJjZXMoW2NvbmZpZy5SZXNvdXJjZVR5cGUuUzNfQlVDS0VUXSksXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gUnVsZTogUzMgYnVja2V0IHB1YmxpYyBhY2Nlc3MgYmxvY2tlZFxyXG4gICAgICBuZXcgY29uZmlnLk1hbmFnZWRSdWxlKHRoaXMsICdTM0J1Y2tldFB1YmxpY0FjY2Vzc1J1bGUnLCB7XHJcbiAgICAgICAgY29uZmlnUnVsZU5hbWU6ICdzYXR5YW1vb2wtczMtYnVja2V0LXB1YmxpYy1yZWFkLXByb2hpYml0ZWQnLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2tzIHRoYXQgUzMgYnVja2V0cyBkbyBub3QgYWxsb3cgcHVibGljIHJlYWQgYWNjZXNzJyxcclxuICAgICAgICBpZGVudGlmaWVyOiBjb25maWcuTWFuYWdlZFJ1bGVJZGVudGlmaWVycy5TM19CVUNLRVRfUFVCTElDX1JFQURfUFJPSElCSVRFRCxcclxuICAgICAgICBydWxlU2NvcGU6IGNvbmZpZy5SdWxlU2NvcGUuZnJvbVJlc291cmNlcyhbY29uZmlnLlJlc291cmNlVHlwZS5TM19CVUNLRVRdKSxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBSdWxlOiBEeW5hbW9EQiBlbmNyeXB0aW9uIGVuYWJsZWRcclxuICAgICAgbmV3IGNvbmZpZy5NYW5hZ2VkUnVsZSh0aGlzLCAnRHluYW1vREJFbmNyeXB0aW9uUnVsZScsIHtcclxuICAgICAgICBjb25maWdSdWxlTmFtZTogJ3NhdHlhbW9vbC1keW5hbW9kYi10YWJsZS1lbmNyeXB0ZWQta21zJyxcclxuICAgICAgICBkZXNjcmlwdGlvbjogJ0NoZWNrcyB0aGF0IER5bmFtb0RCIHRhYmxlcyBhcmUgZW5jcnlwdGVkJyxcclxuICAgICAgICBpZGVudGlmaWVyOiBjb25maWcuTWFuYWdlZFJ1bGVJZGVudGlmaWVycy5EWU5BTU9EQl9UQUJMRV9FTkNSWVBURURfS01TLFxyXG4gICAgICAgIHJ1bGVTY29wZTogY29uZmlnLlJ1bGVTY29wZS5mcm9tUmVzb3VyY2VzKFtjb25maWcuUmVzb3VyY2VUeXBlLkRZTkFNT0RCX1RBQkxFXSksXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gUnVsZTogTGFtYmRhIGZ1bmN0aW9uIGluIFZQQ1xyXG4gICAgICBuZXcgY29uZmlnLk1hbmFnZWRSdWxlKHRoaXMsICdMYW1iZGFJblZwY1J1bGUnLCB7XHJcbiAgICAgICAgY29uZmlnUnVsZU5hbWU6ICdzYXR5YW1vb2wtbGFtYmRhLWluc2lkZS12cGMnLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2tzIHRoYXQgTGFtYmRhIGZ1bmN0aW9ucyBhcmUgaW4gYSBWUEMnLFxyXG4gICAgICAgIGlkZW50aWZpZXI6IGNvbmZpZy5NYW5hZ2VkUnVsZUlkZW50aWZpZXJzLkxBTUJEQV9JTlNJREVfVlBDLFxyXG4gICAgICAgIHJ1bGVTY29wZTogY29uZmlnLlJ1bGVTY29wZS5mcm9tUmVzb3VyY2VzKFtjb25maWcuUmVzb3VyY2VUeXBlLkxBTUJEQV9GVU5DVElPTl0pLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFJ1bGU6IElBTSBwYXNzd29yZCBwb2xpY3lcclxuICAgICAgbmV3IGNvbmZpZy5NYW5hZ2VkUnVsZSh0aGlzLCAnSWFtUGFzc3dvcmRQb2xpY3lSdWxlJywge1xyXG4gICAgICAgIGNvbmZpZ1J1bGVOYW1lOiAnc2F0eWFtb29sLWlhbS1wYXNzd29yZC1wb2xpY3knLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2tzIHRoYXQgSUFNIHBhc3N3b3JkIHBvbGljeSBtZWV0cyByZXF1aXJlbWVudHMnLFxyXG4gICAgICAgIGlkZW50aWZpZXI6IGNvbmZpZy5NYW5hZ2VkUnVsZUlkZW50aWZpZXJzLklBTV9QQVNTV09SRF9QT0xJQ1ksXHJcbiAgICAgICAgaW5wdXRQYXJhbWV0ZXJzOiB7XHJcbiAgICAgICAgICBSZXF1aXJlVXBwZXJjYXNlQ2hhcmFjdGVyczogdHJ1ZSxcclxuICAgICAgICAgIFJlcXVpcmVMb3dlcmNhc2VDaGFyYWN0ZXJzOiB0cnVlLFxyXG4gICAgICAgICAgUmVxdWlyZVN5bWJvbHM6IHRydWUsXHJcbiAgICAgICAgICBSZXF1aXJlTnVtYmVyczogdHJ1ZSxcclxuICAgICAgICAgIE1pbmltdW1QYXNzd29yZExlbmd0aDogMTQsXHJcbiAgICAgICAgICBQYXNzd29yZFJldXNlUHJldmVudGlvbjogMjQsXHJcbiAgICAgICAgICBNYXhQYXNzd29yZEFnZTogOTAsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBSdWxlOiBSb290IGFjY291bnQgTUZBIGVuYWJsZWRcclxuICAgICAgbmV3IGNvbmZpZy5NYW5hZ2VkUnVsZSh0aGlzLCAnUm9vdEFjY291bnRNZmFSdWxlJywge1xyXG4gICAgICAgIGNvbmZpZ1J1bGVOYW1lOiAnc2F0eWFtb29sLXJvb3QtYWNjb3VudC1tZmEtZW5hYmxlZCcsXHJcbiAgICAgICAgZGVzY3JpcHRpb246ICdDaGVja3MgdGhhdCByb290IGFjY291bnQgaGFzIE1GQSBlbmFibGVkJyxcclxuICAgICAgICBpZGVudGlmaWVyOiBjb25maWcuTWFuYWdlZFJ1bGVJZGVudGlmaWVycy5ST09UX0FDQ09VTlRfTUZBX0VOQUJMRUQsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gUnVsZTogQ2xvdWRUcmFpbCBlbmFibGVkXHJcbiAgICAgIG5ldyBjb25maWcuTWFuYWdlZFJ1bGUodGhpcywgJ0Nsb3VkVHJhaWxFbmFibGVkUnVsZScsIHtcclxuICAgICAgICBjb25maWdSdWxlTmFtZTogJ3NhdHlhbW9vbC1jbG91ZHRyYWlsLWVuYWJsZWQnLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2tzIHRoYXQgQ2xvdWRUcmFpbCBpcyBlbmFibGVkJyxcclxuICAgICAgICBpZGVudGlmaWVyOiBjb25maWcuTWFuYWdlZFJ1bGVJZGVudGlmaWVycy5DTE9VRF9UUkFJTF9FTkFCTEVELFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFJ1bGU6IEtNUyBrZXkgcm90YXRpb24gZW5hYmxlZFxyXG4gICAgICBuZXcgY29uZmlnLk1hbmFnZWRSdWxlKHRoaXMsICdLbXNLZXlSb3RhdGlvblJ1bGUnLCB7XHJcbiAgICAgICAgY29uZmlnUnVsZU5hbWU6ICdzYXR5YW1vb2wtY21rLWJhY2tpbmcta2V5LXJvdGF0aW9uLWVuYWJsZWQnLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2tzIHRoYXQgS01TIGtleXMgaGF2ZSByb3RhdGlvbiBlbmFibGVkJyxcclxuICAgICAgICBpZGVudGlmaWVyOiBjb25maWcuTWFuYWdlZFJ1bGVJZGVudGlmaWVycy5DTUtfQkFDS0lOR19LRVlfUk9UQVRJT05fRU5BQkxFRCxcclxuICAgICAgICBydWxlU2NvcGU6IGNvbmZpZy5SdWxlU2NvcGUuZnJvbVJlc291cmNlcyhbY29uZmlnLlJlc291cmNlVHlwZS5LTVNfS0VZXSksXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvbmZpZ0J1Y2tldE5hbWUnLCB7XHJcbiAgICAgICAgdmFsdWU6IGNvbmZpZ0J1Y2tldC5idWNrZXROYW1lLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUzMgYnVja2V0IG5hbWUgZm9yIENvbmZpZyBzbmFwc2hvdHMnLFxyXG4gICAgICAgIGV4cG9ydE5hbWU6ICdTYXR5YU1vb2wtQ29uZmlnQnVja2V0TmFtZScsXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09PT09PT0gRGVwZW5kZW5jeSBTY2FubmluZyA9PT09PT09PT09XHJcbiAgICAvLyBOb3RlOiBEZXBlbmRlbmN5IHNjYW5uaW5nIGlzIHR5cGljYWxseSBkb25lIGluIENJL0NEIHBpcGVsaW5lXHJcbiAgICAvLyBUaGlzIGlzIGEgcGxhY2Vob2xkZXIgZm9yIGRvY3VtZW50YXRpb25cclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGVwZW5kZW5jeVNjYW5uaW5nTm90ZScsIHtcclxuICAgICAgdmFsdWU6ICdDb25maWd1cmUgZGVwZW5kZW5jeSBzY2FubmluZyBpbiBDSS9DRCBwaXBlbGluZSB1c2luZyBucG0gYXVkaXQsIFNueWssIG9yIERlcGVuZGFib3QnLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0RlcGVuZGVuY3kgc2Nhbm5pbmcgY29uZmlndXJhdGlvbiBub3RlJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIE91dHB1dCBzZWN1cml0eSB0b3BpYyBBUk5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTZWN1cml0eVRvcGljQXJuJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5zZWN1cml0eVRvcGljLnRvcGljQXJuLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1NOUyB0b3BpYyBBUk4gZm9yIHNlY3VyaXR5IG5vdGlmaWNhdGlvbnMnLFxyXG4gICAgICBleHBvcnROYW1lOiAnU2F0eWFNb29sLVNlY3VyaXR5VG9waWNBcm4nLFxyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcbiJdfQ==