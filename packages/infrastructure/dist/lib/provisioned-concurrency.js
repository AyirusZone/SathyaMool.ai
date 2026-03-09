"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProvisionedConcurrency = void 0;
exports.shouldProvisionConcurrency = shouldProvisionConcurrency;
exports.getProvisionedConcurrencyConfig = getProvisionedConcurrencyConfig;
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const applicationautoscaling = require("aws-cdk-lib/aws-applicationautoscaling");
const constructs_1 = require("constructs");
/**
 * Adds provisioned concurrency to a Lambda function with auto-scaling
 */
class ProvisionedConcurrency extends constructs_1.Construct {
    constructor(scope, id, lambdaFunction, config) {
        super(scope, id);
        // Create alias for the Lambda function
        // Provisioned concurrency requires an alias or version
        const alias = new lambda.Alias(this, 'Alias', {
            aliasName: 'live',
            version: lambdaFunction.currentVersion,
            provisionedConcurrentExecutions: config.minCapacity,
        });
        // Create auto-scaling target
        const target = new applicationautoscaling.ScalableTarget(this, 'ScalableTarget', {
            serviceNamespace: applicationautoscaling.ServiceNamespace.LAMBDA,
            maxCapacity: config.maxCapacity,
            minCapacity: config.minCapacity,
            resourceId: `function:${lambdaFunction.functionName}:${alias.aliasName}`,
            scalableDimension: 'lambda:function:ProvisionedConcurrentExecutions',
        });
        // Add target tracking scaling policy
        target.scaleToTrackMetric('ProvisionedConcurrencyUtilization', {
            targetValue: config.targetUtilization || 0.70,
            predefinedMetric: applicationautoscaling.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
            scaleInCooldown: cdk.Duration.minutes(3),
            scaleOutCooldown: cdk.Duration.minutes(1),
        });
        // Output alias ARN
        new cdk.CfnOutput(this, 'AliasArn', {
            value: alias.functionArn,
            description: `Alias ARN for ${lambdaFunction.functionName} with provisioned concurrency`,
        });
        // Output provisioned concurrency configuration
        new cdk.CfnOutput(this, 'ProvisionedConcurrencyConfig', {
            value: JSON.stringify({
                function: lambdaFunction.functionName,
                minCapacity: config.minCapacity,
                maxCapacity: config.maxCapacity,
                targetUtilization: config.targetUtilization || 0.70,
            }),
            description: `Provisioned concurrency configuration for ${lambdaFunction.functionName}`,
        });
    }
}
exports.ProvisionedConcurrency = ProvisionedConcurrency;
/**
 * Helper function to determine if a function should have provisioned concurrency
 * Based on function criticality and expected traffic patterns
 */
function shouldProvisionConcurrency(functionName) {
    // Critical API functions that benefit from provisioned concurrency
    const criticalFunctions = [
        'auth-login',
        'auth-register',
        'auth-verify-otp',
        'properties-list',
        'properties-get',
        'properties-create',
        'upload-url-generator',
    ];
    return criticalFunctions.some(name => functionName.toLowerCase().includes(name));
}
/**
 * Get recommended provisioned concurrency configuration based on function type
 */
