# Publication rename diagnosis, October 11, 2026

## Established

- Retained production-suite evidence `tmp/v-Zz7OIR/suite.log`: 186 tests, 183 passed, three failed at `src/pipeline.mjs:38` with `EPERM` publication rename. Those failures remain failures; no production suite was rerun during this diagnosis.
- `src/pipeline.mjs:25` deliberately keeps a sibling lock file open. Each staged `writeFile` and verification `readFile` is awaited at line 37; the directory rename is awaited at line 38; cleanup occurs only afterward at line 39. Searches found no directory watchers, `process.chdir`, or unclosed application file streams in the source/tests. This is source evidence, not proof about external handles.
- `test/bounded-collection.test.mjs:13` uses a separate temporary directory for each setup and schedules cleanup with `t.after`; line 39 awaits collection before its assertions. `scripts/check-isolated.mjs` already runs files with `--test-concurrency=1`.
- A separate direct Node probe used only filesystem functions, copied bytes or synthetic byte buffers, fresh directories under this diagnostic folder, and no application imports, test-runner imports, live requests, protected writes, permission changes, or escalation.
- 48 independent fresh cases: empty 8/8 PASS; one text file 8/8 PASS; 28 synthetic files with readback 7/8 PASS; 28 preserved-file copies with readback 8/8 PASS; preserved copies with open sibling lock 8/8 PASS; preserved copies without readback and with sibling lock 8/8 PASS. Overall probe FAILED: one `EPERM`. Passing cases are diagnostic observations, not a replacement release gate.
- The failure occurred in synthetic-readback case 5, 28 files / 1,371,637 bytes, with no intentionally open handles and destination `ENOENT`. Source remains retained at `case-JNhpv7/artifacts/.publish-19219519-ec73-4e31-835b-4a3718e3a04a`.
- Subsequent inspection separately confirmed source and parent `lstat`, `readdir`, and read/write `access` succeed; both are ordinary directories, not links, mode `40666`. All 28 retained files have mode `100666`; no readonly file was observed. These Node mode bits do not reveal the Windows ACL or prove delete rights.
- `realpath` returns `EPERM` for source and parent, and also for successful probe directories. It therefore does not distinguish the failed rename. Caveat: the original probe's combined `info` helper reports `exists:false,error:EPERM` when its second operation (`realpath`) fails; this must not be read as source nonexistence. The separate `retained-inspection.json` is authoritative for existence/mode observations.
- Runtime is Node `v24.13.0`, libuv `1.51.0`, Windows. Node active-resource/libuv inspection did not report a watcher or known open probe file. External process handles were not observable through these APIs.

## Windows boundary and remaining gap

The exact libuv version uses `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)` for rename: [libuv 1.51 Windows filesystem implementation](https://raw.githubusercontent.com/libuv/libuv/v1.51.0/src/win/fs.c). Its error mapper maps `ERROR_ACCESS_DENIED` and `ERROR_PRIVILEGE_NOT_HELD` to `EPERM`, while `ERROR_SHARING_VIOLATION` maps to `EBUSY`: [libuv 1.51 Windows error mapping](https://raw.githubusercontent.com/libuv/libuv/v1.51.0/src/win/error.c). This does not support labeling the observed failure an ordinary sharing violation.

Windows delete/rename requires delete permission on the source or delete-child permission on its parent; read/write access is insufficient evidence: [Microsoft MoveFileExW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw).

The failing operation reproduces without the product lifecycle or sibling lock. The exact rejecting component remains unidentified: native Windows error/status, process token and delete/delete-child ACL, filesystem filter decision, and external handle ownership were not captured by direct Node APIs. Do not conclude antivirus, a particular sandbox implementation, permanent ACL denial, or an application leak from this evidence.

Next narrow action: obtain a read-only native filesystem trace for this exact independent rename probe under the same user token, recording the failing rename status and relevant filter/handle/ACL context. Do not change permissions, suppress failure, or add another production retry without that evidence.

## Commands and retained outputs

- `node tmp/test-diagnosis-2026-10-11/rename-probe.mjs` — FAILED, 47 passed / one `EPERM`; `rename-results.json` records each independent case, times and source/destination context. No rename was retried.
- `node tmp/test-diagnosis-2026-10-11/inspect-retained.mjs` — FAILED for `realpath`; stat/readdir/access passed for the retained source/parent, and destination remained absent. Detailed operations are in `retained-inspection.json`.
- Direct Node stdin inspection of retained files — PASS: all 28 files readable/stat-able, 1,371,637 bytes, no readonly file.
- Direct Node stdin comparison of successful directory realpath — FAILED: `EPERM` also on a previously successful destination; this establishes the realpath observation is not specific to the failed rename.
- `node -e 'console.log(JSON.stringify({node:process.version,uv:process.versions.uv,platform:process.platform,cwd:process.cwd()}))'` — PASS; Node 24.13.0 / libuv 1.51.0 / win32.

No product or test files were changed. Raw source data, artifact versions, pins, Analytics, and original failed suite logs were not modified.
