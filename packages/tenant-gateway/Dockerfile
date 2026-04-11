FROM rust:1.86-bookworm AS builder
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY packages/tenant-crd packages/tenant-crd
COPY packages/tenant-gateway packages/tenant-gateway
COPY packages/dev-proxy/Cargo.toml packages/dev-proxy/Cargo.toml
COPY packages/tenant-operator/Cargo.toml packages/tenant-operator/Cargo.toml
RUN mkdir -p packages/dev-proxy/src && echo "fn main() {}" > packages/dev-proxy/src/main.rs
RUN mkdir -p packages/tenant-operator/src && echo "fn main() {}" > packages/tenant-operator/src/main.rs
RUN cargo build --release -p tenant-gateway

FROM gcr.io/distroless/base-debian13
COPY --from=builder /build/target/release/tenant-gateway /usr/local/bin/tenant-gateway
ENTRYPOINT ["tenant-gateway"]