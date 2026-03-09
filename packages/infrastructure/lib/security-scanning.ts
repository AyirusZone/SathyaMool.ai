/**
 * Security Scanning Configuration
 * 
 * Configures AWS GuardDuty, AWS Config, and dependency scanning
 * for threat detection and compliance monitoring.
 * 
 * Requirements: 13.8 - Implement security scanning
 */

import * as cdk from 'aws-cdk-lib';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as config from 'aws-cdk-lib/aws-config';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface SecurityScanningProps {
  /**
   * Email address for security notifications
   */
  securityEmail?: string;

  /**
   * Enable GuardDuty threat detection
   * @default true
   */
  enableGuardDuty?: boolean;

  /**
   * Enable AWS Config compliance monitoring
   * @default true
   */
  enableConfig?: boolean;

  /**
   * S3 bucket for Config snapshots
   */
  configBucket?: s3.IBucket;
}

export class SecurityScanning extends Construct {
  public readonly securityTopic: sns.Topic;
  public readonly guardDutyDetector?: guardduty.CfnDetector;

  constructor(scope: Construct, id: string, props?: SecurityScanningProps) {
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
      this.securityTopic.addSubscription(
        new subscriptions.EmailSubscription(props.securityEmail)
      );
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
        message: events.RuleTargetInput.fromText(
          `GuardDuty Finding Detected:
          
Severity: ${events.EventField.fromPath('$.detail.severity')}
Type: ${events.EventField.fromPath('$.detail.type')}
Description: ${events.EventField.fromPath('$.detail.description')}
Resource: ${events.EventField.fromPath('$.detail.resource.resourceType')}
Account: ${events.EventField.fromPath('$.detail.accountId')}
Region: ${events.EventField.fromPath('$.detail.region')}
Time: ${events.EventField.fromPath('$.detail.updatedAt')}

View in Console: https://console.aws.amazon.com/guardduty/home?region=${events.EventField.fromPath('$.detail.region')}#/findings?search=id%3D${events.EventField.fromPath('$.detail.id')}`
        ),
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
