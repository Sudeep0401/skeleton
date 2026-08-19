FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       openssl \
       python3 \
       python3-pip \
       python-is-python3 \
       build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN mkdir -p /app/keys/current \
    /app/keys/revoked

RUN openssl req \
    -x509 \
    -newkey rsa:2048 \
    -nodes \
    -sha256 \
    -days 3650 \
    -keyout /app/keys/current/current.key.pem \
    -out /app/keys/current/current.cert.pem \
    -subj "/CN=fw-signing-2026-current"

RUN openssl req \
    -x509 \
    -newkey rsa:2048 \
    -nodes \
    -sha256 \
    -days 3650 \
    -keyout /app/keys/revoked/revoked.key.pem \
    -out /app/keys/revoked/revoked.cert.pem \
    -subj "/CN=fw-signing-2025-revoked"

ENV CURRENT_CERT_PATH=/app/keys/current/current.cert.pem
ENV CURRENT_KEY_PATH=/app/keys/current/current.key.pem
ENV REVOKED_CERT_PATH=/app/keys/revoked/revoked.cert.pem
ENV REVOKED_KEY_PATH=/app/keys/revoked/revoked.key.pem

COPY package.json .

RUN npm install --no-audit --no-fund

COPY distribution-gateway/package.json /app/distribution-gateway/package.json

WORKDIR /app/distribution-gateway

RUN npm install --no-audit --no-fund

WORKDIR /app

COPY distribution-gateway/ /app/distribution-gateway/

COPY fixtures/build_manifest.csv /app/fixtures/build_manifest.csv

COPY reports/publications.expected.txt /app/reports/publications.expected.txt

RUN mkdir -p /app/publisher
