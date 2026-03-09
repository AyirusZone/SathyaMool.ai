"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizedLambda = void 0;
exports.createOptimizedApiLambda = createOptimizedApiLambda;
exports.createOptimizedProcessingLambda = createOptimizedProcessingLambda;
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const constructs_1 = require("constructs");
const provisioned_concurrency_1 = require("./provisioned-concurrency");
/**
 * Optimized Lambda function with cold start optimizations
 *
 * Features:
 * - Lambda layers for shared dependencies
 * - Provisioned concurrency for critical functions
 * - ARM64 architecture (Graviton2)
 * - Right-sized memory allocation
 * - X-Ray tracing enabled
 */
class OptimizedLambda extends constructs_1.Construct {
    constructor(scope, id, props, layers) {
        super(scope, id);
        // Determine which layers to use based on runtime
        const lambdaLayers = [];
        if (props.useLayers !== false) {
            if (props.runtime.family === lambda.RuntimeFamily.NODEJS) {
                lambdaLayers.push(layers.nodejsCommonLayer);
                lambdaLayers.push(layers.awsSdkLayer);
            }
            else if (props.runtime.family === lambda.RuntimeFamily.PYTHON) {
                lambdaLayers.push(layers.pythonCommonLayer);
            }
        }
        // Add any additional layers
        if (props.additionalLayers) {
            lambdaLayers.push(...props.additionalLayers);
        }
        // Create the Lambda function with optimizations
        this.function = new lambda.Function(this, 'Function', {
            ...props,
            architecture: lambda.Architecture.ARM_64, // Graviton2 for better performance
            tracing: lambda.Tracing.ACTIVE, // Enable X-Ray tracing
            layers: lambdaLayers,
            // Ensure environment variables include X-Ray tracing name
            environment: {
                ...props.environment,
                AWS_XRAY_TRACING_NAME: props.functionName || id,
            },
        });
        // Add provisioned concurrency if enabled
        if (props.enableProvisionedConcurrency) {
            const config = (0, provisioned_concurrency_1.getProvisionedConcurrencyConfig)(props.functionName || id);
            new provisioned_concurrency_1.ProvisionedConcurrency(this, 'ProvisionedConcurrency', this.function, config);
        }
        // Output function details
        new cdk.CfnOutput(this, 'FunctionArn', {
            value: this.function.functionArn,
            description: `ARN of ${props.functionName || id}`,
        });
        new cdk.CfnOutput(this, 'OptimizationSummary', {
            value: JSON.stringify({
                function: props.functionName || id,
                architecture: 'ARM64',
                layers: lambdaLayers.length,
                provisionedConcurrency: props.enableProvisionedConcurrency || false,
                memorySize: props.memorySize || 128,
                timeout: props.timeout?.toSeconds() || 3,
            }),
            description: `Optimization summary for ${props.functionName || id}`,
        });
    }
}
exports.OptimizedLambda = OptimizedLambda;
/**
 * Helper function to create optimized API Lambda functions
 */
function createOptimizedApiLambda(scope, id, props, layers) {
    // API functions are critical and should have provisioned concurrency
    return new OptimizedLambda(scope, id, {
        ...props,
        enableProvisionedConcurrency: true,
        memorySize: props.memorySize || 256, // Default 256MB for API functions
        timeout: props.timeout || cdk.Duration.seconds(30), // Default 30s timeout
    }, layers);
}
/**
 * Helper function to create optimized processing Lambda functions
 */
