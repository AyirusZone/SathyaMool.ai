# Security Scanning

## Overview

SatyaMool implements comprehensive security scanning using AWS GuardDuty for threat detection, AWS Config for compliance monitoring, and automated dependency scanning for vulnerabilities.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Security Scanning                         │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  GuardDuty   │  │  AWS Config  │  │  Dependency  │      │
│  │    Threat    │  │  Compliance  │  │   Scanning   │      │
│  │  Detection   │  │  Monitoring  │  │   (CI/CD)    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │               │
│         └─────────────────┼──────────────────┘               │
│                           │                                  │
│                  ┌────────▼────────┐                         │
│                  │  SNS Topic      │                         │
│                  │  Security       │                         │
│                  │  Notifications  │                         │
│                  └────────┬────────┘                         │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            ▼
                    Security Team Email
```

## AWS GuardDuty

### Overview

GuardDuty is a threat detection service that continuously monitors for malicious activity and unauthorized behavior.

### Configuration

- **Status**: Enabled
- **Finding Frequency**: Every 15 minutes
- **Data Sources**:
  - VPC Flow Logs
  - CloudTrail event logs
  - DNS logs
  - S3 data events

### Monitored Threats

#### Account Compromise

- Unusual API calls
- Unusual console logins
- Credential exfiltration
- Brute force attacks

#### Instance Compromise

- Cryptocurrency mining
- Backdoor communication
- Malware activity
- Unusual network traffic

#### S3 Bucket Compromise

- Suspicious data access patterns
- Unusual API calls
- Data exfiltration attempts
- Public bucket exposure

### Finding Severity Levels

| Severity | Score Range | Action |
|----------|-------------|--------|
| Low | 0.1 - 3.9 | Log and review |
| Medium | 4.0 - 6.9 | Alert security team |
| High | 7.0 - 8.9 | Immediate investigation |
| Critical | 9.0 - 10.0 | Immediate response |

### Notification Configuration

Findings with severity ≥ 4.0 (Medium and above) trigger SNS notifications:

```
GuardDuty Finding Detected:

Severity: 7.5
Type: UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration
Description: Credentials that were created exclusively for an EC2 instance are being used from an external IP address
Resource: IAM User
Account: 123456789012
Region: us-east-1
Time: 2024-01-15T10:30:00Z

