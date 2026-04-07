#!/usr/bin/env bash

echo "WARNING: This will remove all build artifacts and cached files."
echo -n "Are you sure? (y/N): "
read -r response

if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

find . -name "node_modules" -type d -prune -exec rm -rf {} \;
find . -name "target" -type d -prune -exec rm -rf {} \;
find . -name "dist" -type d -prune -exec rm -rf {} \;
find . -name "bin" -type d -prune -exec rm -rf {} \;
find . -name "*.tsbuildinfo" -type f -exec rm -f {} \;
find . -name ".pulumi" -type d -prune -exec rm -rf {} \;
find . -name "*.log" -type f -exec rm -f {} \;

echo "Cleanup complete!"
