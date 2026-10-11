# Explorer glossary

| Term | Meaning in this application |
|---|---|
| TRRC / RRC | Railroad Commission of Texas, the official source authority. |
| UIC number | Original underground injection control identifier, kept as a string including leading zeros. |
| API number | Source-reported well identifier. Shortened API values are not assumed unique. |
| H-10 | Public injection-monitoring report context; this slice uses the official Open Data Portal monthly dataset, not a complete original-document revision ledger. |
| Inventory grain | One retained source inventory row. Repeated original IDs remain separate source records. |
| Monthly grain | One retained source report row for a reporting month, including conflicting/repeated revisions. |
| Source snapshot | Preserved response bytes with exact official query, retrieval metadata and SHA256 identity. Retrieval date is not the last reporting month. |
| Source record/row key | Dataset snapshot identity plus original one-based row ordinal; distinguishes repeated source IDs. |
| Parent key | Exact original UIC match to exactly one retained inventory row. Ambiguous/unmatched children have no resolved parent. |
| Accepted / quarantined / excluded | Mutually exclusive row dispositions. Quarantine preserves questionable rows for inspection; it does not silently drop or prefer revisions. Issue counts may overlap. |
| Missing / zero / parse failure | Missing is null/empty numeric CSV; zero is a reported numeric zero; parse failure is null plus an explicit flag. These are different facts. |
| bbl; MCF; psi; ft | Liquid barrels; thousand cubic feet; pounds per square inch; feet. Source units and projections are in the dictionary. |
| Calendar-day average | Reported monthly liquid barrels divided by actual Gregorian calendar days; calculated, not an observed daily measurement. |
| Permit maximum | Regulatory authorized volume/pressure constraint, not sustainable operating capacity or current-status evidence. |
| Artifact version | Immutable named contract folder containing normalized tables, dictionary, QC, manifest and original source bytes. |
| Manifest pin | Independent SHA256 of external manifest bytes. The manifest cannot hash itself; the browser also pins normalized payload bytes. |
| Offline replay / export | Reprocessing preserved local inputs without public network collection. Replay never becomes fresh acquisition evidence. |
| Run / stage / event | One actual invocation; one fixed execution boundary; one ordered timestamped transition with evidence. |
| Unrecorded / skipped | Unrecorded means execution evidence is absent. Skipped means an actual prior failure prevented execution. Neither means successful. |
| Consumer boundary | Analytics independently copies/pins/verifies an artifact. Explorer export alone supplies no consumer acknowledgement. |
| Test fixture | Explicitly labeled artificial response/event input used only to exercise behavior. It cannot populate actual-run history. |
