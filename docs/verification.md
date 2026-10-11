# RRC-10 offline run evidence and RRC-09 adapter foundation

Goal start: 2026-10-09 19:09:34 UTC. One-hour checkpoint: 2026-10-09 20:09:34 UTC. Evidence captured: 2026-10-09T20:02:34.446Z.

Requested worker settings: GPT-6.1 Sol / medium. Runtime model/effort settings are not independently exposed; no routing verification is claimed.

## Implemented bounded subset

RRC-10: unique invocation/stage/event identity; chronological state validation; actual offline source verification, normalization/linkage/QC and deterministic export comparison; immutable evidence snapshots; structured safe diagnostic codes/messages; failed/skipped/pending distinctions; versions, source URLs/retrieval times/snapshot IDs/hashes, output hashes/counts and row dispositions. RRC-09: pure browser-compatible read-only view adapter, fixed combined stages matching executable instrumentation, historical unrecorded states, fixture labels and external consumer boundary.

Write allowlist used: src/runEvents.mjs, test/run-events.test.mjs, public/workflow.js, scripts/export.mjs, docs/verification.md. No sibling edits, acquisition, endpoint, control, scheduler or Git write. Existing source/raw/artifact versions are retained.

The recorder emits one JSON record on stdout per instrumented invocation. These two complete records are retained below; no automatic run-history store or browser history loader exists. Fixture recorder tests explicitly set testFixture=true and never enter these retained actual records. The CLI invocations below actually execute the preserved-input pipeline; neither performs a new public fetch.

## Checks

- PASS: node --test test/run-events.test.mjs test/normalize.test.mjs test/server.test.mjs — 18/18, approval-backed execution including localhost connections.
- FAILED inside workspace sandbox: same suite — 17/18; server test connect EACCES 127.0.0.1:4187. The unchanged localhost test passed outside that networking restriction.
- PASS: node scripts/export.mjs --offline-replay — exit 0; six actual events, all three stages succeeded; 5 accepted inventory, 28 accepted monthly, 28 matched parents, no quarantined/excluded rows. Seven sources and six generated contract outputs match preserved bytes.
- PASS controlled-failure gate: node scripts/export.mjs --offline-replay --expected-manifest-sha256 0000000000000000000000000000000000000000000000000000000000000000 — expected exit 1; actual MANIFEST_PIN_MISMATCH, load failed, normalization/export skipped, no fabricated export success or consumer acknowledgement.
- PASS: before/after SHA256 inventory comparison for 28 preserved raw/artifact/pointer files across both actual evidence runs. Full inventory below.
- PASS: owning Git root independently reconfirmed as C:/Users/thai.phi/Downloads/python/portfolio/texas-rrc-explorer using approval-backed git -C ... rev-parse --show-toplevel; status shows an unborn/untracked repository, so a tracked Git diff cannot represent all pre-existing work. Initial sandbox Git status/root reads failed; no Git writes performed.
- Test-first evidence: initial focused gate failed on the absent recorder module; later focused red gates exposed incomplete-terminal-record acceptance, unsupported success evidence, missing failure pin evidence and uppercase pin handling before their fixes. Initial CLI red tests reached the pre-instrumentation legacy exporter, which rewrote its deterministic pinned bytes; subsequent original manifest/source hash gates and all final replay comparisons passed.

## Remaining acceptance / review

RRC-09 remains incomplete: rendered node map, selection/details, keyboard/mobile inspection, and browser proof of no authoring/trigger controls were not implemented or checked. RRC-10 remains partial: automatic durable invocation ledger/read route, live acquisition instrumentation, default export-mode instrumentation, and full integrated UI evidence remain absent. stdout plus the two retained execution records establishes this bounded recording foundation. Historical original execution stays unrecorded; offline replay does not establish fresh acquisition. Analytics pin success, field capacity, statewide coverage and deployment are not established.

