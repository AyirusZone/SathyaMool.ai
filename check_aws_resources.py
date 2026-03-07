#!/usr/bin/env python3
import boto3
import json
from datetime import datetime

def json_serial(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")

region = 'ap-south-1'

print("=" * 60)
print("CHECKING DEPLOYED AWS RESOURCES")
print("=" * 60)
print()

# 1. CloudFormation Stacks
print("1. CloudFormation Stacks:")
print("-" * 60)
try:
    cf = boto3.client('cloudformation', region_name=region)
    stacks = cf.list_stacks(StackStatusFilter=['CREATE_COMPLETE', 'UPDATE_COMPLETE'])
    satyamool_stacks = [s for s in stacks['StackSummaries'] if 'SatyaMool' in s['StackName']]
    if satyamool_stacks:
        for stack in satyamool_stacks:
            print(f"  Name: {stack['StackName']}")
            print(f"  Status: {stack['StackStatus']}")
            print(f"  Created: {stack['CreationTime']}")
            print()
    else:
        print("  No SatyaMool stacks found")
except Exception as e:
    print(f"  Error: {e}")
print()

# 2. S3 Buckets
print("2. S3 Buckets:")
print("-" * 60)
try:
    s3 = boto3.client('s3')
    buckets = s3.list_buckets()
    satyamool_buckets = [b for b in buckets['Buckets'] if 'satyamool' in b['Name'].lower()]
    if satyamool_buckets:
        for bucket in satyamool_buckets:
            print(f"  Name: {bucket['Name']}")
            print(f"  Created: {bucket['CreationDate']}")
            print()
    else:
        print("  No satyamool buckets found")
except Exception as e:
    print(f"  Error: {e}")
print()

# 3. DynamoDB Tables
print("3. DynamoDB Tables:")
print("-" * 60)
try:
    dynamodb = boto3.client('dynamodb', region_name=region)
    tables = dynamodb.list_tables()
    satyamool_tables = [t for t in tables['TableNames'] if 'SatyaMool' in t]
    if satyamool_tables:
        for table in satyamool_tables:
            print(f"  - {table}")
    else:
        print("  No SatyaMool tables found")
except Exception as e:
    print(f"  Error: {e}")
print()

# 4. Lambda Functions
print("4. Lambda Functions:")
print("-" * 60)
try:
    lambda_client = boto3.client('lambda', region_name=region)
    functions = lambda_client.list_functions()
    satyamool_functions = [f for f in functions['Functions'] if 'SatyaMool' in f['FunctionName']]
    if satyamool_functions:
        for func in satyamool_functions:
            print(f"  Name: {func['FunctionName']}")
            print(f"  Runtime: {func['Runtime']}")
            print(f"  Modified: {func['LastModified']}")
            print()
    else:
        print("  No SatyaMool functions found")
except Exception as e:
    print(f"  Error: {e}")
print()

# 5. Lambda Layers
print("5. Lambda Layers:")
print("-" * 60)
try:
    layers = lambda_client.list_layers()
    satyamool_layers = [l for l in layers['Layers'] if 'satyamool' in l['LayerName'].lower()]
    if satyamool_layers:
        for layer in satyamool_layers:
            print(f"  Name: {layer['LayerName']}")
            print(f"  Latest Version: {layer['LatestMatchingVersion']['Version']}")
            print()
    else:
        print("  No satyamool layers found")
except Exception as e:
    print(f"  Error: {e}")
print()

# 6. SQS Queues
print("6. SQS Queues:")
print("-" * 60)
try:
    sqs = boto3.client('sqs', region_name=region)
    queues = sqs.list_queues(QueueNamePrefix='satyamool')
    if 'QueueUrls' in queues:
        for queue in queues['QueueUrls']:
            print(f"  - {queue}")
    else:
        print("  No satyamool queues found")
except Exception as e:
    print(f"  Error: {e}")
print()

# 7. SNS Topics
print("7. SNS Topics:")
print("-" * 60)
try:
    sns = boto3.client('sns', region_name=region)
    topics = sns.list_topics()
    satyamool_topics = [t for t in topics['Topics'] if 'SatyaMool' in t['TopicArn']]
    if satyamool_topics:
        for topic in satyamool_topics:
            print(f"  - {topic['TopicArn']}")
    else:
        print("  No SatyaMool topics found")
except Exception as e:
    print(f"  Error: {e}")
print()

# 8. Amplify Apps
print("8. Amplify Apps:")
print("-" * 60)
try:
    amplify = boto3.client('amplify', region_name=region)
    apps = amplify.list_apps()
    if apps['apps']:
        for app in apps['apps']:
            print(f"  Name: {app['name']}")
            print(f"  App ID: {app['appId']}")
            print(f"  Default Domain: {app['defaultDomain']}")
            print()
    else:
        print("  No Amplify apps found")
except Exception as e:
    print(f"  Error: {e}")
print()

print("=" * 60)
print("RESOURCE CHECK COMPLETE")
print("=" * 60)
