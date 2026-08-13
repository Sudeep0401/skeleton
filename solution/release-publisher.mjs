import duckdb from "duckdb";
import fs from "fs";
import { execFileSync } from "child_process";

const db = new duckdb.Database("releases.duckdb");

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(sql);
    stmt.all(...params, (err, rows) => {
      stmt.finalize();
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function execute(sql, params = []) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(sql);
    stmt.run(...params, (err) => {
      stmt.finalize();
      if (err) reject(err);
      else resolve();
    });
  });
}

function canonicalDescriptor(bundle) {
  return JSON.stringify({
    artifact_count: Number(bundle.artifact_count),
    bundle_id: bundle.bundle_id,
    total_bytes: Number(bundle.total_bytes)
  });
}

function signDescriptor(descriptor, index) {
  const input = `/tmp/descriptor-${index}.json`;
  const output = `/tmp/signature-${index}.pem`;

  fs.writeFileSync(input, descriptor, "utf8");

  execFileSync(
    "openssl",
    [
      "cms", "-sign", "-binary",
      "-in", input,
      "-signer", process.env.CURRENT_CERT_PATH,
      "-inkey", process.env.CURRENT_KEY_PATH,
      "-outform", "PEM",
      "-out", output
    ],
    { stdio: "inherit" }
  );

  return fs.readFileSync(output, "utf8");
}

async function fetchCurrentKeyId() {
  const response = await fetch("http://127.0.0.1:7070/v1/signing-key/current");
  const data = await response.json();
  return data.key_id;
}

async function publish(descriptor, signature, token) {
  const response = await fetch("http://127.0.0.1:7070/v1/publications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ descriptor, signature, request_token: token })
  });
  return response.json();
}

async function main() {
  await execute(`
    DROP TABLE IF EXISTS manifest;
    CREATE TABLE manifest(
      entry_id VARCHAR, bundle_id VARCHAR, component_id VARCHAR,
      version VARCHAR, size_bytes BIGINT, record_type VARCHAR,
      supersedes_id VARCHAR, recorded_at VARCHAR
    );
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS publications(
      bundle_id VARCHAR PRIMARY KEY,
      request_token VARCHAR,
      publication_id VARCHAR,
      status VARCHAR,
      key_id VARCHAR
    );
  `);

  const csv = fs.readFileSync("./fixtures/build_manifest.csv", "utf8");
  const rows = csv.trim().split("\n").slice(1);

  for (const row of rows) {
    await execute(`INSERT INTO manifest VALUES (?,?,?,?,?,?,?,?)`, row.split(","));
  }

  const bundles = await query(`
    WITH dedup AS (SELECT DISTINCT * FROM manifest),
    withdrawals AS (SELECT supersedes_id FROM dedup WHERE record_type='WITHDRAWAL'),
    surviving AS (
      SELECT * FROM dedup
      WHERE record_type='BUILD'
      AND entry_id NOT IN (SELECT supersedes_id FROM withdrawals)
    )
    SELECT bundle_id, COUNT(*) artifact_count, SUM(size_bytes) total_bytes
    FROM surviving GROUP BY bundle_id ORDER BY bundle_id;
  `);

  const keyId = await fetchCurrentKeyId();

  let index = 0;

  for (const bundle of bundles) {
    const descriptor = canonicalDescriptor(bundle);
    console.log(`BUNDLE ${bundle.bundle_id} SIGNED KEY=${keyId}`);

    const existing = await query(
      `SELECT * FROM publications WHERE bundle_id = ?`,
      [bundle.bundle_id]
    );

    let result;
    const token = `token-${bundle.bundle_id}`;

    if (existing.length > 0) {
      result = {
        publication_id: existing[0].publication_id,
        request_token: existing[0].request_token,
        status: existing[0].status
      };
    } else {
      const signature = signDescriptor(descriptor, index++);
      result = await publish(descriptor, signature, token);

      await execute(
        `INSERT INTO publications VALUES (?,?,?,?,?)`,
        [bundle.bundle_id, result.request_token, result.publication_id, result.status, keyId]
      );
    }

    console.log(
      `BUNDLE ${bundle.bundle_id} PUBLISHED RECEIPT=${result.publication_id} TOKEN=${result.request_token} STATUS=${result.status}`
    );
  }
}

main();