View in Console: https://console.aws.amazon.com/guardduty/...
```

### Response Procedures

#### Medium Severity (4.0 - 6.9)

1. Review finding details in GuardDuty console
2. Investigate affected resources
3. Document findings in incident log
4. Implement remediation if needed
5. Update security policies

#### High Severity (7.0 - 8.9)

1. Immediately review finding details
2. Isolate affected resources if necessary
3. Investigate root cause
4. Implement immediate remediation
5. Notify stakeholders
6. Document incident and response

#### Critical Severity (9.0 - 10.0)

1. Activate incident response team
2. Immediately isolate affected resources
3. Preserve evidence for forensics
4. Implement emergency remediation
5. Notify all stakeholders
6. Conduct post-incident review
7. Update security controls

## AWS Config

### Overview

AWS Config continuously monitors and records AWS resource configurations and evaluates them against desired configurations.

### Configuration

- **Status**: Enabled
- **Recording**: All supported resources
- **Global Resources**: Included (IAM, etc.)
- **Snapshot Frequency**: Every 24 hours
- **Snapshot Storage**: S3 bucket with 90-day retention

### Config Rules

#### S3 Bucket Encryption Enabled

- **Rule**: `s3-bucket-server-side-encryption-enabled`
- **Purpose**: Ensure all S3 buckets have encryption enabled
- **Scope**: All S3 buckets
- **Remediation**: Enable default encryption on non-compliant buckets

#### S3 Bucket Public Access Prohibited

- **Rule**: `s3-bucket-public-read-prohibited`
- **Purpose**: Ensure S3 buckets don't allow public read access
- **Scope**: All S3 buckets
- **Remediation**: Enable block public access on non-compliant buckets

#### DynamoDB Table Encrypted with KMS

- **Rule**: `dynamodb-table-encrypted-kms`
- **Purpose**: Ensure DynamoDB tables are encrypted with KMS
- **Scope**: All DynamoDB tables
- **Remediation**: Enable KMS encryption on non-compliant tables

#### Lambda Function in VPC

- **Rule**: `lambda-inside-vpc`
- **Purpose**: Ensure Lambda functions are deployed in VPC
- **Scope**: All Lambda functions
- **Remediation**: Attach non-compliant functions to VPC

#### IAM Password Policy

- **Rule**: `iam-password-policy`
- **Purpose**: Ensure IAM password policy meets security requirements
- **Requirements**:
  - Minimum length: 14 characters
  - Require uppercase letters
  - Require lowercase letters
  - Require numbers
  - Require symbols
  - Password reuse prevention: 24 passwords
  - Maximum password age: 90 days
- **Remediation**: Update IAM password policy

#### Root Account MFA Enabled

- **Rule**: `root-account-mfa-enabled`
- **Purpose**: Ensure root account has MFA enabled
- **Remediation**: Enable MFA on root account

#### CloudTrail Enabled

- **Rule**: `cloudtrail-enabled`
- **Purpose**: Ensure CloudTrail is enabled for audit logging
- **Remediation**: Enable CloudTrail in all regions

#### KMS Key Rotation Enabled

- **Rule**: `cmk-backing-key-rotation-enabled`
- **Purpose**: Ensure KMS keys have automatic rotation enabled
- **Scope**: All customer-managed KMS keys
- **Remediation**: Enable key rotation on non-compliant keys

### Compliance Dashboard

View compliance status in AWS Config console:

1. Navigate to AWS Config → Dashboard
2. View compliance summary by rule
3. Filter by compliant/non-compliant resources
4. Drill down into specific resources
5. View configuration timeline

### Remediation

#### Automated Remediation

For some rules, AWS Config can automatically remediate non-compliant resources:

```typescript
new config.ManagedRule(this, 'S3BucketEncryptionRule', {
  // ... rule configuration
  remediationConfiguration: {
    automatic: true,
    retryAttemptSeconds: 60,
    maximumAutomaticAttempts: 5,
    targetType: 'SSM_DOCUMENT',
    targetIdentifier: 'AWS-EnableS3BucketEncryption',
  },
});
```

#### Manual Remediation

For rules without automated remediation:

1. Review non-compliant resources in Config console
2. Follow remediation steps in rule description
3. Verify compliance after remediation
4. Document remediation actions

## Dependency Scanning

### Overview

Automated scanning of application dependencies for known vulnerabilities.

### Tools

#### npm audit (Built-in)

```bash
# Run in CI/CD pipeline
npm audit --audit-level=moderate

# Generate report
npm audit --json > audit-report.json

# Fix vulnerabilities automatically
npm audit fix
```

#### Snyk (Recommended)

```bash
# Install Snyk CLI
npm install -g snyk

# Authenticate
snyk auth

# Test for vulnerabilities
snyk test

# Monitor project
snyk monitor

# Fix vulnerabilities
snyk fix
```

#### GitHub Dependabot (Automated)

Enable Dependabot in GitHub repository:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    reviewers:
      - "security-team"
    labels:
      - "dependencies"
      - "security"
```

### CI/CD Integration

#### GitHub Actions

```yaml
name: Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * 0' # Weekly

jobs:
  dependency-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run npm audit
        run: npm audit --audit-level=moderate
      
      - name: Run Snyk scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high
```

### Vulnerability Severity Levels

| Severity | Action | Timeline |
|----------|--------|----------|
| Critical | Immediate fix | < 24 hours |
| High | Urgent fix | < 7 days |
| Medium | Scheduled fix | < 30 days |
| Low | Backlog | Next sprint |

### Response Procedures

#### Critical/High Vulnerabilities

1. **Assess Impact**: Determine if vulnerability affects production
2. **Patch Immediately**: Update to patched version
3. **Test**: Run full test suite
4. **Deploy**: Emergency deployment if in production
5. **Verify**: Confirm vulnerability is resolved
6. **Document**: Record incident and response

#### Medium/Low Vulnerabilities

1. **Review**: Assess vulnerability details
2. **Plan**: Schedule fix in next sprint
3. **Update**: Update dependency to patched version
4. **Test**: Run full test suite
5. **Deploy**: Include in regular deployment
6. **Monitor**: Track for future occurrences

## Monitoring and Alerting

### CloudWatch Metrics

#### GuardDuty Metrics

