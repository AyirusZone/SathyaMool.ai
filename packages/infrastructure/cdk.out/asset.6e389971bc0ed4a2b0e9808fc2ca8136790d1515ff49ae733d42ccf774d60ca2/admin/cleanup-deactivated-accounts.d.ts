import { ScheduledEvent } from 'aws-lambda';
/**
 * Lambda handler for scheduled cleanup of deactivated accounts
 * Runs daily to delete user data 30 days after deactivation
 * Preserves audit logs for compliance
 */
export declare const handler: (event: ScheduledEvent) => Promise<void>;