The legacy default exporter still writes the pinned version; automatic version/overwrite enforcement (E1) remains a separate gap. Only --offline-replay uses this recorder and verifies existing artifact bytes without writes. Existing scripts/acquire.mjs, src/normalize.mjs, server and app UI remain unchanged.

Independent review requested from Main for the event/state/evidence contract, actual replay/failure record agreement and adapter boundary before integration. No helper or reviewer was spawned. This bounded assignment stops after evidence delivery and does not take the next milestone.

## Actual successful offline replay

Command: node scripts/export.mjs --offline-replay

```json
{
  "schemaVersion": 1,
  "runId": "70d33905-c444-4163-a2b5-0e1f8217f307",
  "mode": "offline_replay",
  "testFixture": false,
  "pipelineVersion": "rrc-offline-export-v1",
  "dataSchemaVersion": 1,
  "transformationVersion": "rrc-odp-v1.0.0",
  "startedAt": "2026-10-09T20:02:34.280Z",
  "endedAt": "2026-10-09T20:02:34.311Z",
  "status": "succeeded",
  "events": [
    {
      "runId": "70d33905-c444-4163-a2b5-0e1f8217f307",
      "stage": "load",
      "stageId": "70d33905-c444-4163-a2b5-0e1f8217f307:load",
      "eventId": "70d33905-c444-4163-a2b5-0e1f8217f307:1",
      "timestamp": "2026-10-09T20:02:34.282Z",
      "status": "running",
      "evidence": null
    },
    {
      "runId": "70d33905-c444-4163-a2b5-0e1f8217f307",
      "stage": "load",
      "stageId": "70d33905-c444-4163-a2b5-0e1f8217f307:load",
      "eventId": "70d33905-c444-4163-a2b5-0e1f8217f307:2",
      "timestamp": "2026-10-09T20:02:34.302Z",
      "status": "succeeded",
      "evidence": {
        "inputs": [
          {
            "snapshot_id": "givw-z9t4:2bb2e506dea36872",
            "name": "candidate-inventory",
            "title": "RRC-UIC well location",
            "kind": "inventory",
            "url": "https://data.texas.gov/resource/givw-z9t4.json?%24where=api_no+like+%27389%25%27+AND+uic_type_injection%3D%271%27+AND+permit_canceled_date+IS+NULL+AND+w3_plugged_date+IS+NULL&%24limit=5&%24order=uic_number",
            "retrieved_at": "2026-10-09T11:11:47.999Z",
            "http_status": 200,
            "last_modified": "Thu, 01 Oct 2026 12:32:17 GMT",
            "etag": "\"aW5kaWEuMTgxODQ3XzNfMTE1OTZ0bHhFTFRhMTVhV0EwaldOS25pdXB4aUY0---gzip5C7pOmgtVM3EX-iut892RNW_gR4--gzip--gzip\"",
            "sha256": "2bb2e506dea368726dcecfb5ad30f6a84fe3c5da8f3b43b0cf735a214396b45c",
            "bytes": 2895,
            "raw_file": "sources/candidate-inventory.json",
            "path": "raw/candidate-inventory.json",
            "count": 5
          },
          {
            "snapshot_id": "qq2j-f2zm:de475d2906f07f57",
            "name": "candidate-monthly",
            "title": "RRC-UIC H10 Injection Monitoring",
            "kind": "monthly",
            "url": "https://data.texas.gov/resource/qq2j-f2zm.json?%24where=uic_no%3D%27000020838%27+AND+formatted_date+%3E%3D+%272024-01-01T00%3A00%3A00%27&%24limit=1000&%24order=formatted_date%2Cid",
            "retrieved_at": "2026-10-09T11:11:48.192Z",
            "http_status": 200,
            "last_modified": "Thu, 01 Oct 2026 12:10:42 GMT",
            "etag": "\"anVsaWV0dC4xNjgwOThfMl81N3FTTThrbkxIOWkwa0VlRWRhWVdreXVEeEo3QQ---gzijvn8-JM-osHKiC0NZzajKT8Xekt--gzip--gzip\"",
            "sha256": "de475d2906f07f5759d31627f0855bcaeb4145cb2752893e4dcf0b3b68ee5aed",
            "bytes": 6741,
            "raw_file": "sources/candidate-monthly.json",
            "path": "raw/candidate-monthly.json",
            "count": 28
          },
          {
            "snapshot_id": "inventory-metadata:27f0407d2c0b0bab",
            "name": "inventory-metadata",
            "title": "RRC-UIC well location",
            "kind": "metadata",
            "url": "https://data.texas.gov/api/views/givw-z9t4.json",
            "retrieved_at": "2026-10-09T11:11:47.757Z",
            "http_status": 200,
            "last_modified": null,
            "etag": null,
            "sha256": "27f0407d2c0b0bab8df444ddf3643d0062587bf4c9f974720d4aeb0e814b662d",
            "bytes": 47527,
            "raw_file": "sources/inventory-metadata.json",
            "path": "raw/inventory-metadata.json",
            "count": null
          },
          {
            "snapshot_id": "monthly-metadata:1dabe10ec6cce8d9",
            "name": "monthly-metadata",
            "title": "RRC-UIC H10 Injection Monitoring",
            "kind": "metadata",
            "url": "https://data.texas.gov/api/views/qq2j-f2zm.json",
            "retrieved_at": "2026-10-09T11:11:47.860Z",
            "http_status": 200,
            "last_modified": null,
            "etag": null,
            "sha256": "1dabe10ec6cce8d937bfc95cf16c102ceba7cc25070b8100dac88e9ee168634f",
            "bytes": 21609,
            "raw_file": "sources/monthly-metadata.json",
            "path": "raw/monthly-metadata.json",
            "count": null
          },
          {
            "snapshot_id": "uic-manual.pdf:09f3744d1ae5ea6b",
            "name": "uic-manual.pdf",
            "kind": "documentation",
            "url": "https://www.rrc.texas.gov/media/v3onmigl/uic_manual_uia010_3116.pdf",
            "retrieved_at": "2026-10-09T11:15:01.509Z",
            "http_status": 200,
            "sha256": "09f3744d1ae5ea6ba98e07e6f32d545c2a04fe3e2959bed60b401bfdff7a492c",
            "bytes": 1077385,
            "raw_file": "sources/uic-manual.pdf",
            "path": "raw/uic-manual.pdf",
            "count": null
          },
          {
            "snapshot_id": "rrc-resources.html:d8173dcf819e1942",
            "name": "rrc-resources.html",
            "kind": "documentation",
            "url": "https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/resources/",
            "retrieved_at": "2026-10-09T11:15:01.670Z",
            "http_status": 200,
            "sha256": "d8173dcf819e194260145bc9de7e0e461fb8e9e9b420c4b49274cbfdcfa4d2d1",
            "bytes": 48496,
            "raw_file": "sources/rrc-resources.html",
            "path": "raw/rrc-resources.html",
            "count": null
          },
          {
            "snapshot_id": "uic-query-help.html:563b33af66a36b52",
            "name": "uic-query-help.html",
            "kind": "documentation",
            "url": "https://webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html",
            "retrieved_at": "2026-10-09T11:15:01.792Z",
            "http_status": 200,
            "sha256": "563b33af66a36b52d20a1773ec2004b42d2217ad4404a83b2fbb639520efc16d",
            "bytes": 42272,
            "raw_file": "sources/uic-query-help.html",
            "path": "raw/uic-query-help.html",
            "count": null
          }
        ],
        "manifestPin": "3a523cadca4c7a35d667ccd53629d63e5afc6de382be670cba1d61743baef61f"
      }
    },
    {
      "runId": "70d33905-c444-4163-a2b5-0e1f8217f307",
      "stage": "normalize-qc",
      "stageId": "70d33905-c444-4163-a2b5-0e1f8217f307:normalize-qc",
      "eventId": "70d33905-c444-4163-a2b5-0e1f8217f307:3",
      "timestamp": "2026-10-09T20:02:34.303Z",
      "status": "running",
      "evidence": null
    },
    {
      "runId": "70d33905-c444-4163-a2b5-0e1f8217f307",
      "stage": "normalize-qc",
      "stageId": "70d33905-c444-4163-a2b5-0e1f8217f307:normalize-qc",
      "eventId": "70d33905-c444-4163-a2b5-0e1f8217f307:4",
      "timestamp": "2026-10-09T20:02:34.304Z",
      "status": "succeeded",
      "evidence": {
        "inputs": [
          {
            "snapshotId": "givw-z9t4:2bb2e506dea36872",
            "sha256": "2bb2e506dea368726dcecfb5ad30f6a84fe3c5da8f3b43b0cf735a214396b45c",
            "count": 5
          },
          {
            "snapshotId": "qq2j-f2zm:de475d2906f07f57",
            "sha256": "de475d2906f07f5759d31627f0855bcaeb4145cb2752893e4dcf0b3b68ee5aed",
            "count": 28
          }
        ],
        "counts": {
          "inventory": {
            "raw": 5,
            "parsed": 5,
            "accepted": 5,
            "quarantined": 0,
            "excluded": 0
          },
          "monthly": {
            "raw": 28,
            "parsed": 28,
            "accepted": 28,
            "quarantined": 0,
            "excluded": 0
          },
          "parent_join": {
            "matched": 28,
            "unmatched": 0,
            "ambiguous": 0
          },
          "issue_counts": {},
          "dispositions": [
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:1",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:2",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:3",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:4",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:5",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:6",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:7",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:8",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:9",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:10",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:11",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:12",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:13",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:14",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:15",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:16",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:17",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:18",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:19",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:20",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:21",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:22",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:23",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:24",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:25",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:26",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:27",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:28",
              "disposition": "accepted"
            }
          ],
          "annulus_fields": "not supplied by ODP dataset; not inferred",
          "revision_policy": "Every source row retained; duplicate period or report ID quarantined without selecting a preferred revision. most_recent_record preserved without using it as a revision selector.",
          "scope": "Bounded inventory candidates and one UIC monthly history; no statewide coverage or current operating-status assertion."
        },
        "outputs": [
          {
            "name": "normalized inventory",
            "count": 5,
            "sha256": "96adec1093039c4b1e44f0fc76f235b25e55ee7cbf2b7459dd6fb724027e8428"
          },
          {
            "name": "normalized monthly",
            "count": 28,
            "sha256": "12d56433ef1a0ead42ed92ff5db99170ce6920fe683d584953a95e86055fbb16"
          }
        ]
      }
    },
    {
      "runId": "70d33905-c444-4163-a2b5-0e1f8217f307",
      "stage": "export",
      "stageId": "70d33905-c444-4163-a2b5-0e1f8217f307:export",
      "eventId": "70d33905-c444-4163-a2b5-0e1f8217f307:5",
      "timestamp": "2026-10-09T20:02:34.304Z",
      "status": "running",
      "evidence": null
    },
    {
      "runId": "70d33905-c444-4163-a2b5-0e1f8217f307",
      "stage": "export",
      "stageId": "70d33905-c444-4163-a2b5-0e1f8217f307:export",
      "eventId": "70d33905-c444-4163-a2b5-0e1f8217f307:6",
      "timestamp": "2026-10-09T20:02:34.311Z",
      "status": "succeeded",
      "evidence": {
        "artifactId": "rrc-2026-10-09-uic000020838-v1",
        "operation": "verified_existing_bytes",
        "inputs": [
          {
            "snapshotId": "givw-z9t4:2bb2e506dea36872",
            "url": "https://data.texas.gov/resource/givw-z9t4.json?%24where=api_no+like+%27389%25%27+AND+uic_type_injection%3D%271%27+AND+permit_canceled_date+IS+NULL+AND+w3_plugged_date+IS+NULL&%24limit=5&%24order=uic_number",
            "sha256": "2bb2e506dea368726dcecfb5ad30f6a84fe3c5da8f3b43b0cf735a214396b45c"
          },
          {
            "snapshotId": "qq2j-f2zm:de475d2906f07f57",
            "url": "https://data.texas.gov/resource/qq2j-f2zm.json?%24where=uic_no%3D%27000020838%27+AND+formatted_date+%3E%3D+%272024-01-01T00%3A00%3A00%27&%24limit=1000&%24order=formatted_date%2Cid",
            "sha256": "de475d2906f07f5759d31627f0855bcaeb4145cb2752893e4dcf0b3b68ee5aed"
          },
          {
            "snapshotId": "inventory-metadata:27f0407d2c0b0bab",
            "url": "https://data.texas.gov/api/views/givw-z9t4.json",
            "sha256": "27f0407d2c0b0bab8df444ddf3643d0062587bf4c9f974720d4aeb0e814b662d"
          },
          {
            "snapshotId": "monthly-metadata:1dabe10ec6cce8d9",
            "url": "https://data.texas.gov/api/views/qq2j-f2zm.json",
            "sha256": "1dabe10ec6cce8d937bfc95cf16c102ceba7cc25070b8100dac88e9ee168634f"
          },
          {
            "snapshotId": "uic-manual.pdf:09f3744d1ae5ea6b",
            "url": "https://www.rrc.texas.gov/media/v3onmigl/uic_manual_uia010_3116.pdf",
            "sha256": "09f3744d1ae5ea6ba98e07e6f32d545c2a04fe3e2959bed60b401bfdff7a492c"
          },
          {
            "snapshotId": "rrc-resources.html:d8173dcf819e1942",
            "url": "https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/resources/",
            "sha256": "d8173dcf819e194260145bc9de7e0e461fb8e9e9b420c4b49274cbfdcfa4d2d1"
          },
          {
            "snapshotId": "uic-query-help.html:563b33af66a36b52",
            "url": "https://webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html",
            "sha256": "563b33af66a36b52d20a1773ec2004b42d2217ad4404a83b2fbb639520efc16d"
          }
        ],
        "outputs": [
          {
            "path": "artifacts/rrc-2026-10-09-uic000020838-v1/inventory.csv",
            "sha256": "ce0129b6c3074840168b561113d07c6d22e5de2daf95412acc3e9f0051634521",
            "bytes": 1502,
            "count": 5
          },
          {
            "path": "artifacts/rrc-2026-10-09-uic000020838-v1/injection_monthly.csv",
            "sha256": "1831e77daa33af7bcb49ee62d36d170c40031e2603b1e0015ae20144fe94f3a3",
            "bytes": 5513,
            "count": 28
          },
          {
            "path": "artifacts/rrc-2026-10-09-uic000020838-v1/quality_report.json",
            "sha256": "b9377b4b495acf30f5d0d93e6192e862f78243bd77672a94f03e8b5fcbe6d133",
            "bytes": 3828,
            "count": null
          },
          {
            "path": "artifacts/rrc-2026-10-09-uic000020838-v1/data_dictionary.json",
            "sha256": "3777d6d1c46c3fcb94a8e62fc04c59c4bdeb1a43adcfe39b002ba7a71f276ff1",
            "bytes": 7359,
            "count": null
          },
          {
            "path": "artifacts/rrc-2026-10-09-uic000020838-v1/normalized.json",
            "sha256": "4f243138c833f09a5be6a970e85f76f3f73e95040c69677a10b8c3b2fe03ca5b",
            "bytes": 42662,
            "count": null
          },
          {
            "path": "artifacts/rrc-2026-10-09-uic000020838-v1/manifest.json",
            "sha256": "3a523cadca4c7a35d667ccd53629d63e5afc6de382be670cba1d61743baef61f",
            "bytes": 6308,
            "count": null
          }
        ],
        "sourceOutputs": [
          {
            "path": "artifacts/rrc-2026-10-09-uic000020838-v1/sources/candidate-inventory.json",
            "sha256": "2bb2e506dea368726dcecfb5ad30f6a84fe3c5da8f3b43b0cf735a214396b45c",
            "bytes": 2895
          },
          {
            "path": "artifacts/rrc-2026-10-09-uic000020838-v1/sources/candidate-monthly.json",
            "sha256": "de475d2906f07f5759d31627f0855bcaeb4145cb2752893e4dcf0b3b68ee5aed",
            "bytes": 6741
          },
          {
            "path": "artifacts/rrc-2026-10-09-uic000020838-v1/sources/inventory-metadata.json",
            "sha256": "27f0407d2c0b0bab8df444ddf3643d0062587bf4c9f974720d4aeb0e814b662d",
            "bytes": 47527
          },
          {
            "path": "artifacts/rrc-2026-10-09-uic000020838-v1/sources/monthly-metadata.json",
            "sha256": "1dabe10ec6cce8d937bfc95cf16c102ceba7cc25070b8100dac88e9ee168634f",
            "bytes": 21609
          },
          {
            "path": "artifacts/rrc-2026-10-09-uic000020838-v1/sources/uic-manual.pdf",
            "sha256": "09f3744d1ae5ea6ba98e07e6f32d545c2a04fe3e2959bed60b401bfdff7a492c",
            "bytes": 1077385
          },
          {
            "path": "artifacts/rrc-2026-10-09-uic000020838-v1/sources/rrc-resources.html",
            "sha256": "d8173dcf819e194260145bc9de7e0e461fb8e9e9b420c4b49274cbfdcfa4d2d1",
            "bytes": 48496
          },
          {
            "path": "artifacts/rrc-2026-10-09-uic000020838-v1/sources/uic-query-help.html",
            "sha256": "563b33af66a36b52d20a1773ec2004b42d2217ad4404a83b2fbb639520efc16d",
            "bytes": 42272
          }
        ],
        "counts": {
          "inventory": {
            "raw": 5,
            "parsed": 5,
            "accepted": 5,
            "quarantined": 0,
            "excluded": 0
          },
          "monthly": {
            "raw": 28,
            "parsed": 28,
            "accepted": 28,
            "quarantined": 0,
            "excluded": 0
          },
          "parent_join": {
            "matched": 28,
            "unmatched": 0,
            "ambiguous": 0
          },
          "issue_counts": {},
          "dispositions": [
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:1",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:2",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:3",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:4",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:5",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:6",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:7",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:8",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:9",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:10",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:11",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:12",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:13",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:14",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:15",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:16",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:17",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:18",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:19",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:20",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:21",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:22",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:23",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:24",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:25",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:26",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:27",
              "disposition": "accepted"
            },
            {
              "source_row_key": "rrc:h10:qq2j-f2zm:de475d2906f07f57:28",
              "disposition": "accepted"
            }
          ],
          "annulus_fields": "not supplied by ODP dataset; not inferred",
          "revision_policy": "Every source row retained; duplicate period or report ID quarantined without selecting a preferred revision. most_recent_record preserved without using it as a revision selector.",
          "scope": "Bounded inventory candidates and one UIC monthly history; no statewide coverage or current operating-status assertion."
        },
        "realHistoryStatus": "verified_bounded_linkage"
      }
    }
  ]
}
```

