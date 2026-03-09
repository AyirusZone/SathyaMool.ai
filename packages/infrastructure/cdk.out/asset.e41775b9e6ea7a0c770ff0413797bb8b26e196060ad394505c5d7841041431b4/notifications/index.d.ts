import { DynamoDBStreamEvent } from 'aws-lambda';
/**
 * Main Lambda handler for processing DynamoDB Stream events
 * Triggered by changes to Properties and Documents tables
 */
export declare const handler: (event: DynamoDBStreamEvent) => Promise<void>;
