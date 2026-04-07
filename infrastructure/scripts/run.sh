#!/usr/bin/env sh

(cd infrastructure/pulumi/cluster/dev && pulumi up --yes)
(cd infrastructure/pulumi/platform/components && pulumi up --yes)
(cd infrastructure/pulumi/platform/configurations && pulumi up --yes)
