#!/bin/bash
# Build script for Lambda layers
# This script builds all Lambda layers for deployment

set -e

echo "Building Lambda layers..."

# Build Node.js Common Layer
echo "Building Node.js Common Layer..."
cd nodejs-common/nodejs
npm install --production
cd ../..

# Build AWS SDK Layer
echo "Building AWS SDK Layer..."
cd aws-sdk/nodejs
npm install --production
cd ../..

# Build Python Common Layer
echo "Building Python Common Layer..."
cd python-common
mkdir -p python
pip install -r python/requirements.txt -t python/ --platform manylinux2014_aarch64 --only-binary=:all:
cd ..

echo "Lambda layers built successfully!"
