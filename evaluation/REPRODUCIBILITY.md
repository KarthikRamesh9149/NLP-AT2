# Assessment reproducibility guide

This guide supports the AT2 technical evidence. It is separate from the product README and does not constitute the group's report. Follow the frozen protocol in `research/assessment-final-protocol.md` before using results in the report.

## 1. Obtain the application

The repository is private. An assessor needs repository access or an exported source archive; the public webapp does not grant source access.

```bash
git clone https://github.com/KarthikRamesh9149/NLP-AT2.git
cd NLP-AT2
git checkout 32af459b6a1cd20ede9b08c2b73c20a0c385301e
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Prerequisites: Node.js 24, pnpm 11.24.0, Git, an OpenAI API project with access to the configured models, and network access. Add your own `OPENAI_API_KEY` in `.env.local`. Never include a real key in a submission archive. The example works without a key; new analysis and model evaluation require one.

The pinned commit contains the extractor and runner used for the saved assessment experiments, including the equal-model comparison. Later product releases change that implementation and do not inherit those benchmark scores. Use the pinned commit to reproduce those historical runs; use `main` for the current application and its separate release checks. API model aliases can change at the provider; saved predictions, model names, timestamps and fingerprints support auditing, but a rerun is not guaranteed to be identical.

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm start
```

Open `http://localhost:3000`. For development use `pnpm dev`. An already-running `pnpm start` process does not load a newly built server automatically: stop and restart it after rebuilding.

### Current product release

To run the latest booking desk, check out `main`. Team cases and the production server require the Supabase URL, publishable key and server secret from `.env.example`, with all migrations applied to a dedicated project. Device sign-in is optional and requires the provider setting plus `NEXT_PUBLIC_DEVICE_SIGN_IN_ENABLED=true`. `pnpm dev` can run with device-only cases when Supabase is absent; production analysis deliberately refuses requests without its shared quota database. See `docs/OPERATIONS.md` for setup and allowance behaviour.

The October 13 product checks cover cancellation, evidence, dates, family headcounts, acceptance scope and bounded recovery from transient provider failures. Constructed scenarios and current-code reruns of the original dataset selection are retained separately from the earlier assessment benchmark runs. A rerun of an inspected selection remains regression evidence.

## 2. Obtain the exact dataset revision

```bash
git clone https://github.com/google-research-datasets/dstc8-schema-guided-dialogue.git ../formbridge-sgd
git -C ../formbridge-sgd checkout e852981ae34990f4358979625854259302feaa78
pnpm data:audit ../formbridge-sgd
```

Source: Google's Schema-Guided Dialogue dataset. The upstream `LICENSE.txt` specifies Creative Commons Attribution-ShareAlike 4.0 International; retain upstream attribution and licensing for dataset-derived material. `DATA_LICENSE.txt` is a copy of that license. The application source is not claimed to be the dataset's original work. Data can stay outside the application repository.

The audit at this revision identifies 367 eligible single-service restaurant reservation dialogues in train, 73 in dev and 73 in test. Train uses `Restaurants_1`; dev and test use `Restaurants_2`. The loader maps `city` to `location` and `party_size` to `number_of_seats` for the latter. This is one restaurant domain with split-specific schemas, not a full-domain SGD benchmark.

Eligibility: exactly one service, matching restaurant service, at least one customer frame with active intent `ReserveRestaurant`, and at most 30 messages. Evaluation stops at the last reservation customer turn. Dataset slot values are used only for scoring; the extractor sees speaker-labelled utterances and null historical reference date. It does not receive labels, dataset defaults, future messages or today's date.

## 3. Reproduce the final production-configuration checks

These commands call the same analyzer directly with real OpenAI requests. `in-process` avoids public endpoint rate limits and binds the recorded model settings to the evaluated process. They test extraction, not deployment/network availability; the separate live-browser evidence covers the deployed interface.

Use a unique `--tag` for each rerun. Selection and final report files refuse overwrites. The commands below use tags prefixed `reproduce-`; change them for a second attempt. Do not select the best result from repeated attempts.

### Original 20-dialogue regression sample

```bash
OPENAI_MODEL=gpt-6-luna \
FORMBRIDGE_MODEL=gpt-6-luna \
FORMBRIDGE_REPAIR_MODEL=gpt-6.1-sol \
node --env-file=.env.local --import tsx scripts/evaluate.ts ../formbridge-sgd \
  --transport=in-process --replay=all-user-turns \
  --split=test --sample=20 --modes=formbridge \
  --selection=evaluation/results/selection-grounded-v6-release-regression.json \
  --tag=reproduce-final-regression
```

This sample has been inspected during development. Its result is regression evidence, not an unseen test.

### Previous 20-dialogue development selection

```bash
OPENAI_MODEL=gpt-6-luna \
FORMBRIDGE_MODEL=gpt-6-luna \
FORMBRIDGE_REPAIR_MODEL=gpt-6.1-sol \
node --env-file=.env.local --import tsx scripts/evaluate.ts ../formbridge-sgd \
  --transport=in-process --replay=all-user-turns \
  --split=dev --sample=20 --modes=formbridge \
  --selection=evaluation/results/selection-grounded-v6-release-heldout-development.json \
  --tag=reproduce-final-development
```

This selection was used repeatedly for development checks. Do not describe it as a fresh untouched test on each rerun.

## 4. Reproduce the equal-model comparison