- **Custom Metric**: `SatyaMool/GuardDuty/FindingsCount`
- **Custom Metric**: `SatyaMool/GuardDuty/HighSeverityFindings`
- **Custom Metric**: `SatyaMool/GuardDuty/CriticalSeverityFindings`

#### Config Metrics

- **Custom Metric**: `SatyaMool/Config/NonCompliantResources`
- **Custom Metric**: `SatyaMool/Config/ComplianceScore`

#### Dependency Metrics

- **Custom Metric**: `SatyaMool/Dependencies/VulnerabilitiesCount`
- **Custom Metric**: `SatyaMool/Dependencies/CriticalVulnerabilities`

### Alarms

#### GuardDuty Alarms

```typescript
new cloudwatch.Alarm(this, 'GuardDutyHighSeverityAlarm', {
  alarmName: 'SatyaMool-GuardDuty-High-Severity',
  metric: new cloudwatch.Metric({
    namespace: 'SatyaMool/GuardDuty',
    metricName: 'HighSeverityFindings',
    statistic: 'Sum',
    period: cdk.Duration.minutes(5),
  }),
  threshold: 1,
  evaluationPeriods: 1,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
});
```

#### Config Alarms

```typescript
new cloudwatch.Alarm(this, 'ConfigNonCompliantAlarm', {
  alarmName: 'SatyaMool-Config-Non-Compliant',
  metric: new cloudwatch.Metric({
    namespace: 'SatyaMool/Config',
    metricName: 'NonCompliantResources',
    statistic: 'Average',
    period: cdk.Duration.hours(1),
  }),
  threshold: 5,
  evaluationPeriods: 1,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
});
```

## Security Scanning Dashboard

Create a unified security dashboard:

```typescript
const securityDashboard = new cloudwatch.Dashboard(this, 'SecurityDashboard', {
  dashboardName: 'SatyaMool-Security',
});

securityDashboard.addWidgets(
  new cloudwatch.TextWidget({
    markdown: '# SatyaMool Security Scanning Dashboard',
    width: 24,
    height: 1,
  }),
  new cloudwatch.GraphWidget({
    title: 'GuardDuty Findings',
    width: 12,
    height: 6,
    // ... GuardDuty metrics
  }),
  new cloudwatch.GraphWidget({
    title: 'Config Compliance',
    width: 12,
    height: 6,
    // ... Config metrics
  }),
);
```

## Best Practices

1. **Enable All Scanning**: Enable GuardDuty, Config, and dependency scanning
2. **Review Regularly**: Review findings and compliance status weekly
3. **Automate Remediation**: Use automated remediation where possible
4. **Document Incidents**: Maintain incident log for all security events
5. **Update Policies**: Update security policies based on findings
6. **Train Team**: Ensure team is trained on security response procedures
7. **Test Response**: Conduct security incident response drills
8. **Monitor Costs**: Track security scanning costs in Cost Explorer

## Compliance

### Requirements

- **Requirement 13.8**: Implement automated dependency scanning
- **Requirement 13.8**: Configure AWS GuardDuty for threat detection
- **Requirement 13.8**: Set up AWS Config for compliance monitoring

### Audit

- GuardDuty enabled and monitoring all data sources
- AWS Config enabled with all recommended rules
- Dependency scanning integrated in CI/CD pipeline
- Security notifications configured
- Incident response procedures documented

## Cost Optimization

### GuardDuty Costs

- **VPC Flow Logs**: ~$0.50 per GB analyzed
- **CloudTrail Events**: ~$4.80 per million events
- **DNS Logs**: ~$0.40 per million queries
- **S3 Data Events**: ~$0.80 per million events

**Estimated**: ~$50-100/month depending on usage

### Config Costs

- **Configuration Items**: $0.003 per item recorded
- **Config Rules**: $2.00 per rule per region per month
- **Conformance Packs**: $11.00 per pack per region per month

**Estimated**: ~$20-40/month with 8 rules

### Total Security Scanning Cost

**Estimated**: ~$70-140/month

## References

- [AWS GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html)
- [AWS Config](https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html)
- [AWS Config Rules](https://docs.aws.amazon.com/config/latest/developerguide/managed-rules-by-aws-config.html)
- [npm audit](https://docs.npmjs.com/cli/v8/commands/npm-audit)
- [Snyk](https://docs.snyk.io/)
- [GitHub Dependabot](https://docs.github.com/en/code-security/dependabot)
