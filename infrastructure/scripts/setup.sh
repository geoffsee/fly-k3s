#!/usr/bin/env sh

set -e

(cargo check &)

bun i

for dir in infrastructure/pulumi/cluster/*/ infrastructure/pulumi/platform/*/; do
    if [ -f "${dir}Pulumi.yaml" ]; then
        echo "Installing dependencies in ${dir}"
        (cd "${dir}" && bun install)
    fi
done

wait
