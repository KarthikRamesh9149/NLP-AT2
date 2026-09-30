# FormBridge extraction upgrade: frozen verification protocol

Prepared 1 October 2026, before running upgraded test predictions.

## Target and scope

At least 15 of the original 20 SGD test dialogue prefixes must have all five final field values correct under the original value scorer. Date correctness is also reported separately. This is final five-field value agreement, **not** the count of briefs approved for handoff, not official full-SGD JGA, and not a guarantee on arbitrary conversations. Dates missing a year require human clarification even when their known month/day agrees with the label.

Preserve `sgd-test-20.json`, its selected dialogue IDs, original baseline predictions and original matching rules. The original sample was previously inspected; it is a regression sample, not new independent evidence. Do not add any test dialogue, expected value, or dataset-specific default to the extractor. Do not change extraction after inspecting test errors to claim a fresh held-out result on the same data.

## Development

Initial development: official SGD development split, 10 dialogues selected by the existing seeded ordering; `sgd-dev-10-grounded-luna-pilot.json`. Existing synthetic regression suite: 20 cases. Training/development transcripts informed generic confirmation rules. In the development pilot, all five non-date fields/explicit month-day dates were extracted correctly; 5 date mismatches reflect unresolved historical relative dates ('today' or a weekday) when no reference date is supplied.

## Frozen pipeline

- GPT-6 Luna via Responses API, reasoning low, strict Zod schema, bounded output, server-only existing OpenAI key, store false.
- Reconstruct the five-field state from the entire visible conversation, with exact supporting quotes and IDs. No previous model output is evidence.
- Validate actual quote presence and value support; a staff value requires a subsequent customer acceptance. Preserve manual overrides and report conflicts.
- Deterministically canonicalise dates/times without inventing missing years or periods. Preserve ranges/alternatives, rejected offers and cancellations.
- Field history changes only when values/status/constraints change. Staff review remains separate from any reservation action.

Configurable `FORMBRIDGE_MODEL` is separate from `OPENAI_MODEL` for the direct contextual baseline. Baseline remains gpt-4.1-mini-2025-04-14 to preserve the old comparison. GPT-6 Luna has no published dated snapshot in the current official docs; each report records the returned model name, timestamp, prompt version and code fingerprint. This is not bit-for-bit reproducibility across model provider updates.

## Final verification

1. Original 20 test dialogues, same ordered prefixes/5 fields/basic value normalisation, FormBridge rerun; compare with saved original results.
2. 20 previously unselected eligible test dialogues: exclude original IDs and use seed `formbridge-unseen-2026-10-01-v1`; run rules, direct baseline and upgraded FormBridge on identical visible prefixes. Run once after freeze.
3. Preserve denominator for failed attempts, save usage/latency and predictions under unique filenames, never overwrite an earlier result.
4. At least 20 synthetic behaviour scenarios on the deployed production endpoint; additional targeted unit checks for grounding, calendar handling, imports, approvals and browser restoration. Inspect real UI flows on desktop and mobile.
5. No gold labels or future messages are supplied to the API. Automatic scores exclude manual edits. No participant/user-study outcomes are inferred from automated UI tests.

## Sources and design rationale

OpenAI structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
OpenAI current model guidance: https://developers.openai.com/api/docs/guides/latest-model
GPT-6 Luna specifications: https://developers.openai.com/api/docs/models/gpt-6-luna
ReacTOD (ACL TrustNLP 2026): https://arxiv.org/abs/2605.19077

ReacTOD supports the general use of bounded model reasoning plus deterministic validation for dialogue tracking. FormBridge independently implements full-context state extraction with quotes and deterministic reconciliation; it does not reproduce that paper's experiments, training or reported benchmark numbers. Current OpenAI guidance recommends experimenting on the actual task; GPT-6 Luna is available to this project's account and passed the initial synthetic API run. Its use here is a workload choice, not a claim that it is the highest-capability OpenAI model.
