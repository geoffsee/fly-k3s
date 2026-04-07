#!/usr/bin/env sh
set -e

cd "$(dirname "$0")"

KEY_FILE="$(pwd)/vm-ssh.pk"

ssh-keygen -t ed25519 -f "$KEY_FILE" -N "" -C "vm-access-key"
mv "${KEY_FILE}.pub" "$(pwd)/vm-ssh.pub"
SSH_KEY=$(cat "$(pwd)/vm-ssh.pub")

sed "s|ssh-ed25519 .* vm-access-key|${SSH_KEY}|" coreos.fcc \
    | docker run --rm -i quay.io/coreos/butane:release --pretty --strict \
    > coreos.ign

echo "Generated coreos.ign with fresh SSH key"
echo "Private key: vm-ssh.pk"
