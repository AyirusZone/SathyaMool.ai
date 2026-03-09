#!/bin/bash
echo "=== CHECKING DEPLOYED AWS RESOURCES ==="
echo ""

echo "1. CloudFormation Stacks:"
aws cloudformation list-stacks --region ap-south-1 --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query 'StackSummaries[?contains(StackName, `SatyaMool`)].{Name:StackName,Status:StackStatus,Created:CreationTime}' --output table 2>/dev/null || echo "Error checking stacks"
echo ""

echo "2. S3 Buckets:"
aws s3api list-buckets --query 'Buckets[?contains(Name, `satyamool`)].{Name:Name,Created:CreationDate}' --output table 2>/dev/null || echo "Error checking S3"
echo ""

echo "3. DynamoDB Tables:"
aws dynamodb list-tables --region ap-south-1 --output json 2>/dev/null | jq -r '.TableNames[] | select(contains("SatyaMool"))' || echo "Error checking DynamoDB"
echo ""

echo "4. Lambda Functions:"
aws lambda list-functions --region ap-south-1 --query 'Functions[?contains(FunctionName, `SatyaMool`)].{Name:FunctionName,Runtime:Runtime,Modified:LastModified}' --output table 2>/dev/null || echo "Error checking Lambda"
echo ""

echo "5. Lambda Layers:"
aws lambda list-layers --region ap-south-1 --query 'Layers[?contains(LayerName, `satyamool`)].{Name:LayerName,LatestVersion:LatestMatchingVersion.Version}' --output table 2>/dev/null || echo "Error checking Lambda Layers"
echo ""

echo "6. SQS Queues:"
aws sqs list-queues --region ap-south-1 --queue-name-prefix satyamool 2>/dev/null | jq -r '.QueueUrls[]?' || echo "No SQS queues found"
echo ""

echo "7. SNS Topics:"
aws sns list-topics --region ap-south-1 --output json 2>/dev/null | jq -r '.Topics[].TopicArn | select(contains("SatyaMool"))' || echo "No SNS topics found"
echo ""

echo "8. KMS Keys:"
aws kms list-aliases --region ap-south-1 --query 'Aliases[?contains(AliasName, `satyamool`)].{Alias:AliasName,KeyId:TargetKeyId}' --output table 2>/dev/null || echo "Error checking KMS"
echo ""

echo "9. EventBridge Rules:"
aws events list-rules --region ap-south-1 --name-prefix SatyaMool --query 'Rules[].{Name:Name,State:State,Schedule:ScheduleExpression}' --output table 2>/dev/null || echo "Error checking EventBridge"
echo ""

echo "10. Amplify Apps:"
aws amplify list-apps --region ap-south-1 --query 'apps[].{Name:name,AppId:appId,DefaultDomain:defaultDomain}' --output table 2>/dev/null || echo "No Amplify apps found"
echo ""

echo "=== RESOURCE CHECK COMPLETE ==="
