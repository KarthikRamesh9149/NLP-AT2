# Email access preview verification

Date: 13 October 2026

Application revision: `b0d389e410af735ba622b41a937adc351162058b`.

Production route: https://formbridge-nlp-at2.vercel.app/auth/preview

## Scope

The preview simulates registration, verification, sign-in and recovery with an in-memory account and inbox. It accepts `.test` addresses only. It does not send mail, create a Supabase account or grant access to a team workspace. No Gmail credentials were used. Real email delivery remains disabled pending SMTP setup and delivery verification.

## Verification

- Eleven targeted tests passed for address and password validation, unverified sign-in rejection, verification, sign-in, neutral recovery responses, reset, single-use and expiry handling, replacement links and bounded inbox state.
- The complete application suite passed: 230 tests across 27 files. TypeScript checking, production build and `git diff --check` passed.
- Local browser verification completed signup, verification, sign-in, sign-out, recovery and password reset. The old password was rejected after resetting; used and replaced links were rejected. Reload cleared the preview. The 390-pixel layout had no horizontal overflow.
- The deployed browser flow completed signup, verification, sign-in, sign-out, recovery and password reset using a fictional `.test` identity. The interface confirmed the reset. These are functional browser checks, not a participant study.
- GitHub Actions run `38343115903` succeeded for this revision.
- Vercel deployment `dpl_789txGnDbxPAQr4yxt3PkQNg2Eak` was Ready on the production alias for this revision.

The restaurant backend and extraction paths were unchanged by this release. Their earlier verification records retain their original source revisions.
