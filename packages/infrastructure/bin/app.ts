#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SatyaMoolStack } from '../lib/satyamool-stack';

const app = new cdk.App();

new SatyaMoolStack(app, 'SatyaMoolStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-south-1',
  },
  description: 'SatyaMool - AWS Serverless Property Verification Platform',
});

app.synth();
