# FormBridge

FormBridge turns a text conversation about a restaurant reservation into a staff-reviewed booking brief. It tracks corrections, leaves uncertain details unresolved, shows which messages support each field, and asks one useful clarification question. Approving a brief **does not place a reservation**.

This repository contains the web app, the rule baseline, the contextual OpenAI baseline, the FormBridge update pipeline, regression scenarios, and evaluation scripts. The coursework report and poster are outside this repository.

## Run locally

Requirements: Node.js 24 and pnpm 11.24.0.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Set `OPENAI_API_KEY` in `.env.local` to analyse new customer messages. The example starts with a saved synthetic state and works without an API key. The key is used only on the server and `.env.local` is ignored by Git. The pinned default model is `gpt-4.1-mini-2025-04-14`; change `OPENAI_MODEL` only when intentionally starting a new evaluation configuration.

Open <http://localhost:3000>. The app stores the current draft in browser tab session storage. **Use synthetic examples only**; there is no customer account, database, or real booking integration.

## What to try

1. The example begins with four people at 7 pm, corrected to five people sometime after 8 pm. The exact time remains unresolved.
2. Add a staff message: `Would 8:30 pm suit you?` The brief should remain unresolved.
3. Add a customer message: `Yes, that works for us.` The time should resolve to 8:30 pm and link to both messages.
4. Click a field to inspect evidence, edit a field as staff, approve the five-field brief, and download its JSON.
5. Visit `/evaluation` to compare three approaches on the same synthetic conversation.

The five fields are restaurant, city, date, exact time, and party size. The state manager applies model-proposed updates only when they cite the latest customer turn, refer to known message IDs, and pass field checks. A relative weekday without a calendar date remains a clarification. Staff edits cannot be silently overwritten by a later model proposal. Evidence checks verify structure and recency; they do not prove every sentence semantically supports the value. Human review remains necessary.

## Checks and reproducibility

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm scenario:live
```

`scenario:live` calls the running app endpoint for 20 team-authored synthetic conversations and saves every result to `evaluation/results/live-scenarios.json`. It requires an OpenAI key for contextual cases. The scenario set is a regression test, not a sample of real restaurant traffic. The saved output records the pinned model and token usage. The test runner compares equivalent clock formats, such as 19:00 and 7 pm, as equal.

For the public deployment, set `FORMBRIDGE_URL=https://formbridge-nlp-at2.vercel.app` before running `pnpm scenario:live`. The saved report records the URL and field-level outcomes. If a future deployment is protected, the runner also accepts `FORMBRIDGE_BYPASS_SECRET` and sends it as a header; never commit or print that secret.

For the [Google Schema-Guided Dialogue dataset](https://github.com/google-research-datasets/dstc8-schema-guided-dialogue), clone the official repository outside this Git repository and run:

```bash
pnpm data:audit /path/to/dstc8-schema-guided-dialogue
pnpm eval /path/to/dstc8-schema-guided-dialogue --split=test --sample=20
```

The audit maps `Restaurants_1` in train to `Restaurants_2` in development and test. The latter uses `location` for city and `number_of_seats` for party size. Eligibility is limited to single-service dialogues that contain `ReserveRestaurant` user turns. The evaluation runs the rule and direct-model baselines on the same final visible conversation prefix, and FormBridge turn by turn on that prefix. It compares the five field values against the final user-turn state, without reading gold labels during prediction. Schema defaults are never inserted as customer statements. This is **not** an official full-SGD leaderboard score; the task, fields, subset, and abstention policy differ. The dataset is licensed CC BY-SA 4.0; follow its attribution and sharing terms if redistributing any source data.

Generated result files live in `evaluation/results/`. Each records its scope and configuration. The SGD source files themselves are not committed.

## Technical layout

- `app/page.tsx`: review workspace and browser-only draft session.
- `app/evaluation/page.tsx`: interactive comparison.
- `app/api/analyze/route.ts`: validated server endpoint.
- `lib/ai.ts`: OpenAI structured extraction, with `store: false`.
- `lib/rules.ts`: deterministic baseline.
- `lib/state.ts`: booking state, corrections, evidence guard, manual edits, approval.
- `lib/engine.ts`: rules, direct model, and FormBridge modes.
- `evaluation/scenarios.ts`: synthetic regression cases.
- `scripts/`: live scenario runner, SGD audit, and comparison runner.

## Public deployment and API limit

The production site is <https://formbridge-nlp-at2.vercel.app>. Vercel Authentication is disabled so visitors can open it without signing in. The OpenAI API key is a server-only Vercel environment variable and must never be exposed in browser code or Git.

The Vercel Firewall has an enabled production rule named **Limit FormBridge analysis**: match the exact path `/api/analyze` and rate limit by IP to **40 requests per 60 seconds**, returning HTTP 429 after the limit. This rule is Vercel project configuration, not repository code; recreate and publish it when deploying this repository to a different Vercel project. The route also validates input size and shape and has a best-effort in-process limit of 60 requests per minute per apparent IP. The firewall is the effective shared limit across serverless instances. A per-IP limit does not cap total usage across many IPs, so monitor OpenAI usage when sharing the demo publicly.

`store: false` requests no stored Responses object; provider processing and retention policies still apply. Do not log or enter real customer details in this coursework demo.

## Known limits

The app is a human-reviewed brief, not a booking system. It does not verify restaurant availability, location, or opening hours. A model can still propose an unsupported value with a real but irrelevant message ID; the structural guard cannot prove semantic support. The in-process API throttling is only a best-effort safeguard across serverless instances; the production firewall rule provides the shared per-IP limit. Relative dates without an unambiguous calendar date are deliberately held for clarification. The rule baseline supports common explicit English patterns, not every phrasing or language.
