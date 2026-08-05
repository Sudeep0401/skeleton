FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       openssl \
       python3 \
       python3-pip \
       build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN mkdir -p /app/keys/current \
    /app/keys/revoked

ENV CURRENT_CERT_PATH=/app/keys/current/current.cert.pem
ENV CURRENT_KEY_PATH=/app/keys/current/current.key.pem

COPY package.json .

RUN npm install --no-audit --no-fund

COPY distribution-gateway/package.json /app/distribution-gateway/package.json

WORKDIR /app/distribution-gateway

RUN npm install --no-audit --no-fund

WORKDIR /app

COPY distribution-gateway/ /app/distribution-gateway/

COPY fixtures/build_manifest.csv /app/fixtures/build_manifest.csv

COPY reports/publications.expected.txt /app/reports/publications.expected.txt

COPY publisher/ /app/publisher/

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]