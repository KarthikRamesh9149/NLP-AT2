# Final assessment evidence verification

Completed 1 October 2026. This is an engineering evidence index, not the group's coursework report.

## Frozen candidate

- Application and runner commit: `32af459b6a1cd20ede9b08c2b73c20a0c385301e`.
- Extraction SHA-256: `a1113cf69b4d8ab94586a6e02c4cafba988c919dfcd4496e37ac269d0a16dbf6`.
- Runner SHA-256: `8d35ba98fb2dc0934e72a076df5d7e235b67b0e362beb3b5772a446e48f9cc9f`.
- All four reports match these current fingerprints. No extraction/prompt/scoring edits occurred after the protocol was frozen or while provider runs executed.
- Code deployment: `dpl_D7JS4bbKPga6eAdS89JPBx7L7u8b`, READY on the public production alias. GitHub Actions `36822521811` succeeded for this candidate.
- Subsequent documentation/evidence commits are verified separately at handover; they do not alter the evaluated code.

## A. Refreshed production-configuration evaluation

Primary GPT-6 Luna; at most one GPT-6.1 Sol repair per prefix.

| Selection | Correct fields | Complete five-field states | Terminal failures | Failed repair warnings |
| --- | --- | --- | --- | --- |
| Inspected original regression sample | 100/100 | 20/20 | 0/20 | 0 |
| Previous development selection | 96/100 | 17/20 | 0/20 | 2 |

Strict and canonical scores are identical for these two FormBridge runs. The original regression selection was used in development; its perfect score is not evidence of perfect unseen accuracy. The development selection was also repeatedly evaluated and remains development evidence.

Two bounded repairs in the production development run failed; the analyzer retained validated first-pass state and returned review warnings. Those warnings remain in the saved per-prefix traces. No complete dialogue failed. Returned token totals cannot include unreported billing for failed requests.

Reports: `../results/sgd-test-20-assessment-final-regression.json` and `../results/sgd-dev-20-assessment-final-development.json`.

## B. Equal-model comparison

Rules, direct extraction and FormBridge see identical customer prefixes. Both AI methods and every controlled repair use GPT-6 Luna with low reasoning. Provider-returned model names and prefix IDs were checked. Production's Sol repair configuration is evaluated separately above.

| Sample / method | Strict fields | Canonical fields | Strict complete states | Canonical complete states |
| --- | --- | --- | --- | --- |
| Development 20 / rules | 35/100 | 35/100 | 0/20 | 0/20 |
| Development 20 / direct model | 86/100 | 92/100 | 9/20 | 14/20 |
| Development 20 / FormBridge | 92/100 | 92/100 | 14/20 | 14/20 |
| Previously unselected 13 / rules | 25/65 | 25/65 | 0/13 | 0/13 |
| Previously unselected 13 / direct model | 56/65 | 62/65 | 6/13 | 12/13 |
| Previously unselected 13 / FormBridge | 62/65 | 62/65 | 12/13 | 12/13 |

All modes completed without terminal failures or repair warnings in these controlled comparisons. The 13 cases were the entire eligible remainder after excluding all 60 previously selected test IDs, including interrupted selections. They were evaluated once after freeze, with no post-result tuning. Future reuse makes them regression data.

The two AI systems tie after canonical matching on both samples. The strict-score advantage is representation consistency, not proof of greater semantic accuracy. Evidence generation, prompts and repair remain system differences; this is not an ablation isolating validation alone. Values matching historical dates can still need clarification before approval.

| Sample / AI method | Analysis requests | Provider attempts | Observed input / output tokens | Mean complete-dialogue replay |
| --- | --- | --- | --- | --- |
| Development / direct | 166 | 166 | 93,947 / 22,893 | 23.835 s |
| Development / FormBridge | 166 | 170 | 295,908 / 57,475 | 31.852 s |
| Unselected / direct | 98 | 98 | 55,253 / 11,989 | 20.576 s |
| Unselected / FormBridge | 98 | 101 | 176,247 / 37,395 | 30.754 s |

FormBridge uses more time and tokens. A justified report should explain the value of sources, uncertainty and human review alongside that tradeoff. These are complete replay times across multiple user turns, not single-message latency. Runs shared provider capacity concurrently; timings are observed comparisons, not controlled isolated throughput measurements. Tokens are observed usage, not invoices.

Reports: `../results/sgd-dev-20-assessment-equal-model-development.json` and `../results/sgd-test-13-assessment-equal-model-unselected.json`. Machine-readable verified aggregate: `../results/assessment-summary.json`; report-ready values: `../results/assessment-summary.csv`.

## C. Reproducibility

`../REPRODUCIBILITY.md` documents the source commit, locked dependency installation, exact dataset revision and license, eligibility/slot mapping, models, each evaluation command, selection files, scorer interpretation, usage limitations, export checks and assessment handover.

Verified from a new Git archive of the pinned commit with a fresh dependency installation and no private environment file: 53 tests passed, TypeScript passed and production build passed. The main working checkout also passed those gates. Real model runs separately used the existing private server key; no key is included in this evidence package.

## D. Native downloaded files

Four files were generated by controls on the public webapp, saved through Brave's native Save As dialog, opened from disk and checked. They were not reconstructed from application state or generated by the verification script.

- Draft text: five values, customer transcript, draft label and reservation boundary.
- Approved text: five values, transcript and staff-reviewed label.
- Approved JSON: approved status, values, messages, valid evidence IDs, history and export timestamp.
- Revised draft JSON: guests changed from 4 to 5; exact time became null with an after-eight constraint; approval cleared; both messages and all seven history updates retained.

The revised draft also restored correctly after a production-page reload. Actual bytes, SHA-256 hashes and checks are saved in `../results/download-verification-20261001.json` and `../results/downloads/`. The prior download-event timeouts were a browser observation limitation; native file delivery is now verified.

## Assessment boundary

All four technical gaps identified in the brief review are addressed. The live app and product README contain no new internal evaluation material. The earlier 35 live functional cases remain separate from these dataset scores.

No recruited-user study, group report, poster or SPARKPlus submission was performed in this unit of work. The brief does not mandate a recruited-user study; actual user feedback would still strengthen ease-of-use evidence. The results do not establish universal accuracy, availability or a guaranteed grade.
