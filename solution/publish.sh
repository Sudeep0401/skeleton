#!/bin/bash
set -e

echo "== Installing reference solution =="
mkdir -p /app/publisher
cp "$(dirname "$0")/release-publisher.mjs" /app/publisher/release-publisher.mjs

echo "== Starting distribution gateway =="
cd /app/distribution-gateway
node server.js &
GATEWAY_PID=$!
cd /app

echo "== Waiting for gateway readiness on port 7070 =="
for i in $(seq 1 30); do
  if node -e "fetch('http://127.0.0.1:7070/v1/signing-key/current').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "Gateway is up."
    break
  fi
  sleep 1
done

echo "== Removing any stale DB from a prior run =="
rm -f /app/releases.duckdb

echo "== Running the reference publisher =="
cd /app
npm run report

echo "== Done. Stopping gateway =="
kill "$GATEWAY_PID" 2>/dev/null || true
