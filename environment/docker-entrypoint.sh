#!/bin/sh
set -e

if [ ! -f /app/keys/current/current.cert.pem ]; then
  openssl req \
    -x509 \
    -newkey rsa:2048 \
    -nodes \
    -sha256 \
    -days 3650 \
    -keyout /app/keys/current/current.key.pem \
    -out /app/keys/current/current.cert.pem \
    -subj "/CN=fw-signing-2026-current"
fi

exec "$@"