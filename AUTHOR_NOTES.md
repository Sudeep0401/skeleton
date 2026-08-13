# Author Notes

## Design

This task exercises: SQL-based data reconciliation over an embedded database
(DuckDB), correct use of a cryptographic CLI (OpenSSL CMS) including
understanding of key rotation and detached-signature canonicalization, HTTP
integration against a real service with idempotency, and deterministic
reproducible CLI output.

## Intentional difficulty devices

1. **Wrong-key trap.** A revoked keypair is present at `/app/keys/revoked/`;
   only the current keypair verifies against the gateway. Confirmed manually:
   signing with `current.key.pem` returns `status: PUBLISHED`; signing with
   `revoked.key.pem` returns `error: UNTRUSTED_SIGNATURE`.
2. **Exact byte canonicalization.** The signed bytes and the bytes sent as
   `descriptor` must be identical (sorted JSON keys, no insignificant
   whitespace) or the signature fails verification.
3. **Reconciliation semantics.** A bundle whose every build was withdrawn
   (`BND-104` in the fixture) must not appear in output. Exact-duplicate rows
   (repeated `MFR-0001`, `MFR-0007`, `MFR-0014`) must collapse to one.
4. **Idempotency.** A second run must reuse persisted receipts, produce
   byte-identical stdout, and must not create duplicate publications on the
   gateway.
5. **Determinism.** Output is sorted by `bundle_id`; the `RECEIPT` field is
   randomized per accept and is masked by the grader rather than pinned.

## Proofs (both demonstrated in a clean container)

**Proof A — empty environment, expected failure:**
With `environment/publisher/` shipped empty (as it does in this repository),
building the image fresh and running `npm run report` against a started gateway
fails immediately:

Error: Cannot find module '/app/publisher/release-publisher.mjs'


**Proof B — reference solution, expected success:**
Running `solution/publish.sh` (which installs `solution/release-publisher.mjs`
into `/app/publisher/`, starts the gateway, waits for readiness, and runs
`npm run report`) in a freshly built container produces:

BUNDLE BND-101 SIGNED KEY=fw-signing-2026-current
BUNDLE BND-101 PUBLISHED RECEIPT=pub_69a083f4902eb6f4df54e273 TOKEN=token-BND-101 STATUS=PUBLISHED
BUNDLE BND-102 SIGNED KEY=fw-signing-2026-current
BUNDLE BND-102 PUBLISHED RECEIPT=pub_e6815076829ce685736ec2e4 TOKEN=token-BND-102 STATUS=PUBLISHED
BUNDLE BND-103 SIGNED KEY=fw-signing-2026-current
BUNDLE BND-103 PUBLISHED RECEIPT=pub_f03d03ccd6ba10ceca4f86d3 TOKEN=token-BND-103 STATUS=PUBLISHED


This matches `reports/publications.expected.txt` exactly with the RECEIPT field
masked. A second run of the reference solution reuses the persisted DuckDB
state, reproduces byte-identical stdout (same RECEIPT values), and the
gateway's ledger (`distribution-gateway/data/gateway.json`) retains exactly one
publication per bundle — confirming idempotency.

## Known issue — flagged, not fixed by the author

`tests/test_outputs.py` in this repository currently belongs to an unrelated
task (a "RiftArena" cartridge-decode game, importing `riftarena.playthrough`)
due to an apparent packaging error, and does not test this task's functional
criteria at all. Both proofs above were therefore validated manually — by
diffing `npm run report` output against the golden file and inspecting DuckDB
and gateway state directly — rather than via the shipped `tests/test.sh`, which
cannot currently run against this task. A corrected `test_outputs.py` aligned
with the functional_criteria in `scaffold_plan.yaml` is needed before automated
grading can run end-to-end.