function getProvisionedConcurrencyConfig(functionName) {
    // Authentication functions: High traffic, need fast response
    if (functionName.includes('auth')) {
        return {
            minCapacity: 5,
            maxCapacity: 50,
            targetUtilization: 0.70,
        };
    }
    // Property management functions: Medium traffic
    if (functionName.includes('properties')) {
        return {
            minCapacity: 3,
            maxCapacity: 30,
            targetUtilization: 0.70,
        };
    }
    // Default configuration for other critical functions
    return {
        minCapacity: 2,
        maxCapacity: 20,
        targetUtilization: 0.70,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvdmlzaW9uZWQtY29uY3VycmVuY3kuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvcHJvdmlzaW9uZWQtY29uY3VycmVuY3kudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBdUZBLGdFQWFDO0FBS0QsMEVBeUJDO0FBbElELG1DQUFtQztBQUNuQyxpREFBaUQ7QUFDakQsaUZBQWlGO0FBQ2pGLDJDQUF1QztBQXdCdkM7O0dBRUc7QUFDSCxNQUFhLHNCQUF1QixTQUFRLHNCQUFTO0lBQ25ELFlBQ0UsS0FBZ0IsRUFDaEIsRUFBVSxFQUNWLGNBQStCLEVBQy9CLE1BQW9DO1FBRXBDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsdUNBQXVDO1FBQ3ZDLHVEQUF1RDtRQUN2RCxNQUFNLEtBQUssR0FBRyxJQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRTtZQUM1QyxTQUFTLEVBQUUsTUFBTTtZQUNqQixPQUFPLEVBQUUsY0FBYyxDQUFDLGNBQWM7WUFDdEMsK0JBQStCLEVBQUUsTUFBTSxDQUFDLFdBQVc7U0FDcEQsQ0FBQyxDQUFDO1FBRUgsNkJBQTZCO1FBQzdCLE1BQU0sTUFBTSxHQUFHLElBQUksc0JBQXNCLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUMvRSxnQkFBZ0IsRUFBRSxzQkFBc0IsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNO1lBQ2hFLFdBQVcsRUFBRSxNQUFNLENBQUMsV0FBVztZQUMvQixXQUFXLEVBQUUsTUFBTSxDQUFDLFdBQVc7WUFDL0IsVUFBVSxFQUFFLFlBQVksY0FBYyxDQUFDLFlBQVksSUFBSSxLQUFLLENBQUMsU0FBUyxFQUFFO1lBQ3hFLGlCQUFpQixFQUFFLGlEQUFpRDtTQUNyRSxDQUFDLENBQUM7UUFFSCxxQ0FBcUM7UUFDckMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLG1DQUFtQyxFQUFFO1lBQzdELFdBQVcsRUFBRSxNQUFNLENBQUMsaUJBQWlCLElBQUksSUFBSTtZQUM3QyxnQkFBZ0IsRUFBRSxzQkFBc0IsQ0FBQyxnQkFBZ0IsQ0FBQywwQ0FBMEM7WUFDcEcsZUFBZSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUN4QyxnQkFBZ0IsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7U0FDMUMsQ0FBQyxDQUFDO1FBRUgsbUJBQW1CO1FBQ25CLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ2xDLEtBQUssRUFBRSxLQUFLLENBQUMsV0FBVztZQUN4QixXQUFXLEVBQUUsaUJBQWlCLGNBQWMsQ0FBQyxZQUFZLCtCQUErQjtTQUN6RixDQUFDLENBQUM7UUFFSCwrQ0FBK0M7UUFDL0MsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSw4QkFBOEIsRUFBRTtZQUN0RCxLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDcEIsUUFBUSxFQUFFLGNBQWMsQ0FBQyxZQUFZO2dCQUNyQyxXQUFXLEVBQUUsTUFBTSxDQUFDLFdBQVc7Z0JBQy9CLFdBQVcsRUFBRSxNQUFNLENBQUMsV0FBVztnQkFDL0IsaUJBQWlCLEVBQUUsTUFBTSxDQUFDLGlCQUFpQixJQUFJLElBQUk7YUFDcEQsQ0FBQztZQUNGLFdBQVcsRUFBRSw2Q0FBNkMsY0FBYyxDQUFDLFlBQVksRUFBRTtTQUN4RixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFuREQsd0RBbURDO0FBRUQ7OztHQUdHO0FBQ0gsU0FBZ0IsMEJBQTBCLENBQUMsWUFBb0I7SUFDN0QsbUVBQW1FO0lBQ25FLE1BQU0saUJBQWlCLEdBQUc7UUFDeEIsWUFBWTtRQUNaLGVBQWU7UUFDZixpQkFBaUI7UUFDakIsaUJBQWlCO1FBQ2pCLGdCQUFnQjtRQUNoQixtQkFBbUI7UUFDbkIsc0JBQXNCO0tBQ3ZCLENBQUM7SUFFRixPQUFPLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUNuRixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFnQiwrQkFBK0IsQ0FBQyxZQUFvQjtJQUNsRSw2REFBNkQ7SUFDN0QsSUFBSSxZQUFZLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7UUFDbEMsT0FBTztZQUNMLFdBQVcsRUFBRSxDQUFDO1lBQ2QsV0FBVyxFQUFFLEVBQUU7WUFDZixpQkFBaUIsRUFBRSxJQUFJO1NBQ3hCLENBQUM7SUFDSixDQUFDO0lBRUQsZ0RBQWdEO0lBQ2hELElBQUksWUFBWSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO1FBQ3hDLE9BQU87WUFDTCxXQUFXLEVBQUUsQ0FBQztZQUNkLFdBQVcsRUFBRSxFQUFFO1lBQ2YsaUJBQWlCLEVBQUUsSUFBSTtTQUN4QixDQUFDO0lBQ0osQ0FBQztJQUVELHFEQUFxRDtJQUNyRCxPQUFPO1FBQ0wsV0FBVyxFQUFFLENBQUM7UUFDZCxXQUFXLEVBQUUsRUFBRTtRQUNmLGlCQUFpQixFQUFFLElBQUk7S0FDeEIsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XHJcbmltcG9ydCAqIGFzIGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwcGxpY2F0aW9uYXV0b3NjYWxpbmcnO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuXHJcbi8qKlxyXG4gKiBDb25maWd1cmF0aW9uIGZvciBMYW1iZGEgcHJvdmlzaW9uZWQgY29uY3VycmVuY3lcclxuICogUmVkdWNlcyBjb2xkIHN0YXJ0cyBmb3IgY3JpdGljYWwgQVBJIGZ1bmN0aW9uc1xyXG4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBQcm92aXNpb25lZENvbmN1cnJlbmN5Q29uZmlnIHtcclxuICAvKipcclxuICAgKiBNaW5pbXVtIHByb3Zpc2lvbmVkIGNvbmN1cnJlbmN5IChhbHdheXMgd2FybSlcclxuICAgKi9cclxuICBtaW5DYXBhY2l0eTogbnVtYmVyO1xyXG5cclxuICAvKipcclxuICAgKiBNYXhpbXVtIHByb3Zpc2lvbmVkIGNvbmN1cnJlbmN5IChzY2FsZSB1cCB0bylcclxuICAgKi9cclxuICBtYXhDYXBhY2l0eTogbnVtYmVyO1xyXG5cclxuICAvKipcclxuICAgKiBUYXJnZXQgdXRpbGl6YXRpb24gcGVyY2VudGFnZSBmb3IgYXV0by1zY2FsaW5nXHJcbiAgICogRGVmYXVsdDogMC43MCAoNzAlKVxyXG4gICAqL1xyXG4gIHRhcmdldFV0aWxpemF0aW9uPzogbnVtYmVyO1xyXG59XHJcblxyXG4vKipcclxuICogQWRkcyBwcm92aXNpb25lZCBjb25jdXJyZW5jeSB0byBhIExhbWJkYSBmdW5jdGlvbiB3aXRoIGF1dG8tc2NhbGluZ1xyXG4gKi9cclxuZXhwb3J0IGNsYXNzIFByb3Zpc2lvbmVkQ29uY3VycmVuY3kgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xyXG4gIGNvbnN0cnVjdG9yKFxyXG4gICAgc2NvcGU6IENvbnN0cnVjdCxcclxuICAgIGlkOiBzdHJpbmcsXHJcbiAgICBsYW1iZGFGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uLFxyXG4gICAgY29uZmlnOiBQcm92aXNpb25lZENvbmN1cnJlbmN5Q29uZmlnXHJcbiAgKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQpO1xyXG5cclxuICAgIC8vIENyZWF0ZSBhbGlhcyBmb3IgdGhlIExhbWJkYSBmdW5jdGlvblxyXG4gICAgLy8gUHJvdmlzaW9uZWQgY29uY3VycmVuY3kgcmVxdWlyZXMgYW4gYWxpYXMgb3IgdmVyc2lvblxyXG4gICAgY29uc3QgYWxpYXMgPSBuZXcgbGFtYmRhLkFsaWFzKHRoaXMsICdBbGlhcycsIHtcclxuICAgICAgYWxpYXNOYW1lOiAnbGl2ZScsXHJcbiAgICAgIHZlcnNpb246IGxhbWJkYUZ1bmN0aW9uLmN1cnJlbnRWZXJzaW9uLFxyXG4gICAgICBwcm92aXNpb25lZENvbmN1cnJlbnRFeGVjdXRpb25zOiBjb25maWcubWluQ2FwYWNpdHksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgYXV0by1zY2FsaW5nIHRhcmdldFxyXG4gICAgY29uc3QgdGFyZ2V0ID0gbmV3IGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcuU2NhbGFibGVUYXJnZXQodGhpcywgJ1NjYWxhYmxlVGFyZ2V0Jywge1xyXG4gICAgICBzZXJ2aWNlTmFtZXNwYWNlOiBhcHBsaWNhdGlvbmF1dG9zY2FsaW5nLlNlcnZpY2VOYW1lc3BhY2UuTEFNQkRBLFxyXG4gICAgICBtYXhDYXBhY2l0eTogY29uZmlnLm1heENhcGFjaXR5LFxyXG4gICAgICBtaW5DYXBhY2l0eTogY29uZmlnLm1pbkNhcGFjaXR5LFxyXG4gICAgICByZXNvdXJjZUlkOiBgZnVuY3Rpb246JHtsYW1iZGFGdW5jdGlvbi5mdW5jdGlvbk5hbWV9OiR7YWxpYXMuYWxpYXNOYW1lfWAsXHJcbiAgICAgIHNjYWxhYmxlRGltZW5zaW9uOiAnbGFtYmRhOmZ1bmN0aW9uOlByb3Zpc2lvbmVkQ29uY3VycmVudEV4ZWN1dGlvbnMnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkIHRhcmdldCB0cmFja2luZyBzY2FsaW5nIHBvbGljeVxyXG4gICAgdGFyZ2V0LnNjYWxlVG9UcmFja01ldHJpYygnUHJvdmlzaW9uZWRDb25jdXJyZW5jeVV0aWxpemF0aW9uJywge1xyXG4gICAgICB0YXJnZXRWYWx1ZTogY29uZmlnLnRhcmdldFV0aWxpemF0aW9uIHx8IDAuNzAsXHJcbiAgICAgIHByZWRlZmluZWRNZXRyaWM6IGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcuUHJlZGVmaW5lZE1ldHJpYy5MQU1CREFfUFJPVklTSU9ORURfQ09OQ1VSUkVOQ1lfVVRJTElaQVRJT04sXHJcbiAgICAgIHNjYWxlSW5Db29sZG93bjogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMyksXHJcbiAgICAgIHNjYWxlT3V0Q29vbGRvd246IGNkay5EdXJhdGlvbi5taW51dGVzKDEpLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gT3V0cHV0IGFsaWFzIEFSTlxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FsaWFzQXJuJywge1xyXG4gICAgICB2YWx1ZTogYWxpYXMuZnVuY3Rpb25Bcm4sXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBgQWxpYXMgQVJOIGZvciAke2xhbWJkYUZ1bmN0aW9uLmZ1bmN0aW9uTmFtZX0gd2l0aCBwcm92aXNpb25lZCBjb25jdXJyZW5jeWAsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBPdXRwdXQgcHJvdmlzaW9uZWQgY29uY3VycmVuY3kgY29uZmlndXJhdGlvblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb3Zpc2lvbmVkQ29uY3VycmVuY3lDb25maWcnLCB7XHJcbiAgICAgIHZhbHVlOiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgZnVuY3Rpb246IGxhbWJkYUZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSxcclxuICAgICAgICBtaW5DYXBhY2l0eTogY29uZmlnLm1pbkNhcGFjaXR5LFxyXG4gICAgICAgIG1heENhcGFjaXR5OiBjb25maWcubWF4Q2FwYWNpdHksXHJcbiAgICAgICAgdGFyZ2V0VXRpbGl6YXRpb246IGNvbmZpZy50YXJnZXRVdGlsaXphdGlvbiB8fCAwLjcwLFxyXG4gICAgICB9KSxcclxuICAgICAgZGVzY3JpcHRpb246IGBQcm92aXNpb25lZCBjb25jdXJyZW5jeSBjb25maWd1cmF0aW9uIGZvciAke2xhbWJkYUZ1bmN0aW9uLmZ1bmN0aW9uTmFtZX1gLFxyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogSGVscGVyIGZ1bmN0aW9uIHRvIGRldGVybWluZSBpZiBhIGZ1bmN0aW9uIHNob3VsZCBoYXZlIHByb3Zpc2lvbmVkIGNvbmN1cnJlbmN5XHJcbiAqIEJhc2VkIG9uIGZ1bmN0aW9uIGNyaXRpY2FsaXR5IGFuZCBleHBlY3RlZCB0cmFmZmljIHBhdHRlcm5zXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkUHJvdmlzaW9uQ29uY3VycmVuY3koZnVuY3Rpb25OYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAvLyBDcml0aWNhbCBBUEkgZnVuY3Rpb25zIHRoYXQgYmVuZWZpdCBmcm9tIHByb3Zpc2lvbmVkIGNvbmN1cnJlbmN5XHJcbiAgY29uc3QgY3JpdGljYWxGdW5jdGlvbnMgPSBbXHJcbiAgICAnYXV0aC1sb2dpbicsXHJcbiAgICAnYXV0aC1yZWdpc3RlcicsXHJcbiAgICAnYXV0aC12ZXJpZnktb3RwJyxcclxuICAgICdwcm9wZXJ0aWVzLWxpc3QnLFxyXG4gICAgJ3Byb3BlcnRpZXMtZ2V0JyxcclxuICAgICdwcm9wZXJ0aWVzLWNyZWF0ZScsXHJcbiAgICAndXBsb2FkLXVybC1nZW5lcmF0b3InLFxyXG4gIF07XHJcblxyXG4gIHJldHVybiBjcml0aWNhbEZ1bmN0aW9ucy5zb21lKG5hbWUgPT4gZnVuY3Rpb25OYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMobmFtZSkpO1xyXG59XHJcblxyXG4vKipcclxuICogR2V0IHJlY29tbWVuZGVkIHByb3Zpc2lvbmVkIGNvbmN1cnJlbmN5IGNvbmZpZ3VyYXRpb24gYmFzZWQgb24gZnVuY3Rpb24gdHlwZVxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGdldFByb3Zpc2lvbmVkQ29uY3VycmVuY3lDb25maWcoZnVuY3Rpb25OYW1lOiBzdHJpbmcpOiBQcm92aXNpb25lZENvbmN1cnJlbmN5Q29uZmlnIHtcclxuICAvLyBBdXRoZW50aWNhdGlvbiBmdW5jdGlvbnM6IEhpZ2ggdHJhZmZpYywgbmVlZCBmYXN0IHJlc3BvbnNlXHJcbiAgaWYgKGZ1bmN0aW9uTmFtZS5pbmNsdWRlcygnYXV0aCcpKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBtaW5DYXBhY2l0eTogNSxcclxuICAgICAgbWF4Q2FwYWNpdHk6IDUwLFxyXG4gICAgICB0YXJnZXRVdGlsaXphdGlvbjogMC43MCxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICAvLyBQcm9wZXJ0eSBtYW5hZ2VtZW50IGZ1bmN0aW9uczogTWVkaXVtIHRyYWZmaWNcclxuICBpZiAoZnVuY3Rpb25OYW1lLmluY2x1ZGVzKCdwcm9wZXJ0aWVzJykpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIG1pbkNhcGFjaXR5OiAzLFxyXG4gICAgICBtYXhDYXBhY2l0eTogMzAsXHJcbiAgICAgIHRhcmdldFV0aWxpemF0aW9uOiAwLjcwLFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8vIERlZmF1bHQgY29uZmlndXJhdGlvbiBmb3Igb3RoZXIgY3JpdGljYWwgZnVuY3Rpb25zXHJcbiAgcmV0dXJuIHtcclxuICAgIG1pbkNhcGFjaXR5OiAyLFxyXG4gICAgbWF4Q2FwYWNpdHk6IDIwLFxyXG4gICAgdGFyZ2V0VXRpbGl6YXRpb246IDAuNzAsXHJcbiAgfTtcclxufVxyXG4iXX0=