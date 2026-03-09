/**
 * Security Scanning Configuration
 *
 * Configures AWS GuardDuty, AWS Config, and dependency scanning
 * for threat detection and compliance monitoring.
 *
 * Requirements: 13.8 - Implement security scanning
 */
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as sns from 'aws-cdk-lib/aws-sns';
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
export declare class SecurityScanning extends Construct {
    readonly securityTopic: sns.Topic;
    readonly guardDutyDetector?: guardduty.CfnDetector;
    constructor(scope: Construct, id: string, props?: SecurityScanningProps);
}
