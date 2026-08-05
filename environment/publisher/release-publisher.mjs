import duckdb from "duckdb";
import fs from "fs";
import { execFileSync } from "child_process";

const db = new duckdb.Database("releases.duckdb");

function query(sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
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
      "cms",
      "-sign",
      "-binary",
      "-in",
      input,
      "-signer",
      process.env.CURRENT_CERT_PATH,
      "-inkey",
      process.env.CURRENT_KEY_PATH,
      "-outform",
      "PEM",
      "-out",
      output
    ],
    {
      stdio: "inherit"
    }
  );

  return fs.readFileSync(output, "utf8");
}

async function publish(descriptor, signature, token) {
  const response = await fetch(
    "http://host.docker.internal:7070/v1/publications",
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        descriptor,
        signature,
        request_token: token
      })
    }
  );

  return response.json();
}

async function main() {

  await execute(`
    DROP TABLE IF EXISTS manifest;

    CREATE TABLE manifest(
      entry_id VARCHAR,
      bundle_id VARCHAR,
      component_id VARCHAR,
      version VARCHAR,
      size_bytes BIGINT,
      record_type VARCHAR,
      supersedes_id VARCHAR,
      recorded_at VARCHAR
    );
  `);

  const csv = fs.readFileSync(
    "./fixtures/build_manifest.csv",
    "utf8"
  );

  const rows = csv
    .trim()
    .split("\n")
    .slice(1);

  console.log("Rows found:", rows.length);

  for (const row of rows) {
    await execute(
      `
      INSERT INTO manifest VALUES (?,?,?,?,?,?,?,?)
      `,
      row.split(",")
    );
  }

  const bundles = await query(`
    WITH dedup AS (
      SELECT DISTINCT *
      FROM manifest
    ),

    withdrawals AS (
      SELECT supersedes_id
      FROM dedup
      WHERE record_type='WITHDRAWAL'
    ),

    surviving AS (
      SELECT *
      FROM dedup
      WHERE record_type='BUILD'
      AND entry_id NOT IN (
        SELECT supersedes_id
        FROM withdrawals
      )
    )

    SELECT
      bundle_id,
      COUNT(*) artifact_count,
      SUM(size_bytes) total_bytes
    FROM surviving
    GROUP BY bundle_id
    ORDER BY bundle_id;
  `);

  console.log("\nPublishable bundles:");
  console.log(bundles);

  const report = [];

  let index = 0;

  for (const bundle of bundles) {

    console.log(`\nSigning bundle: ${bundle.bundle_id}`);

    const descriptor = canonicalDescriptor(bundle);

    console.log("Descriptor:", descriptor);

    const signature = signDescriptor(
      descriptor,
      index++
    );

    const result = await publish(
      descriptor,
      signature,
      `release-${bundle.bundle_id}`
    );

    console.log(result);

    report.push({
      bundle_id: bundle.bundle_id,
      result
    });
  }

  fs.writeFileSync(
    "reports/publications.actual.json",
    JSON.stringify(report, null, 2)
  );

  console.log("\nReport generated successfully.");
}

main();