## Actual controlled offline failure

Command: node scripts/export.mjs --offline-replay --expected-manifest-sha256 0000000000000000000000000000000000000000000000000000000000000000

```json
{
  "schemaVersion": 1,
  "runId": "ecaa6680-58c7-4d3e-a705-c7ec5307aaf3",
  "mode": "offline_replay",
  "testFixture": false,
  "pipelineVersion": "rrc-offline-export-v1",
  "dataSchemaVersion": 1,
  "transformationVersion": "rrc-odp-v1.0.0",
  "startedAt": "2026-10-09T20:02:34.410Z",
  "endedAt": "2026-10-09T20:02:34.415Z",
  "status": "failed",
  "events": [
    {
      "runId": "ecaa6680-58c7-4d3e-a705-c7ec5307aaf3",
      "stage": "load",
      "stageId": "ecaa6680-58c7-4d3e-a705-c7ec5307aaf3:load",
      "eventId": "ecaa6680-58c7-4d3e-a705-c7ec5307aaf3:1",
      "timestamp": "2026-10-09T20:02:34.412Z",
      "status": "running",
      "evidence": null
    },
    {
      "runId": "ecaa6680-58c7-4d3e-a705-c7ec5307aaf3",
      "stage": "load",
      "stageId": "ecaa6680-58c7-4d3e-a705-c7ec5307aaf3:load",
      "eventId": "ecaa6680-58c7-4d3e-a705-c7ec5307aaf3:2",
      "timestamp": "2026-10-09T20:02:34.415Z",
      "status": "failed",
      "evidence": {
        "manifestPath": "artifacts/rrc-2026-10-09-uic000020838-v1/manifest.json",
        "expectedManifestSha256": "0000000000000000000000000000000000000000000000000000000000000000",
        "actualManifestSha256": "3a523cadca4c7a35d667ccd53629d63e5afc6de382be670cba1d61743baef61f"
      },
      "error": {
        "code": "MANIFEST_PIN_MISMATCH",
        "message": "Preserved manifest does not match the requested SHA256 pin."
      }
    },
    {
      "runId": "ecaa6680-58c7-4d3e-a705-c7ec5307aaf3",
      "stage": "normalize-qc",
      "stageId": "ecaa6680-58c7-4d3e-a705-c7ec5307aaf3:normalize-qc",
      "eventId": "ecaa6680-58c7-4d3e-a705-c7ec5307aaf3:3",
      "timestamp": "2026-10-09T20:02:34.415Z",
      "status": "skipped",
      "evidence": {
        "reason": "upstream_failed",
        "failedStage": "load"
      }
    },
    {
      "runId": "ecaa6680-58c7-4d3e-a705-c7ec5307aaf3",
      "stage": "export",
      "stageId": "ecaa6680-58c7-4d3e-a705-c7ec5307aaf3:export",
      "eventId": "ecaa6680-58c7-4d3e-a705-c7ec5307aaf3:4",
      "timestamp": "2026-10-09T20:02:34.415Z",
      "status": "skipped",
      "evidence": {
        "reason": "upstream_failed",
        "failedStage": "load"
      }
    }
  ]
}
```

