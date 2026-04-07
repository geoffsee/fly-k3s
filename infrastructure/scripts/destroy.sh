#!/usr/bin/env sh

echo "WARNING: This will destroy all local deployments."
echo -n "Are you sure you want to proceed? (y/N): "
read -r response

if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "Teardown cancelled."
    exit 0
fi

(cd infrastructure/pulumi/platform/configurations && pulumi destroy --yes)
(cd infrastructure/pulumi/platform/components && pulumi destroy --yes)
(cd infrastructure/pulumi/cluster/dev && pulumi destroy --yes)
