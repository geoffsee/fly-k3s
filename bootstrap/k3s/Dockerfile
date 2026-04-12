FROM alpine:3.21

# Install dependencies
RUN apk add --no-cache \
    python3 py3-requests curl jq \
    iptables ip6tables cgroup-tools findutils procps \
    ca-certificates conntrack-tools

# Install k3s binary
ARG K3S_VERSION=v1.31.4+k3s1
RUN curl -fsSL "https://github.com/k3s-io/k3s/releases/download/${K3S_VERSION}/k3s" -o /usr/local/bin/k3s \
    && chmod +x /usr/local/bin/k3s \
    && ln -s /usr/local/bin/k3s /usr/local/bin/kubectl \
    && ln -s /usr/local/bin/k3s /usr/local/bin/crictl \
    && ln -s /usr/local/bin/k3s /usr/local/bin/ctr

COPY scripts/entrypoint-server.sh /usr/local/bin/entrypoint-server.sh
COPY scripts/entrypoint-agent.sh /usr/local/bin/entrypoint-agent.sh
COPY scripts/autoscaler.py /usr/local/bin/autoscaler.py
COPY manifests/ /default-manifests/

RUN chmod +x /usr/local/bin/entrypoint-server.sh \
    /usr/local/bin/entrypoint-agent.sh \
    /usr/local/bin/autoscaler.py

# Add non-root user
RUN adduser -D -u 1001 k8s \
    && mkdir -p /var/lib/rancher/k3s \
    && chown k8s:k8s /var/lib/rancher/k3s

USER 1001
ENTRYPOINT ["/bin/sh", "-c", "exec /usr/local/bin/entrypoint-${K3S_ROLE}.sh"]
