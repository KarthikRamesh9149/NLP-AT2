# Final assessment verification protocol

Frozen 1 October 2026 before these provider runs. This is supporting engineering material, not the coursework report.

## Samples and runs

1. Refresh the original 20 test dialogues using `selection-grounded-v6-release-regression.json`, FormBridge only, production configuration: primary GPT-6 Luna and one bounded GPT-6.1 Sol repair.
2. Refresh the previous 20 development dialogues using `selection-grounded-v6-release-heldout-development.json`, FormBridge only, same production configuration.
3. Compare rules, direct contextual extraction and FormBridge on that identical 20-dialogue development selection. All model calls, including FormBridge repairs, use GPT-6 Luna, reasoning low. This controls model identity; prompts, evidence generation and repair budget remain components of the compared systems. It does not isolate evidence validation alone.
4. Run the same three systems on every remaining eligible, previously unselected test dialogue (13). The exclusion list is the union of all saved prior test selections, including interrupted selections. Its IDs are frozen in `exclude-prior-test-20261001.json`. This conservative exclusion avoids claiming previously selected cases as unseen. No selection by observed correctness.

All modes replay every customer prefix in the same order and stop at the same final ReserveRestaurant customer turn. The direct system reconstructs its state at each prefix. Historical referenceDate is null. Gold values and future messages never enter extraction. No staff edits enter automatic scores. No prompt, model, matcher or extractor changes after these runs begin.

## Accounting and scoring

The original strict value matcher is retained. Canonical matching is additionally reported, never used to hide strict mismatches. Five fields per attempted dialogue; failed dialogues remain in accuracy denominators. Scores measure final five-field value agreement, not booking approval or the official SGD leaderboard.

Record every prefix's returned model, tokens, latency and repair warning. Count analysis requests and inferred provider attempts (primary plus successful repair, or failed repair when a warning is returned). Failed calls may have unreported token usage; recorded totals are observed usage, not invoices or account spend. Full-dialogue replay latency is not per-message latency. Any terminal provider failure is retained in the report, with no repeated best-result selection.

Selection manifests are written before calls, partial progress is saved after each completed dialogue, old reports are never overwritten, and source fingerprints are checked before and after a run. Equal-model runs measure the combined FormBridge approach against direct extraction; they cannot prove that validation alone caused any difference.

## Release and handover

Verify text and JSON files from a real browser download, including draft/approved status, five values, transcript, source IDs and revision history. Run the full local test suite, typecheck and build. Keep assessment material under `evaluation/`; no internal results in the live app or product README. Commit and deploy code, then verify CI, the production alias and a custom live enquiry.
