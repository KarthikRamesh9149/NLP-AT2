# Grounded extraction release verification

Verified on 1 October 2026 (Australia/Sydney). This file records engineering checks and their limits. It is not a coursework report or a claim of universal accuracy.

## Release configuration

- Application commit: `7ff53554d0897664f107cad8e30711c9e3e7a71d`.
- Extraction version: `grounded-state-v6`.
- Primary model: `gpt-6-luna`; one bounded validation repair may use `gpt-6.1-sol`.
- Extraction source SHA-256: `95bc9a6cf4b63cd9e68c5ac080bb408d19b6d13dd45a3e710b3f90ce43e88d78`. Both final SGD reports match the current extraction source.
- Public production alias: https://formbridge-nlp-at2.vercel.app/.
- Verified READY deployment: `dpl_6WFwuCjtBUuuYQ2K8ajNpWzLuni8`.
- GitHub Actions run `36791579797`: completed successfully for the application commit.
- The subsequent evidence and screenshot commit does not change application code. Its deployment and CI are verified separately at handover.

## Accuracy evidence

| Sample | Correct field values | Complete five-field value states | Provider failures |
| --- | --- | --- | --- |
| Original 20-dialogue regression sample | 100/100 | 20/20 | 0/20 |
| Separate 20-dialogue development sample | 95/100 | 16/20 | 0/20 |

The original saved result was 84/100 fields, 7/20 complete states and 9/20 date values. The final regression run matches all 20 date values. The original sample has been inspected during development and is therefore a regression sample, not an unseen generalisation test. Its original report remains unchanged.

The separate sample uses the official SGD development split, a fixed seeded selection and excludes the ten development dialogues inspected earlier. Its labels were not used as model inputs or reviewed individually to tune this release. Repeated runs on this selection produced 95–96/100 fields and 16–17/20 complete states. Repetition makes this a held-out development check, not a fresh test on every run.

Final reports:

- `../results/sgd-test-20-grounded-v6-release-regression.json`
- `../results/sgd-dev-20-grounded-v6-release-heldout-development.json`

Both final scores are identical under the original strict matching rule and the additional canonical representation matcher. Canonical matching accepts equivalent date/clock representations; it does not assume an omitted year or AM/PM, supply missing values, or merge different venues. Failures remain in the denominator. Gold states and future turns are excluded from inference inputs. Selection manifests and extraction fingerprints are saved before provider calls.

These are five-field value agreement scores, not the official full SGD benchmark and not a measure of reservation execution. Historical examples with an unspecified calendar year retain their stated date expression and need clarification. All historical benchmark briefs still require date clarification before approval. A matching date value does not mean an exact booking date has been confirmed.

Recorded mean latency is per complete dialogue replay, including multiple customer-turn API requests: 22.9 seconds for the regression sample and 29.1 seconds for the development sample. It is not a per-message latency estimate. Token usage is saved in each report; these records are not invoices or complete account spending totals.

## Corrections implemented

- Validate quoted evidence against actual messages and distinguish a proposed staff value from customer acceptance.
- Reconcile complete conversation context while preserving newer corrections and unrelated fields.
- Handle explicit cancellation deterministically so older model predictions cannot resurrect cancelled details.
- Preserve reference dates when a cancelled enquiry is reopened.
- Compose dates across messages, validate calendar dates and preserve uncertainty about years, relative dates and ambiguous clocks.
- Keep reviewed staff edits protected and show subsequent conflicts for human review.
- Use bounded provider calls and retain valid state on timeout, refusal or invalid output. The larger model's pilot performed worse and timed out, so it was not selected as the default.
- Return readable rate-limit errors, preserve genuine enquiry text in pasted transcripts, and prevent stale requests or draft restoration from changing a new workspace.

No dialogue-specific value tables or benchmark answer overrides are used.

## Product verification

- 46 local tests in 11 files passed; TypeScript checking, production build and whitespace checks passed on the application candidate.
- 30/30 synthetic scenarios passed against the public deployed API with real provider calls. Assertions cover values, uncertainty, correction, acceptance, rejection, cancellation and evidence references.
- 21/21 distinct live browser scenarios passed their final visible field/status assertions. Raw iterations remain saved, including the initial rate-limit and display-assertion failures.
- Additional browser checks covered staff edits and conflicts, approval, source navigation, refresh persistence, interrupted analysis recovery, reset and empty start.
- Responsive checks at widths 320, 390, 1024 and 1440 found no horizontal overflow; mobile conversation/review navigation and the import dialog were exercised.
- Public home page returned HTTP 200; the internal evaluation page returned 404.
- The README screenshot is a new capture of the deployed application with a synthetic booking conversation. Public presentation contains no benchmark results or internal research commentary.

Evidence: `../results/live-scenarios-deployed-grounded-v6-release-production.json` and `../results/browser-scenarios-release.json`.

Earlier production attempts are retained: a burst exceeded the rate limit, and a later run exposed a cancelled time being revived. The final paced run passed after the deterministic cancellation fix. Two initial v6 evaluation selections were interrupted when the missing reference-date argument was discovered; their selection manifests are retained, but they have no completed results and are not counted as passing runs.

## Remaining verification limits

- Native download delivery was not verified: the in-app browser did not emit a download event after the text/JSON controls were clicked. The application uses a connected download anchor and Blob URL, but no captured file from that check is claimed as evidence.
- No recruited-user study was performed. Browser task checks are engineering verification, not evidence of restaurant staff usability.
- Small samples and model variability limit generalisation. Passing these scenarios cannot establish that arbitrary future conversations will always be correct. Unresolved or conflicting details require human review.
