# Operating FormBridge

## Configuration

Use the names in `.env.example`. Keep `OPENAI_API_KEY` and `SUPABASE_SECRET_KEY` on the server. Only the Supabase URL and publishable key are exposed to browsers. Production analysis fails closed if its shared quota database is unavailable.

Apply `supabase/migrations/` in filename order to a dedicated project. The public tables contain workspace metadata, membership and saved enquiries. Private tables hold hashed invitation codes and API allowance records. Members read only their own team; all case writes go through authorised functions with a version check.

Enable the authentication options used by your team in Supabase. Device sign-in requires **Allow anonymous sign-ins** and `NEXT_PUBLIC_DEVICE_SIGN_IN_ENABLED=true` before rebuilding the frontend. It creates a signed identity in that browser; it grants no membership in existing workspaces. Email/password sign-in requires a provisioned, verified account. Supabase's default mail service does not support a general public email onboarding flow; configure a suitable SMTP provider before offering that flow.

## Analysis allowance

`private.fb_quota_policy` starts with an estimated US$1 per UTC day, US$5 per calendar month and 30 requests per IP per minute. These apply to extraction and assistant requests together. The server reserves enough for its configured primary and repair calls before contacting OpenAI, then settles known completed usage. An uncertain failed call retains its reservation.

The calculation is an application allowance, not an account-wide OpenAI billing guarantee. Keep provider pricing current before changing model settings. The current configuration explicitly uses the standard service tier, with a price margin. Unknown model prices are rejected.

Extraction makes at most two provider requests: a primary check and either a validation repair or recovery from a transient timeout, connection failure or server error. Recovery uses the configured repair model and applies the same evidence checks. Authentication and other non-transient failures stop immediately. A recovered request with unknown primary usage keeps its full allowance reservation; reported tokens cover only completed calls. Both failed calls leave the previous valid brief intact for retry or manual review.

## Saved enquiries

An active draft uses session storage; device cases use local storage. Team cases use Supabase. Staff notes are stored with the case and are separate from extracted booking details. Exported JSON includes the transcript. Reopening JSON discards its approval and checks the conversation again. Saved model-derived briefs from older validation versions also require a fresh check before approval; their transcript and staff notes are preserved.

A simultaneous team edit can fail with a stale-version message. Keep the active draft, save a device copy if needed, refresh the enquiry book, and reopen the team version before deciding how to combine the changes.

Device identities do not provide account recovery. Keep a private invitation code before signing out or clearing browser data. Invitations expire after seven days and a new code replaces the previous one.

## Booking providers

The app accepts venue-specific HTTPS pages for OpenTable, Resy, SevenRooms and TheFork. Opening a page does not transfer fields, check availability or make a reservation. A direct booking integration needs authorised provider access, a participating venue and sandbox validation before implementation.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm scenario:live --tag=your-unique-tag --concurrency=1 --pace=2000
```

The scenario runner calls real extraction endpoints. Its constructed cases are functional regression checks, not a measure of general unseen accuracy. The dataset protocol is in `evaluation/REPRODUCIBILITY.md`. Previously saved results remain tied to the code fingerprint recorded in each output.

`RUN_SUPABASE_VERIFICATION=1 pnpm exec tsx scripts/verify-team-backend.ts` creates isolated synthetic accounts and workspaces in the configured FormBridge project, then records their IDs for scoped cleanup. It sends no customer emails. Run it only against the dedicated verification project.

## Security

Supabase row-level security protects case reads; membership checks protect writes. The server key is excluded from browser bundles and Git. Conversation text is untrusted model input, and model output is checked before updating the brief. Human approval applies to a brief, never a real reservation.

On the free Supabase plan, leaked-password protection is [unavailable](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The provider's security advisor reports that limitation for email/password accounts. Device sign-in has no password, and membership isolation remains enforced.