function createOptimizedProcessingLambda(scope, id, props, layers) {
    // Processing functions don't need provisioned concurrency (async processing)
    return new OptimizedLambda(scope, id, {
        ...props,
        enableProvisionedConcurrency: false,
    }, layers);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3B0aW1pemVkLWxhbWJkYS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9vcHRpbWl6ZWQtbGFtYmRhLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQXlHQSw0REFhQztBQUtELDBFQVdDO0FBdElELG1DQUFtQztBQUNuQyxpREFBaUQ7QUFDakQsMkNBQXVDO0FBRXZDLHVFQUFvRztBQXdCcEc7Ozs7Ozs7OztHQVNHO0FBQ0gsTUFBYSxlQUFnQixTQUFRLHNCQUFTO0lBSTVDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBMkIsRUFBRSxNQUFvQjtRQUN6RixLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLGlEQUFpRDtRQUNqRCxNQUFNLFlBQVksR0FBMkIsRUFBRSxDQUFDO1FBRWhELElBQUksS0FBSyxDQUFDLFNBQVMsS0FBSyxLQUFLLEVBQUUsQ0FBQztZQUM5QixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxLQUFLLE1BQU0sQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ3pELFlBQVksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUM7Z0JBQzVDLFlBQVksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ3hDLENBQUM7aUJBQU0sSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sS0FBSyxNQUFNLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNoRSxZQUFZLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQzlDLENBQUM7UUFDSCxDQUFDO1FBRUQsNEJBQTRCO1FBQzVCLElBQUksS0FBSyxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDM0IsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQy9DLENBQUM7UUFFRCxnREFBZ0Q7UUFDaEQsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRTtZQUNwRCxHQUFHLEtBQUs7WUFDUixZQUFZLEVBQUUsTUFBTSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsbUNBQW1DO1lBQzdFLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSx1QkFBdUI7WUFDdkQsTUFBTSxFQUFFLFlBQVk7WUFDcEIsMERBQTBEO1lBQzFELFdBQVcsRUFBRTtnQkFDWCxHQUFHLEtBQUssQ0FBQyxXQUFXO2dCQUNwQixxQkFBcUIsRUFBRSxLQUFLLENBQUMsWUFBWSxJQUFJLEVBQUU7YUFDaEQ7U0FDRixDQUFDLENBQUM7UUFFSCx5Q0FBeUM7UUFDekMsSUFBSSxLQUFLLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztZQUN2QyxNQUFNLE1BQU0sR0FBRyxJQUFBLHlEQUErQixFQUFDLEtBQUssQ0FBQyxZQUFZLElBQUksRUFBRSxDQUFDLENBQUM7WUFFekUsSUFBSSxnREFBc0IsQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNwRixDQUFDO1FBRUQsMEJBQTBCO1FBQzFCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3JDLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVc7WUFDaEMsV0FBVyxFQUFFLFVBQVUsS0FBSyxDQUFDLFlBQVksSUFBSSxFQUFFLEVBQUU7U0FDbEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUM3QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDcEIsUUFBUSxFQUFFLEtBQUssQ0FBQyxZQUFZLElBQUksRUFBRTtnQkFDbEMsWUFBWSxFQUFFLE9BQU87Z0JBQ3JCLE1BQU0sRUFBRSxZQUFZLENBQUMsTUFBTTtnQkFDM0Isc0JBQXNCLEVBQUUsS0FBSyxDQUFDLDRCQUE0QixJQUFJLEtBQUs7Z0JBQ25FLFVBQVUsRUFBRSxLQUFLLENBQUMsVUFBVSxJQUFJLEdBQUc7Z0JBQ25DLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUM7YUFDekMsQ0FBQztZQUNGLFdBQVcsRUFBRSw0QkFBNEIsS0FBSyxDQUFDLFlBQVksSUFBSSxFQUFFLEVBQUU7U0FDcEUsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBOURELDBDQThEQztBQUVEOztHQUVHO0FBQ0gsU0FBZ0Isd0JBQXdCLENBQ3RDLEtBQWdCLEVBQ2hCLEVBQVUsRUFDVixLQUFpRSxFQUNqRSxNQUFvQjtJQUVwQixxRUFBcUU7SUFDckUsT0FBTyxJQUFJLGVBQWUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFO1FBQ3BDLEdBQUcsS0FBSztRQUNSLDRCQUE0QixFQUFFLElBQUk7UUFDbEMsVUFBVSxFQUFFLEtBQUssQ0FBQyxVQUFVLElBQUksR0FBRyxFQUFFLGtDQUFrQztRQUN2RSxPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU8sSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsRUFBRSxzQkFBc0I7S0FDM0UsRUFBRSxNQUFNLENBQUMsQ0FBQztBQUNiLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQWdCLCtCQUErQixDQUM3QyxLQUFnQixFQUNoQixFQUFVLEVBQ1YsS0FBaUUsRUFDakUsTUFBb0I7SUFFcEIsNkVBQTZFO0lBQzdFLE9BQU8sSUFBSSxlQUFlLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRTtRQUNwQyxHQUFHLEtBQUs7UUFDUiw0QkFBNEIsRUFBRSxLQUFLO0tBQ3BDLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDYixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0IHsgTGFtYmRhTGF5ZXJzIH0gZnJvbSAnLi9sYW1iZGEtbGF5ZXJzJztcclxuaW1wb3J0IHsgUHJvdmlzaW9uZWRDb25jdXJyZW5jeSwgZ2V0UHJvdmlzaW9uZWRDb25jdXJyZW5jeUNvbmZpZyB9IGZyb20gJy4vcHJvdmlzaW9uZWQtY29uY3VycmVuY3knO1xyXG5cclxuLyoqXHJcbiAqIENvbmZpZ3VyYXRpb24gZm9yIG9wdGltaXplZCBMYW1iZGEgZnVuY3Rpb25zXHJcbiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIE9wdGltaXplZExhbWJkYVByb3BzIGV4dGVuZHMgT21pdDxsYW1iZGEuRnVuY3Rpb25Qcm9wcywgJ2xheWVycyc+IHtcclxuICAvKipcclxuICAgKiBXaGV0aGVyIHRvIGVuYWJsZSBwcm92aXNpb25lZCBjb25jdXJyZW5jeSBmb3IgdGhpcyBmdW5jdGlvblxyXG4gICAqIERlZmF1bHQ6IGZhbHNlXHJcbiAgICovXHJcbiAgZW5hYmxlUHJvdmlzaW9uZWRDb25jdXJyZW5jeT86IGJvb2xlYW47XHJcblxyXG4gIC8qKlxyXG4gICAqIFdoZXRoZXIgdG8gdXNlIExhbWJkYSBsYXllcnMgZm9yIHNoYXJlZCBkZXBlbmRlbmNpZXNcclxuICAgKiBEZWZhdWx0OiB0cnVlXHJcbiAgICovXHJcbiAgdXNlTGF5ZXJzPzogYm9vbGVhbjtcclxuXHJcbiAgLyoqXHJcbiAgICogTGFtYmRhIGxheWVycyB0byBhdHRhY2ggKGluIGFkZGl0aW9uIHRvIGNvbW1vbiBsYXllcnMpXHJcbiAgICovXHJcbiAgYWRkaXRpb25hbExheWVycz86IGxhbWJkYS5JTGF5ZXJWZXJzaW9uW107XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPcHRpbWl6ZWQgTGFtYmRhIGZ1bmN0aW9uIHdpdGggY29sZCBzdGFydCBvcHRpbWl6YXRpb25zXHJcbiAqIFxyXG4gKiBGZWF0dXJlczpcclxuICogLSBMYW1iZGEgbGF5ZXJzIGZvciBzaGFyZWQgZGVwZW5kZW5jaWVzXHJcbiAqIC0gUHJvdmlzaW9uZWQgY29uY3VycmVuY3kgZm9yIGNyaXRpY2FsIGZ1bmN0aW9uc1xyXG4gKiAtIEFSTTY0IGFyY2hpdGVjdHVyZSAoR3Jhdml0b24yKVxyXG4gKiAtIFJpZ2h0LXNpemVkIG1lbW9yeSBhbGxvY2F0aW9uXHJcbiAqIC0gWC1SYXkgdHJhY2luZyBlbmFibGVkXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgT3B0aW1pemVkTGFtYmRhIGV4dGVuZHMgQ29uc3RydWN0IHtcclxuICBwdWJsaWMgcmVhZG9ubHkgZnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcclxuICBwdWJsaWMgcmVhZG9ubHkgYWxpYXM/OiBsYW1iZGEuQWxpYXM7XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBPcHRpbWl6ZWRMYW1iZGFQcm9wcywgbGF5ZXJzOiBMYW1iZGFMYXllcnMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCk7XHJcblxyXG4gICAgLy8gRGV0ZXJtaW5lIHdoaWNoIGxheWVycyB0byB1c2UgYmFzZWQgb24gcnVudGltZVxyXG4gICAgY29uc3QgbGFtYmRhTGF5ZXJzOiBsYW1iZGEuSUxheWVyVmVyc2lvbltdID0gW107XHJcbiAgICBcclxuICAgIGlmIChwcm9wcy51c2VMYXllcnMgIT09IGZhbHNlKSB7XHJcbiAgICAgIGlmIChwcm9wcy5ydW50aW1lLmZhbWlseSA9PT0gbGFtYmRhLlJ1bnRpbWVGYW1pbHkuTk9ERUpTKSB7XHJcbiAgICAgICAgbGFtYmRhTGF5ZXJzLnB1c2gobGF5ZXJzLm5vZGVqc0NvbW1vbkxheWVyKTtcclxuICAgICAgICBsYW1iZGFMYXllcnMucHVzaChsYXllcnMuYXdzU2RrTGF5ZXIpO1xyXG4gICAgICB9IGVsc2UgaWYgKHByb3BzLnJ1bnRpbWUuZmFtaWx5ID09PSBsYW1iZGEuUnVudGltZUZhbWlseS5QWVRIT04pIHtcclxuICAgICAgICBsYW1iZGFMYXllcnMucHVzaChsYXllcnMucHl0aG9uQ29tbW9uTGF5ZXIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQWRkIGFueSBhZGRpdGlvbmFsIGxheWVyc1xyXG4gICAgaWYgKHByb3BzLmFkZGl0aW9uYWxMYXllcnMpIHtcclxuICAgICAgbGFtYmRhTGF5ZXJzLnB1c2goLi4ucHJvcHMuYWRkaXRpb25hbExheWVycyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ3JlYXRlIHRoZSBMYW1iZGEgZnVuY3Rpb24gd2l0aCBvcHRpbWl6YXRpb25zXHJcbiAgICB0aGlzLmZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRnVuY3Rpb24nLCB7XHJcbiAgICAgIC4uLnByb3BzLFxyXG4gICAgICBhcmNoaXRlY3R1cmU6IGxhbWJkYS5BcmNoaXRlY3R1cmUuQVJNXzY0LCAvLyBHcmF2aXRvbjIgZm9yIGJldHRlciBwZXJmb3JtYW5jZVxyXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsIC8vIEVuYWJsZSBYLVJheSB0cmFjaW5nXHJcbiAgICAgIGxheWVyczogbGFtYmRhTGF5ZXJzLFxyXG4gICAgICAvLyBFbnN1cmUgZW52aXJvbm1lbnQgdmFyaWFibGVzIGluY2x1ZGUgWC1SYXkgdHJhY2luZyBuYW1lXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgLi4ucHJvcHMuZW52aXJvbm1lbnQsXHJcbiAgICAgICAgQVdTX1hSQVlfVFJBQ0lOR19OQU1FOiBwcm9wcy5mdW5jdGlvbk5hbWUgfHwgaWQsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBZGQgcHJvdmlzaW9uZWQgY29uY3VycmVuY3kgaWYgZW5hYmxlZFxyXG4gICAgaWYgKHByb3BzLmVuYWJsZVByb3Zpc2lvbmVkQ29uY3VycmVuY3kpIHtcclxuICAgICAgY29uc3QgY29uZmlnID0gZ2V0UHJvdmlzaW9uZWRDb25jdXJyZW5jeUNvbmZpZyhwcm9wcy5mdW5jdGlvbk5hbWUgfHwgaWQpO1xyXG4gICAgICBcclxuICAgICAgbmV3IFByb3Zpc2lvbmVkQ29uY3VycmVuY3kodGhpcywgJ1Byb3Zpc2lvbmVkQ29uY3VycmVuY3knLCB0aGlzLmZ1bmN0aW9uLCBjb25maWcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIE91dHB1dCBmdW5jdGlvbiBkZXRhaWxzXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRnVuY3Rpb25Bcm4nLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLmZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxyXG4gICAgICBkZXNjcmlwdGlvbjogYEFSTiBvZiAke3Byb3BzLmZ1bmN0aW9uTmFtZSB8fCBpZH1gLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ09wdGltaXphdGlvblN1bW1hcnknLCB7XHJcbiAgICAgIHZhbHVlOiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgZnVuY3Rpb246IHByb3BzLmZ1bmN0aW9uTmFtZSB8fCBpZCxcclxuICAgICAgICBhcmNoaXRlY3R1cmU6ICdBUk02NCcsXHJcbiAgICAgICAgbGF5ZXJzOiBsYW1iZGFMYXllcnMubGVuZ3RoLFxyXG4gICAgICAgIHByb3Zpc2lvbmVkQ29uY3VycmVuY3k6IHByb3BzLmVuYWJsZVByb3Zpc2lvbmVkQ29uY3VycmVuY3kgfHwgZmFsc2UsXHJcbiAgICAgICAgbWVtb3J5U2l6ZTogcHJvcHMubWVtb3J5U2l6ZSB8fCAxMjgsXHJcbiAgICAgICAgdGltZW91dDogcHJvcHMudGltZW91dD8udG9TZWNvbmRzKCkgfHwgMyxcclxuICAgICAgfSksXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBgT3B0aW1pemF0aW9uIHN1bW1hcnkgZm9yICR7cHJvcHMuZnVuY3Rpb25OYW1lIHx8IGlkfWAsXHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBIZWxwZXIgZnVuY3Rpb24gdG8gY3JlYXRlIG9wdGltaXplZCBBUEkgTGFtYmRhIGZ1bmN0aW9uc1xyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU9wdGltaXplZEFwaUxhbWJkYShcclxuICBzY29wZTogQ29uc3RydWN0LFxyXG4gIGlkOiBzdHJpbmcsXHJcbiAgcHJvcHM6IE9taXQ8T3B0aW1pemVkTGFtYmRhUHJvcHMsICdlbmFibGVQcm92aXNpb25lZENvbmN1cnJlbmN5Jz4sXHJcbiAgbGF5ZXJzOiBMYW1iZGFMYXllcnNcclxuKTogT3B0aW1pemVkTGFtYmRhIHtcclxuICAvLyBBUEkgZnVuY3Rpb25zIGFyZSBjcml0aWNhbCBhbmQgc2hvdWxkIGhhdmUgcHJvdmlzaW9uZWQgY29uY3VycmVuY3lcclxuICByZXR1cm4gbmV3IE9wdGltaXplZExhbWJkYShzY29wZSwgaWQsIHtcclxuICAgIC4uLnByb3BzLFxyXG4gICAgZW5hYmxlUHJvdmlzaW9uZWRDb25jdXJyZW5jeTogdHJ1ZSxcclxuICAgIG1lbW9yeVNpemU6IHByb3BzLm1lbW9yeVNpemUgfHwgMjU2LCAvLyBEZWZhdWx0IDI1Nk1CIGZvciBBUEkgZnVuY3Rpb25zXHJcbiAgICB0aW1lb3V0OiBwcm9wcy50aW1lb3V0IHx8IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSwgLy8gRGVmYXVsdCAzMHMgdGltZW91dFxyXG4gIH0sIGxheWVycyk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBIZWxwZXIgZnVuY3Rpb24gdG8gY3JlYXRlIG9wdGltaXplZCBwcm9jZXNzaW5nIExhbWJkYSBmdW5jdGlvbnNcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVPcHRpbWl6ZWRQcm9jZXNzaW5nTGFtYmRhKFxyXG4gIHNjb3BlOiBDb25zdHJ1Y3QsXHJcbiAgaWQ6IHN0cmluZyxcclxuICBwcm9wczogT21pdDxPcHRpbWl6ZWRMYW1iZGFQcm9wcywgJ2VuYWJsZVByb3Zpc2lvbmVkQ29uY3VycmVuY3knPixcclxuICBsYXllcnM6IExhbWJkYUxheWVyc1xyXG4pOiBPcHRpbWl6ZWRMYW1iZGEge1xyXG4gIC8vIFByb2Nlc3NpbmcgZnVuY3Rpb25zIGRvbid0IG5lZWQgcHJvdmlzaW9uZWQgY29uY3VycmVuY3kgKGFzeW5jIHByb2Nlc3NpbmcpXHJcbiAgcmV0dXJuIG5ldyBPcHRpbWl6ZWRMYW1iZGEoc2NvcGUsIGlkLCB7XHJcbiAgICAuLi5wcm9wcyxcclxuICAgIGVuYWJsZVByb3Zpc2lvbmVkQ29uY3VycmVuY3k6IGZhbHNlLFxyXG4gIH0sIGxheWVycyk7XHJcbn1cclxuIl19