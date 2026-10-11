# Original example access repair

The original pinned public dataset was intact: rrc-2026-10-09-uic000020838-v1, five inventory rows, 28 monthly reports for UIC 000020838. The browser showed Version registry unavailable and an empty library. The local preview subsequently refused connections. No acquisition was run.

Changes: public/app.js retains the independently verified pinned version when the registry fails, renders explicit example shortcuts on Find and My datasets, and preserves available selector options during outages. public/index.html supplies the two shortcut hosts. test/navigation-redesign.test.mjs adds registry-outage, failed-integrity and cross-version recovery regressions with native select-value coercion.

Before: focused regression failed because the library contained no preserved dataset rows. After: focused suite 18/18 PASS; isolated full production suite 121/121 PASS and all public module syntax checks PASS. The sandbox full-suite attempt FAILED on EPERM realpath restrictions; the isolated host execution passed without permission-setting changes. Logs: tmp/navigation-redesign-2026-10-10/example-recovery-suite.log and example-recovery-final-host-suite.log.

Preservation: 166 original evidence/data/pin files and 14 consumer files byte-identical to the prior baseline after tests. No commits, pushes, deployment, sibling changes or collection. Local preview restored at port4391.

Browser: actual registry returned three preserved public versions. Open example dataset led to the exact original Records route, Showing 5 of 5 records, 28 linked reports, Jan2024–Apr2026. Other four inventory records correctly show history not acquired. Screenshots: ../tmp/navigation-redesign-2026-10-10/screenshots/original-example-library.jpg and original-example-restored.jpg.

Independent review: GPT-6 Astra/high reviewed the focused repair read-only, reproduced and caught selector-option coercion during registry failure; Main fixed it and the reviewer reran 18/18 successfully. No focused repair blocker remains. Existing unrelated retry limitation remains: after a failed version verification, returning to that same version through a route can skip retry; version-selector change or reload retries. Full suite and final browser screenshots were verified by Main, not independently. This repairs example discovery, not whole-project acceptance.
