import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { LambdaLayers } from '../lib/lambda-layers';
import { OptimizedLambda, createOptimizedApiLambda, createOptimizedProcessingLambda } from '../lib/optimized-lambda';
import * as path from 'path';

describe('Lambda Cold Start Optimization', () => {
  describe('LambdaLayers', () => {
    test('creates Node.js common layer', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      
      const layers = new LambdaLayers(stack, 'TestLayers');
      
      const template = Template.fromStack(stack);
      
      // Verify Node.js common layer is created
      template.hasResourceProperties('AWS::Lambda::LayerVersion', {
        LayerName: 'satyamool-nodejs-common',
        Description: 'Common Node.js dependencies for SatyaMool Lambda functions',
        CompatibleRuntimes: ['nodejs20.x'],
        CompatibleArchitectures: ['arm64'],
      });
    });

    test('creates Python common layer', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      
      const layers = new LambdaLayers(stack, 'TestLayers');
      
      const template = Template.fromStack(stack);
      
      // Verify Python common layer is created
      template.hasResourceProperties('AWS::Lambda::LayerVersion', {
        LayerName: 'satyamool-python-common',
        Description: 'Common Python dependencies for SatyaMool Lambda functions',
        CompatibleRuntimes: ['python3.12'],
        CompatibleArchitectures: ['arm64'],
      });
    });

    test('creates AWS SDK layer', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      
      const layers = new LambdaLayers(stack, 'TestLayers');
      
      const template = Template.fromStack(stack);
      
      // Verify AWS SDK layer is created
      template.hasResourceProperties('AWS::Lambda::LayerVersion', {
        LayerName: 'satyamool-aws-sdk',
        Description: 'AWS SDK v3 for SatyaMool Lambda functions',
        CompatibleRuntimes: ['nodejs20.x'],
        CompatibleArchitectures: ['arm64'],
      });
    });

    test('exports layer ARNs', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      
      const layers = new LambdaLayers(stack, 'TestLayers');
      
      const template = Template.fromStack(stack);
      
      // Verify outputs are created (check for any output containing the layer names)
      const outputs = template.toJSON().Outputs;
      const outputKeys = Object.keys(outputs || {});
      
      expect(outputKeys.some(key => key.includes('NodejsCommonLayerArn'))).toBe(true);
      expect(outputKeys.some(key => key.includes('PythonCommonLayerArn'))).toBe(true);
      expect(outputKeys.some(key => key.includes('AwsSdkLayerArn'))).toBe(true);
    });
  });

  describe('OptimizedLambda', () => {
    test('creates Lambda with ARM64 architecture', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const layers = new LambdaLayers(stack, 'TestLayers');
      
      const optimizedLambda = new OptimizedLambda(
        stack,
        'TestFunction',
        {
          functionName: 'test-function',
          runtime: lambda.Runtime.NODEJS_20_X,
          handler: 'index.handler',
          code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
        },
        layers
      );
      
      const template = Template.fromStack(stack);
      
      // Verify ARM64 architecture
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'test-function',
        Architectures: ['arm64'],
      });
    });

    test('enables X-Ray tracing', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const layers = new LambdaLayers(stack, 'TestLayers');
      
      const optimizedLambda = new OptimizedLambda(
        stack,
        'TestFunction',
        {
          functionName: 'test-function',
          runtime: lambda.Runtime.NODEJS_20_X,
          handler: 'index.handler',
          code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
        },
        layers
      );
      
      const template = Template.fromStack(stack);
      
      // Verify X-Ray tracing is enabled
      template.hasResourceProperties('AWS::Lambda::Function', {
        TracingConfig: {
          Mode: 'Active',
        },
      });
    });

    test('attaches Node.js layers for Node.js runtime', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const layers = new LambdaLayers(stack, 'TestLayers');
      
      const optimizedLambda = new OptimizedLambda(
        stack,
        'TestFunction',
        {
          functionName: 'test-function',
          runtime: lambda.Runtime.NODEJS_20_X,
          handler: 'index.handler',
          code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
        },
        layers
      );
      
      const template = Template.fromStack(stack);
      
      // Verify layers are attached (should have 2 layers: nodejs-common and aws-sdk)
      template.hasResourceProperties('AWS::Lambda::Function', {
        Layers: Match.arrayWith([
          Match.objectLike({ Ref: Match.stringLikeRegexp('TestLayersNodejsCommonLayer') }),
          Match.objectLike({ Ref: Match.stringLikeRegexp('TestLayersAwsSdkLayer') }),
        ]),
      });
    });

    test('attaches Python layers for Python runtime', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const layers = new LambdaLayers(stack, 'TestLayers');
      
      const optimizedLambda = new OptimizedLambda(
        stack,
        'TestFunction',
        {
          functionName: 'test-function',
          runtime: lambda.Runtime.PYTHON_3_12,
          handler: 'index.handler',
          code: lambda.Code.fromInline('def handler(event, context): return {"statusCode": 200}'),
        },
        layers
      );
      
      const template = Template.fromStack(stack);
      
      // Verify Python layer is attached
      template.hasResourceProperties('AWS::Lambda::Function', {
        Layers: Match.arrayWith([
          Match.objectLike({ Ref: Match.stringLikeRegexp('TestLayersPythonCommonLayer') }),
        ]),
      });
    });

    test('sets X-Ray tracing name in environment', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const layers = new LambdaLayers(stack, 'TestLayers');
      
      const optimizedLambda = new OptimizedLambda(
        stack,
        'TestFunction',
        {
          functionName: 'test-function',
          runtime: lambda.Runtime.NODEJS_20_X,
          handler: 'index.handler',
          code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
          environment: {
            CUSTOM_VAR: 'value',
          },
        },
        layers
      );
      
      const template = Template.fromStack(stack);
      
      // Verify X-Ray tracing name is set
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            AWS_XRAY_TRACING_NAME: 'test-function',
            CUSTOM_VAR: 'value',
          },
        },
      });
    });
  });

  describe('createOptimizedApiLambda', () => {
    test('creates Lambda with provisioned concurrency', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const layers = new LambdaLayers(stack, 'TestLayers');
      
      const apiLambda = createOptimizedApiLambda(
        stack,
        'ApiFunction',
        {
          functionName: 'api-function',
          runtime: lambda.Runtime.NODEJS_20_X,
          handler: 'index.handler',
          code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
        },
        layers
      );
      
      const template = Template.fromStack(stack);
      
      // Verify alias is created for provisioned concurrency
      template.hasResourceProperties('AWS::Lambda::Alias', {
        Name: 'live',
      });
      
      // Verify provisioned concurrency is configured
      template.hasResourceProperties('AWS::Lambda::Alias', {
        ProvisionedConcurrencyConfig: Match.objectLike({
          ProvisionedConcurrentExecutions: Match.anyValue(),
        }),
      });
    });

    test('sets default memory to 256MB for API functions', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const layers = new LambdaLayers(stack, 'TestLayers');
      
      const apiLambda = createOptimizedApiLambda(
        stack,
        'ApiFunction',
        {
          functionName: 'api-function',
          runtime: lambda.Runtime.NODEJS_20_X,
          handler: 'index.handler',
          code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
        },
        layers
      );
      
      const template = Template.fromStack(stack);
      
      // Verify memory size is 256MB
      template.hasResourceProperties('AWS::Lambda::Function', {
        MemorySize: 256,
      });
    });

    test('sets default timeout to 30 seconds for API functions', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const layers = new LambdaLayers(stack, 'TestLayers');
      
      const apiLambda = createOptimizedApiLambda(
        stack,
        'ApiFunction',
        {
          functionName: 'api-function',
          runtime: lambda.Runtime.NODEJS_20_X,
          handler: 'index.handler',
          code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
        },
        layers
      );
      
      const template = Template.fromStack(stack);
      
      // Verify timeout is 30 seconds
      template.hasResourceProperties('AWS::Lambda::Function', {
        Timeout: 30,
      });
    });
  });

  describe('createOptimizedProcessingLambda', () => {
    test('creates Lambda without provisioned concurrency', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const layers = new LambdaLayers(stack, 'TestLayers');
      
      const processingLambda = createOptimizedProcessingLambda(
        stack,
        'ProcessingFunction',
        {
          functionName: 'processing-function',
          runtime: lambda.Runtime.PYTHON_3_12,
          handler: 'index.handler',
          code: lambda.Code.fromInline('def handler(event, context): return {"statusCode": 200}'),
        },
        layers
      );
      
      const template = Template.fromStack(stack);
      
      // Verify no alias is created (no provisioned concurrency)
      template.resourceCountIs('AWS::Lambda::Alias', 0);
    });

    test('uses custom memory and timeout settings', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const layers = new LambdaLayers(stack, 'TestLayers');
      
      const processingLambda = createOptimizedProcessingLambda(
        stack,
        'ProcessingFunction',
        {
          functionName: 'processing-function',
          runtime: lambda.Runtime.PYTHON_3_12,
          handler: 'index.handler',
          code: lambda.Code.fromInline('def handler(event, context): return {"statusCode": 200}'),
          memorySize: 1024,
          timeout: cdk.Duration.minutes(5),
        },
        layers
      );
      
      const template = Template.fromStack(stack);
      
      // Verify custom memory and timeout
      template.hasResourceProperties('AWS::Lambda::Function', {
        MemorySize: 1024,
        Timeout: 300, // 5 minutes in seconds
      });
    });
  });

  describe('Integration Test', () => {
    test('complete stack with optimized Lambdas', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      
      // Create layers
      const layers = new LambdaLayers(stack, 'Layers');
      
      // Create API Lambda with provisioned concurrency
      const apiLambda = createOptimizedApiLambda(
        stack,
        'ApiFunction',
        {
          functionName: 'api-function',
          runtime: lambda.Runtime.NODEJS_20_X,
          handler: 'index.handler',
          code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
        },
        layers
      );
      
      // Create processing Lambda without provisioned concurrency
      const processingLambda = createOptimizedProcessingLambda(
        stack,
        'ProcessingFunction',
        {
          functionName: 'processing-function',
          runtime: lambda.Runtime.PYTHON_3_12,
          handler: 'index.handler',
          code: lambda.Code.fromInline('def handler(event, context): return {"statusCode": 200}'),
          memorySize: 512,
        },
        layers
      );
      
      const template = Template.fromStack(stack);
      
      // Verify 3 layers are created
      template.resourceCountIs('AWS::Lambda::LayerVersion', 3);
      
      // Verify 2 functions are created
      template.resourceCountIs('AWS::Lambda::Function', 2);
      
      // Verify 1 alias is created (only for API function)
      template.resourceCountIs('AWS::Lambda::Alias', 1);
      
      // Verify both functions use ARM64
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'api-function',
        Architectures: ['arm64'],
      });
      
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'processing-function',
        Architectures: ['arm64'],
      });
    });
  });
});