Rules, direct extraction and FormBridge receive identical visible customer prefixes in identical order. Each method's final state is scored against the same five fields. The rules use no model. Both model systems use GPT-6 Luna with low reasoning; FormBridge's one permitted repair also uses Luna for these comparison runs. Production uses Sol for repair, so these controlled comparisons are deliberately separate from the production-configuration checks above.

### Same 20 development dialogues

```bash
OPENAI_MODEL=gpt-6-luna \
FORMBRIDGE_MODEL=gpt-6-luna \
FORMBRIDGE_REPAIR_MODEL=gpt-6-luna \
node --env-file=.env.local --import tsx scripts/evaluate.ts ../formbridge-sgd \
  --transport=in-process --replay=all-user-turns \
  --split=dev --sample=20 --modes=rules,model,formbridge \
  --selection=evaluation/results/selection-grounded-v6-release-heldout-development.json \
  --tag=reproduce-equal-model-development
```

### All 13 previously unselected eligible test dialogues

```bash
OPENAI_MODEL=gpt-6-luna \
FORMBRIDGE_MODEL=gpt-6-luna \
FORMBRIDGE_REPAIR_MODEL=gpt-6-luna \
node --env-file=.env.local --import tsx scripts/evaluate.ts ../formbridge-sgd \
  --transport=in-process --replay=all-user-turns \
  --split=test --sample=13 --modes=rules,model,formbridge \
  --exclude=evaluation/research/exclude-prior-test-20261001.json \
  --seed=assessment-unselected-20261001 \
  --tag=reproduce-equal-model-unselected
```

The exclusion list includes all 60 IDs previously selected in saved test runs, including interrupted selections. The remaining 13 are the complete eligible remainder, not a hand-picked subset. They were first evaluated after the final protocol was frozen; subsequent reruns of them are regression checks. Their size limits generalisation.

This compares complete approaches. Prompt detail, quote generation and the extra repair remain different; it does not isolate the contribution of evidence validation alone. The old Mini baseline remains preserved as historical evidence and is not treated as a same-model control.

## 5. Read the output correctly

Each run writes:

- `selection-<tag>.json`: split, ordered IDs, excluded IDs, models, replay policy, extractor and runner fingerprints, written before inference.
- `progress-<tag>.json`: completed dialogues during the run. Partial progress alone is not a completed experiment.
- `sgd-<split>-<count>-<tag>.json`: final scores, every prediction, errors, states, source IDs and per-prefix usage/latency.

Field accuracy uses five checks per attempted dialogue. A 20-dialogue sample therefore contains 100 checks; the 13-dialogue sample contains 65. Complete-state accuracy requires all five final values to match. Strict matching retains the original normalisation rule; canonical matching additionally accepts equivalent calendar/clock representations without inventing missing years or AM/PM. Both are reported. A date may match a historical label while remaining unresolved for staff approval.

Failures stay in accuracy denominators. Request and usage totals describe completed replay predictions; a terminally failed replay can have partially consumed, unreported usage. A failed repair is flagged in the turn trace and counted as an attempted provider call. Latency is the sum of all prefix requests for a complete dialogue, including repair waiting, not a single-message time. Observed token totals are not an invoice or full account spend.

Current runs also record `incompleteUsageDialogues`. A successful fallback after an interrupted request can have unknown usage for the failed call. Its attempted call is counted, its unknown tokens are not replaced with invented numbers, and the known token totals are a lower bound. The production allowance retains the full reservation for such requests.

Gold labels and automatic predictions are stored separately from model inputs. Staff edits are excluded from these automatic scores. No benchmark answer table or dialogue-specific shortcut is used in the extractor. A source fingerprint change during extraction invalidates the final report.

## 6. Reproduce functional and export checks

`browser-cases-35.json` freezes 20 ordinary enquiries and 15 edges. `results/browser-use-35-final.json` records their final live run; raw attempts remain in `browser-use-35-iterations.json`. These are authored functional scenarios, not random customer traffic, a recruited-user study or an SGD accuracy score.

For API scenarios, run the app locally in a separate terminal and then:

```bash
FORMBRIDGE_URL=http://localhost:3000 pnpm scenario:live
```

For manual browser verification:

1. Enter `Four guests at Juniper in Sydney on 9 October 2026 at 7 pm.` in an empty workspace.
2. Check all five values and their source links. Download the draft text.
3. Approve the brief; download text and JSON. Open both files and check the values, transcript and reviewed status.
4. Add `Actually, five guests and sometime after 8 pm instead.` Wait for analysis. Verify five guests, unresolved exact time, the after-eight constraint, and approval disabled.
5. Download draft JSON; confirm a draft status, null exact time, preserved constraint and the updated history.
6. Refresh, inspect a source, and use keyboard navigation in the edit dialog. Test mobile conversation/brief switching.

The native browser may open a Save As dialog. Complete that dialog before waiting for a file. A browser-tool download event timeout alone does not prove the app failed to generate a download. Actual verified files and hashes are recorded separately in the final evidence package.

## 7. Assessment handover

Provide an accessible source archive/repository, locked dependencies, `.env.example`, this guide, frozen selections, final result files, the deployed URL and access instructions. Run setup from a clean checkout with your own key. Do not include `.env.local`, dependency folders or generated build files.

The group's separate 10–15-page report should justify the methods, interpret actual results and limitations, describe the application and individual contributions, and cover the brief's remaining sections. Every team member completes SPARKPlus. A real-user study requires actual participants and consent; browser automation cannot substitute for those observations. Keep benchmark and assessment commentary out of the product UI and README.
