#!/bin/bash

# Backup original package.json
cp package.json package.json.bak

# Use temporary package.json
cp package.json.temp package.json

# Build the package
npm run build

# Publish to npm
echo "Please login to npm first if you haven't already:"
echo "npm login"
echo ""
echo "Then run:"
echo "npm publish --access public"

# Restore original package.json
mv package.json.bak package.json 