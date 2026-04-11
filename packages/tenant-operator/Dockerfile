FROM rust:1.88-bookworm AS builder
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY packages/tenant-operator packages/tenant-operator
COPY packages/dev-proxy/Cargo.toml packages/dev-proxy/Cargo.toml
RUN mkdir -p packages/dev-proxy/src && echo "fn main() {}" > packages/dev-proxy/src/main.rs
RUN cargo build --release -p tenant-operator

FROM gcr.io/distroless/cc-debian12
COPY --from=builder /build/target/release/tenant-operator /usr/local/bin/tenant-operator
ENTRYPOINT ["tenant-operator"]