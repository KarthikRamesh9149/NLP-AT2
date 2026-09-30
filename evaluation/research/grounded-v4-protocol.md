# Grounded state v4 verification

Frozen on 1 October 2026 after development-only changes and before v4 test runs.

## Changes from the initial protocol

The v2 Luna pilot improved the original regression sample to 92/100 fields and 14/20 complete value states; a separate 20-dialogue sample reached 93/100 and 16/20. A Sol-first v3 development pilot was slower, lost two restaurant acceptances and had one HTTP 503. Those results are retained, not suppressed.

Development debugging found a narrow acceptance regex and loss of relative date expressions. V4 uses Luna for primary extraction and Sol for one validator-directed second check. Full context, actual supporting quotes, deterministic validation, chronology checks and manual override preservation remain. A second-check failure retains only validated first-response fields and displays a review warning; a primary failure still leaves the previous brief untouched. Requests have bounded timeouts below the 30-second server limit.

V4 retains a customer-stated relative date expression as its value with `needs_clarification`. This preserves what was said without inventing an exact calendar date. Full approval still requires a resolved calendar date. Ranges and alternatives keep value null. The synthetic Friday case now expects its visible expression with unresolved status, reflecting this explicit representation change. Old scenario reports remain intact.

The first v4 development run reached 49/50 fields and 9/10 complete value states. Its runner was started before metadata corrections and therefore carries stale model/version metadata; the actual returned usage model is Luna. This pilot is development evidence only. The remaining missed accepted party size led to a generic missing-confirmation validator check.

## Frozen evaluation

- Original 20 IDs and original strict scorer are retained for regression comparison.
- A new 20-dialogue sample excludes both the original IDs and the previous v2 validation IDs. Seed: `formbridge-unseen-2026-10-01-v4`. Selection manifests are written before any model requests.
- No label, future turn, restaurant catalog or dataset default enters extraction. Baseline remains the original GPT-4.1 Mini configuration. Rules, baseline and FormBridge use the same final visible prefixes; FormBridge additionally updates across earlier user prefixes as it does in the application.
- Report the unchanged strict value score beside deterministic canonical representation matching. The latter recognises month/day order, ISO dates and explicitly equivalent clock expressions, and never supplies a missing year, period or venue token. Do not describe a scoring-only gain as an extraction gain.
- Scores describe five-field value agreement. A partial or relative date can match the dataset value while still requiring human clarification; this is not an approved booking or official full-SGD leaderboard result.
- Keep failed attempts in denominators. Stored token totals cover successful responses, not failed-response billing. Record source fingerprints and refuse a report if extraction source changes during its run.
- Run 30 synthetic scenarios against the final deployed endpoint, plus browser checks for import, corrections, sources, staff edits, approval, download, refresh and responsive layouts. Do not infer a user study from browser automation.

Provider docs: https://developers.openai.com/api/docs/guides/structured-outputs and https://developers.openai.com/api/docs/models/gpt-6-luna . Primary and repair aliases have no dated snapshots in current documentation, so provider updates can still affect replay.
