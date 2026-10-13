# Operating FormBridge

## Configuration

Use the names in `.env.example`. Keep `OPENAI_API_KEY` and `SUPABASE_SECRET_KEY` on the server. Only the Supabase URL and publishable key are exposed to browsers. Production analysis fails closed if its shared quota database is unavailable.

Apply `supabase/migrations/` in filename order to a dedicated project. The public tables contain workspace metadata, membership and saved enquiries. Private tables hold hashed invitation codes and API allowance records. Members read only their own team; all case writes go through authorised functions with a version check.

Enable the authentication options used by your team in Supabase. Device sign-in requires **Allow anonymous sign-ins** and `NEXT_PUBLIC_DEVICE_SIGN_IN_ENABLED=true` before rebuilding the frontend. It creates a signed identity in that browser; it grants no membership in existing workspaces. Email/password sign-in requires a provisioned, verified account. Supabase's default mail service does not support a general public email onboarding flow; configure a suitable SMTP provider before offering that flow.

For email registration, recovery and device-account upgrades, configure a verified sending domain in Supabase Auth, keep email confirmation enabled, and allow `https://your-domain/auth` as a redirect. Verify a real signup, recovery email and account upgrade before setting `NEXT_PUBLIC_EMAIL_DELIVERY_ENABLED=true` and rebuilding. Leave it false while delivery is unavailable. Existing verified accounts can still sign in. The checked-in verification runner tests a synthetic account confirmed through the admin API; it does not prove email delivery.

## Restaurant workspace

The team desk adds a restaurant library, an enquiry inbox, guest records, staff assignments and comments. Owners and managers can change restaurant information and connector settings; only the owner can change teammate roles. Members can work on enquiries. A workspace cannot be joined without its private invitation code.

Publish the restaurant name, city and approved facts to open `/guest/<slug>`. The guest assistant answers questions from approved information, gathers booking requests and returns requests to the private inbox after the guest agrees to share their contact details. An unfinished guest draft is kept in that tab for up to 24 hours. The library provides a script for embedding the assistant on another website. Unpublishing closes the public endpoint.

Guest-care suggestions use customer quotations. Staff accepts each request before it is saved. Guest records are linked deliberately, and linking an enquiry to another guest removes the previous association. Merging two records requires an explicit identity check.

Workflow reminders use an exact due time interpreted in the staff member's device time zone. Due reminders appear for the assigned person; overdue escalation also includes owners and managers. Notifications update only while the desk is open. No background emails or push notifications are sent.

An approved, saved enquiry can receive a 72-hour private guest review link. The database stores a hash of the token. The page exposes booking details and preferences only, excluding contact details, staff notes and the full transcript. Links become stale when the saved enquiry changes. A guest correction invalidates approval, queues analysis and reopens the workflow as **Needs reply**. Staff can revoke all links for an enquiry.

Desk writes compare the saved version. Workflow and guest forms preserve local edits across unrelated updates and ask which changes to keep when both people edit a field. Database functions return `PT409` for stale application versions; `40001` is reserved for actual database serialization failures because PostgREST may retry it.

## Analysis allowance

`private.fb_quota_policy` starts with an estimated US$1 per UTC day, US$5 per calendar month and 30 requests per IP per minute. These apply to extraction, assistant and voice-transcription requests together. The server reserves enough for its configured primary and repair calls before contacting OpenAI, then settles known completed usage. An uncertain failed call retains its reservation.

The calculation is an application allowance, not an account-wide OpenAI billing guarantee. Keep provider pricing current before changing model settings. The current configuration explicitly uses the standard service tier, with a price margin. Unknown model prices are rejected.

Extraction makes at most two provider requests: a primary check and either a validation repair or recovery from a transient timeout, connection failure or server error. Recovery uses the configured repair model and applies the same evidence checks. Authentication and other non-transient failures stop immediately. A recovered request with unknown primary usage keeps its full allowance reservation; reported tokens cover only completed calls. Both failed calls leave the previous valid brief intact for retry or manual review.

The primary call has a 12-second timeout and the single secondary call has a 14-second timeout. SDK retries are disabled. The combined 26-second provider allowance leaves headroom within the 30-second analysis route; it does not guarantee that a provider request succeeds. The browser waits up to 35 seconds and preserves an unfinished draft if the request is interrupted.

