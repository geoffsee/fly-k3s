#!/usr/bin/env sh

set -e

echo "Starting staging deployment dry run..."

cd "$(dirname "$0")/../pulumi/platform/staging"

BOOTSTRAP_DIR="$(cd ../../../../bootstrap/coreos/staging && pwd)"

if [ ! -f "$BOOTSTRAP_DIR/.env.staging" ]; then
    echo "Error: bootstrap/coreos/staging/.env.staging not found"
    exit 1
fi

source "$BOOTSTRAP_DIR/.env.staging"

if [ -z "$GCP_PROJECT" ]; then
    echo "Error: GCP_PROJECT not set"
    exit 1
fi

echo "Project: $GCP_PROJECT  Region: ${GCP_REGION:-us-central1}  Zone: ${GCP_ZONE:-us-central1-a}"

if [ ! -d "node_modules" ]; then bun install; fi

pulumi preview

echo "Dry run complete. To deploy: bun run staging:deploy"
