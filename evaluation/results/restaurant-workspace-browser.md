# Restaurant workspace release verification

Date: 13 October 2026

Production URL: https://formbridge-nlp-at2.vercel.app/

Final application revision: `ddf8acdec32fcd5be8faab38bd59bd560c3142cc`.

The checks below used the live application with a private Juniper House workspace and fictional guests. They are functional checks, not a participant usability study or an estimate of general NLP accuracy. Earlier checks remain applicable where the relevant code was unchanged. The guest-count correction, quotation recovery and replacement-link checks were repeated after their fixes reached production.

## Browser workflow checks

| # | Task | Observed result |
| --- | --- | --- |
| 1 | Create a device identity and private restaurant workspace | Juniper House was created and reopened under the same identity. |
| 2 | Update the staff display name | Sam Taylor appeared in assignment controls and comments. |
| 3 | Publish restaurant information | The approved dinner hours appeared on the public guest page. |
| 4 | Ask “What time is dinner served?” | The answer quoted the approved hours, without inventing booking details. |
| 5 | Enter a complete birthday enquiry | 23 October 2027, 8:30 pm and five guests appeared in the request card. |
| 6 | Refresh an unfinished enquiry | Conversation, draft text, contact details and booking fields returned; consent remained unchecked. |
| 7 | Submit with guest consent | The page confirmed receipt and stated that no table was reserved. Submission without consent was blocked. |
| 8 | Open the request in the team inbox | The guest request and booking fields were available to staff. |
| 9 | Find and keep guest-care suggestions | Birthday, peanut allergy and quiet-table requests each had a literal supporting quotation and an explicit accept action. |
| 10 | Inspect a booking field’s source | The time field opened the original customer message. |
| 11 | Approve and save a team enquiry | The brief displayed approval and the save notice named Juniper House. |
| 12 | Assign owner, stage, priority and due time | Sam Taylor, High priority and 13 October 2026 at 16:30 survived reopening. |
| 13 | Add a comment while editing the workflow | The comment was saved without losing unsaved assignment and reminder edits. |
| 14 | Create and open a private review link | Only the booking and guest preferences were shown, without staff comments, contact details or transcript. |
| 15 | Correct an already handed-off request | Changing five guests to six removed approval and returned the case to Needs reply. |
| 16 | Reanalyse the correction | Six guests was supported by the new customer message; date and time stayed unchanged. Staff checked retained venue details and approved the revised brief. |
| 17 | Link a returning guest record | Alex’s record showed one linked enquiry and its reviewed preferences. |
| 18 | Receive email and follow-up simulations | Maya’s original enquiry and later time change remained in one case. |
| 19 | Draft, review and send a simulated reply | The reply addressed Maya’s anniversary and 7:30 pm request. The recorded send was explicitly simulated. |
| 20 | Check availability, reserve and cancel in simulation | OpenTable returned SIM-prefixed references; cancelling the simulation left the reviewed enquiry intact. |
| 21 | Open the website widget and close with Escape | The production guest page loaded inside an external local test page; Escape closed it and returned focus to the launcher. |
| 22 | Receive a WhatsApp simulation | Noah’s message entered a separate enquiry under the WhatsApp channel. |

The team desk was inspected at 1280 × 720 and 437 × 827. The mobile view had no horizontal page overflow. Captures retained in `docs/media/` show the actual product views. These two sizes are not a claim of exhaustive device coverage.

## Edge and isolation checks

The real production API/database runner passed 31/31 checks on `0b25ba8`. Its output, source revision and scope are retained in `restaurant-workspace-production.json`. The final `ddf8acd` change affects the guest review page only; the verified backend code is unchanged. It uses real Supabase identities, row-level security, RPCs and application routes; external messaging and booking providers remain mocks.

| # | Edge case | Evidence and result |
| --- | --- | --- |
| 1 | Unauthenticated private-desk access | Production API: rejected. |
| 2 | Another workspace identity reading or mutating this desk | Production API/database: rejected. |
| 3 | Staff publishing restaurant facts or changing connectors | Production API: rejected. |
| 4 | Staff promoting their own role or bypassing server mutations | Production API/database: rejected. |
| 5 | A stale saved edit overwriting a newer one | Production API/database: conflict returned promptly; newer values retained. |
| 6 | Assignment to a non-member | Production API: rejected. |
| 7 | Invalid guest contact details | Production API: rejected before analysis. |
| 8 | Private notes and contact details leaking through a review | Production API and browser: omitted from the guest snapshot/page. |
| 9 | Invalid, revoked or stale guest links | Production API: rejected without revealing the snapshot. |
| 10 | Creating a review with missing field objects | Production API: rejected. |
| 11 | Duplicate inbound delivery and reply retry | Production API and browser: no extra enquiry or duplicated message. |
| 12 | Reservation handoff before staff review or after a concurrent case change | Production API/database: rejected. |
| 13 | Unavailable provider | Production API: failure preserved the approved enquiry. |
| 14 | Unpublished restaurant accepting public requests | Production API: disabled. |
| 15 | An old AI reply completing after selection changes | Browser and request-scope tests: no reply crossed into the other guest’s enquiry. |
| 16 | Restaurant question with no approved answer | Browser: wheelchair accessibility was left for the team to answer. |
| 17 | Approved quotations disappearing after refresh | Fixed; browser retest retained the dinner-hours quotation. |
| 18 | “Guests: 6” rejected as evidence | Fixed; five new regression cases cover the valid label, alternatives, uncertainty and clock-like numbers. Live correction retest resolved to six. |
| 19 | Opening a different review fragment in the same tab | Fixed; invalid fragment cleared the old review, and returning to the valid link loaded its six-person request. |

## Final local gates

- `pnpm test`: 219 tests passed across 26 files.
- `pnpm typecheck`: passed.
- `pnpm build`: passed, including the production routes.
- `git diff --check`: passed before release commits.
- GitHub Actions run `38338927263`: success for the final application revision.
- Vercel deployment `dpl_pNfUjB8BK6KKGTjJieT2KvGcurXi`: Ready on the production alias for that revision.

## Product films

New launch and walkthrough films were rendered from live product captures with fresh narration. Both complete MP4 streams decoded without errors. Native GitHub playback reached 26 seconds for the launch and 58 seconds for the walkthrough, with no reported media errors. Container durations were 66.65 and 193.35 seconds. Captions, posters and local MP4s are included under `docs/media/`; `restaurant-workspace-films.json` retains capture and output hashes.

## Fixes found during release checks

The independent review found guest-history unlinking, workflow reopening, stale reply results and concurrent-edit recovery issues. Those were corrected in `9896954` with regression coverage. Live checks additionally exposed custom PostgreSQL conflict codes being retried by the gateway, natural dinner-hours questions taking the wrong path, lost quotation metadata after refresh, the guest-count label mismatch and same-tab review-link state. The corresponding fixes are committed, deployed and checked.

## Remaining provider boundaries

- Public email registration, recovery delivery and device-account email upgrades stay disabled until an SMTP sender is configured and real delivery is tested. The backend verification confirms a synthetic account through the admin API, then checks password sign-in; it does not prove delivery of verification or recovery emails.
- Email, WhatsApp and booking connections are simulations. No real guest was contacted and no real reservation was made.
- Reminder alerts update in the open application. Background email, SMS and push delivery are not implemented.
- The new v18 count-evidence change has targeted regression and live workflow evidence. Historical SGD scores have not been relabelled as results for this revision.