## Saved enquiries

An active draft uses session storage; device cases use local storage. Team cases use Supabase. Staff notes, guest-care details and follow-ups are stored with the case and are separate from extracted booking details. A proposed assistant task is applied only after staff review; replacing an open follow-up requires an explicit choice. The planner shows saved enquiries with current, resolved dates and keeps unfinished or yearless dates out of the timeline. Completing a team follow-up uses the same version check as other case edits. Exported JSON includes the transcript. Reopening JSON discards its approval and checks the conversation again. Saved model-derived briefs from older validation versions also require a fresh check before approval; their transcript and staff notes are preserved.

A simultaneous team edit can fail with a stale-version message. Keep the active draft, save a device copy if needed, refresh the enquiry book, and reopen the team version before deciding how to combine the changes.

Device identities do not provide account recovery. Keep a private invitation code before signing out or clearing browser data. Invitations expire after seven days and a new code replaces the previous one.

## Voice input and assistant tools

Voice input records or uploads an audio message for review. The browser converts it to mono, 16 kHz, 16-bit PCM WAV. The server verifies the complete WAV header, size, duration and non-silent samples before reserving quota and calling `gpt-transcribe`. Messages are limited to 120 seconds; converted requests remain below Vercel's request-size limit. Raw uploads are limited to 10 MB. No raw audio is stored in FormBridge. The transcript must be reviewed before it is put in the composer; it is never submitted automatically.

The transcription call has a 20-second timeout and no SDK retries. Unknown audio usage retains the full reservation. The current verified price is US$0.0045 per audio minute; the reservation adds a duration and price margin. Provider errors leave text entry available.

The desk assistant uses strict Responses API function calling to prepare staff tasks. The only tool prepares a proposed follow-up and/or handoff note. Its arguments are validated again in the application: real source IDs, valid dates, bounded notes and a matching staff request. No assistant tool edits the five booking fields, performs a reservation or sends a message. Ordinary answers and reply drafts remain available through structured output.

## Booking providers

The app accepts venue-specific HTTPS pages for OpenTable, Resy, SevenRooms and TheFork. Opening a page does not transfer fields, check availability or make a reservation. A direct booking integration needs authorised provider access, a participating venue and sandbox validation before implementation.

The **Connections** screen provides mock email, WhatsApp, OpenTable, SevenRooms, Resy and TheFork connectors. Incoming messages create an enquiry or append to a selected conversation. Replies are recorded in that conversation. Event and reply identifiers prevent duplicate delivery. Booking simulations require an approved, exact request and recheck its saved version while committing. References start with `SIM-`; availability, reservations, replies and cancellations are simulated. Provider-full and unavailable settings exercise failure handling. These adapters have no live provider credentials and send no messages or reservations outside FormBridge.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm scenario:live --tag=your-unique-tag --concurrency=1 --pace=2000
```

The scenario runner calls real extraction endpoints. Its constructed cases are functional regression checks, not a measure of general unseen accuracy. The dataset protocol is in `evaluation/REPRODUCIBILITY.md`. Previously saved results remain tied to the code fingerprint recorded in each output.

With the app running in another terminal, `pnpm exec tsx scripts/check-restaurant-workspace.ts` creates isolated synthetic workspaces and exercises the new routes against real Supabase authentication, permissions and database functions. Set `FORMBRIDGE_TEST_URL` for a deployed target and `FORMBRIDGE_TEST_OUTPUT` for a distinct result file. It requires the server and browser Supabase variables in `.env.local`. Public fixture restaurants are unpublished before the runner finishes. Use its recorded workspace ID to identify the test records; do not delete unrelated workspaces.

`RUN_SUPABASE_VERIFICATION=1 pnpm exec tsx scripts/verify-team-backend.ts` creates isolated synthetic accounts and workspaces in the configured FormBridge project, then records their IDs for scoped cleanup. It sends no customer emails. Run it only against the dedicated verification project.

## Security

Supabase row-level security protects case reads; membership checks protect writes. The server key is excluded from browser bundles and Git. Conversation text is untrusted model input, and model output is checked before updating the brief. Human approval applies to a brief, never a real reservation.

On the free Supabase plan, leaked-password protection is [unavailable](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The provider's security advisor reports that limitation for email/password accounts. Device sign-in has no password, and membership isolation remains enforced.