## Preserved file hashes (before and after both runs)

```json
{
  "artifacts/rrc-2026-10-09-uic000020838-v1/data_dictionary.json": "3777d6d1c46c3fcb94a8e62fc04c59c4bdeb1a43adcfe39b002ba7a71f276ff1",
  "artifacts/rrc-2026-10-09-uic000020838-v1/injection_monthly.csv": "1831e77daa33af7bcb49ee62d36d170c40031e2603b1e0015ae20144fe94f3a3",
  "artifacts/rrc-2026-10-09-uic000020838-v1/inventory.csv": "ce0129b6c3074840168b561113d07c6d22e5de2daf95412acc3e9f0051634521",
  "artifacts/rrc-2026-10-09-uic000020838-v1/manifest.json": "3a523cadca4c7a35d667ccd53629d63e5afc6de382be670cba1d61743baef61f",
  "artifacts/rrc-2026-10-09-uic000020838-v1/normalized.json": "4f243138c833f09a5be6a970e85f76f3f73e95040c69677a10b8c3b2fe03ca5b",
  "artifacts/rrc-2026-10-09-uic000020838-v1/quality_report.json": "b9377b4b495acf30f5d0d93e6192e862f78243bd77672a94f03e8b5fcbe6d133",
  "artifacts/rrc-2026-10-09-uic000020838-v1/sources/candidate-inventory.json": "2bb2e506dea368726dcecfb5ad30f6a84fe3c5da8f3b43b0cf735a214396b45c",
  "artifacts/rrc-2026-10-09-uic000020838-v1/sources/candidate-monthly.json": "de475d2906f07f5759d31627f0855bcaeb4145cb2752893e4dcf0b3b68ee5aed",
  "artifacts/rrc-2026-10-09-uic000020838-v1/sources/inventory-metadata.json": "27f0407d2c0b0bab8df444ddf3643d0062587bf4c9f974720d4aeb0e814b662d",
  "artifacts/rrc-2026-10-09-uic000020838-v1/sources/monthly-metadata.json": "1dabe10ec6cce8d937bfc95cf16c102ceba7cc25070b8100dac88e9ee168634f",
  "artifacts/rrc-2026-10-09-uic000020838-v1/sources/rrc-resources.html": "d8173dcf819e194260145bc9de7e0e461fb8e9e9b420c4b49274cbfdcfa4d2d1",
  "artifacts/rrc-2026-10-09-uic000020838-v1/sources/uic-manual.pdf": "09f3744d1ae5ea6ba98e07e6f32d545c2a04fe3e2959bed60b401bfdff7a492c",
  "artifacts/rrc-2026-10-09-uic000020838-v1/sources/uic-query-help.html": "563b33af66a36b52d20a1773ec2004b42d2217ad4404a83b2fbb639520efc16d",
  "public/artifact-path.json": "46d0eeedd02b5208e63a432bcb6382e4561121dc24c7c34f1093e0b24dbd93d0",
  "raw/candidate-inventory.json": "2bb2e506dea368726dcecfb5ad30f6a84fe3c5da8f3b43b0cf735a214396b45c",
  "raw/candidate-inventory.source.json": "bd40ac31b0a7958eb93c829d52730b9f893ef1d65172a6bc451de084389b1379",
  "raw/candidate-monthly.json": "de475d2906f07f5759d31627f0855bcaeb4145cb2752893e4dcf0b3b68ee5aed",
  "raw/candidate-monthly.source.json": "4948b0241854906f8cbd86f7308897eda3179238a4496277a77f74684bd0a8b1",
  "raw/inventory-metadata.json": "27f0407d2c0b0bab8df444ddf3643d0062587bf4c9f974720d4aeb0e814b662d",
  "raw/inventory-metadata.source.json": "fabd168bd7aa0a44ea0e7ed34a43bc6797bce9cce2768b51fdcd0a41a560c3f4",
  "raw/monthly-metadata.json": "1dabe10ec6cce8d937bfc95cf16c102ceba7cc25070b8100dac88e9ee168634f",
  "raw/monthly-metadata.source.json": "adabcb7ed84ddf31e532455ab844d5f223c98e1a05a50771b0d453d9bcc81b5b",
  "raw/rrc-resources.html": "d8173dcf819e194260145bc9de7e0e461fb8e9e9b420c4b49274cbfdcfa4d2d1",
  "raw/rrc-resources.source.json": "00b32c602536b20b5705d629f5819c0bce85d005aa672120a8e585acf9bf71e2",
  "raw/uic-manual.pdf": "09f3744d1ae5ea6ba98e07e6f32d545c2a04fe3e2959bed60b401bfdff7a492c",
  "raw/uic-manual.source.json": "59d44914bcf76082d0014c77d10ff9d80d188ab8250574e1ac178537ff11b8f9",
  "raw/uic-query-help.html": "563b33af66a36b52d20a1773ec2004b42d2217ad4404a83b2fbb639520efc16d",
  "raw/uic-query-help.source.json": "d7be62cc1a0028444896a80f5190c5f47238d8111a174bb0def7a59bb70f25b1"
}
```
