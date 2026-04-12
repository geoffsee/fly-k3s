FROM alpine:3.21

# Install dependencies
RUN apk add --no-cache \
    python3 py3-requests curl jq \
    iptables ip6tables cgroup-tools findutils procps \
    ca-certificates conntrack-tools

# Install k0s binary
ARG K0S_VERSION=v1.31.3+k0s.0
ARG TARGETARCH
RUN curl -fsSL "https://github.com/k0sproject/k0s/releases/download/${K0S_VERSION}/k0s-${K0S_VERSION}-${TARGETARCH}" -o /usr/local/bin/k0s \
    && chmod +x /usr/local/bin/k0s

COPY scripts/entrypoint-server.sh /usr/local/bin/entrypoint-server.sh
COPY scripts/entrypoint-worker.sh /usr/local/bin/entrypoint-worker.sh
COPY scripts/autoscaler.py /usr/local/bin/autoscaler.py
COPY manifests/ /default-manifests/

RUN chmod +x /usr/local/bin/entrypoint-server.sh \
    /usr/local/bin/entrypoint-worker.sh \
    /usr/local/bin/autoscaler.py

# Add non-root user
RUN adduser -D -u 1001 k8s \
    && mkdir -p /var/lib/k0s \
    && chown k8s:k8s /var/lib/k0s

USER 1001
ENTRYPOINT ["/bin/sh", "-c", "exec /usr/local/bin/entrypoint-${K0S_ROLE}.sh"]