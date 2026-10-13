# Restaurant Workspace Implementation Plan

**Goal:** Deliver guest intake and review, staff operations, restaurant information and explicitly simulated channel and reservation connectors.

**Architecture:** Keep the existing guarded booking desk. Add a private team console backed by a versioned Supabase operations record, with separate hashed guest-review tokens. Public routes receive only published restaurant information or a minimal review snapshot. All guest changes return to staff review.

**Stack:** Existing Next.js, TypeScript, Supabase and OpenAI versions. Existing Free Supabase project and Vercel deployment. No new paid services.

**Spec:** The user's ten-feature list and subsequent instruction to build mock connectors.

## Constraints

- Retain the restaurant visual direction and existing extraction behaviour.
- Email, WhatsApp and booking providers are simulations; never send real messages or claim a real reservation.
- A guest link never exposes staff notes, conversations, other cases or guest contact details.
- Owner controls roles; owner and manager control restaurant publishing and connectors. Staff can review enquiries and record explicit guest merges.
- Anonymous device users may upgrade to verified email accounts; no fabricated delivery or Google sign-in claims.
- Preserve concurrent changes with version checks. Keep failed submissions retryable and use idempotency keys.
- README contains product information, setup and useful examples, without internal project commentary.

## Review focus

Cross-team reads and writes; stale or revoked review tokens; guest edits to already reviewed briefs; duplicate connector delivery; guest preferences mistakenly treated as confirmed fulfilment.

## Task 1: Operations domain and connector contracts

Files: `lib/restaurant-desk.ts`, `lib/mock-connectors.ts`, `tests/restaurant-desk.test.ts`.

- [ ] Write failing tests for role restrictions, due-time escalation, unsupported care quotations, explicit guest merging, idempotent mock delivery and unreviewed reservation handoffs.
- [ ] Implement validated operations records, approved knowledge, workflow, guest history, care proposals and deterministic simulated provider results.
- [ ] Run the targeted tests and full test suite; commit.

## Task 2: Supabase isolation and guest tokens

Files: new migration; `lib/server/restaurant-db.ts`; `scripts/verify-restaurant-workspace.ts`.

- [ ] Add owner/manager/staff roles, display names, versioned operations records, private review tokens and atomic guest-intake/change functions.
- [ ] Apply the migration to the existing Free project.
- [ ] Verify real database isolation, role enforcement, concurrent writes, expiry/revocation and guest-change review. Commit.

## Task 3: Staff console and recoverable accounts

Files: `app/team/`, `components/team/`, `hooks/use-restaurant-desk.ts`, existing desk and team dialog.

- [ ] Build overview, inbox, workflow, comments, guest history, restaurant library, people and connections views.
- [ ] Add precise reminders, in-app notifications and overdue escalation.
- [ ] Add verified email registration, password recovery and device-account email upgrade; display provider errors accurately.
- [ ] Wire cases between the console and booking desk without replacing an unsaved draft silently.
- [ ] Verify browser tasks and responsive layout; commit.

## Task 4: Guest assistant, review and care

Files: `app/guest/[slug]/`, `app/review/`, `app/api/restaurant/`, `public/formbridge-widget.js`, care suggestion UI.

- [ ] Publish a branded intake assistant and embeddable widget using approved facts only.
- [ ] Submit requests to the team inbox; create private, expiring guest review links; return corrections for review.
- [ ] Extract source-linked guest-care proposals and require staff acceptance.
- [ ] Verify real OpenAI requests and public browser flows, invalid links and unpublished libraries. Commit.

## Task 5: Final audit and release

- [ ] Run all local gates and real backend/provider checks.
- [ ] Review the full diff independently; fix material findings with regression tests.
- [ ] Deploy the exact committed candidate, then exercise at least 20 live workflows and 15 edge cases.
- [ ] Preserve observed results and describe remaining provider or hardware boundaries honestly.

## Task 6: Product README and films

- [ ] Update product copy and screenshots from the final deployment.
- [ ] Make fresh launch and walkthrough films showing the updated product and its clearly labelled simulations.
- [ ] Verify audio/video decoding, native GitHub playback, CI and the final production revision.
