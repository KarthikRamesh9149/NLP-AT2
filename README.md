<div align="center">
  <img src="docs/media/FormBridge-banner.png" alt="FormBridge — a booking brief that keeps up with the conversation" width="100%" />

  <p><strong>Turn a changing restaurant enquiry into a booking brief you can review with confidence.</strong></p>

  <p>
    <a href="https://formbridge-nlp-at2.vercel.app/">Open FormBridge</a>
    ·
    <a href="#see-it-in-action">See it in action</a>
    ·
    <a href="#run-locally">Run locally</a>
  </p>
</div>

---

When a customer changes a booking detail, FormBridge keeps the latest request clear. It shows where each detail came from, keeps uncertain answers open, and gives staff a brief to check before handing it on.

## See it in action

![FormBridge booking workspace](docs/media/FormBridge-booking-desk.png)

<details>
  <summary>On mobile</summary>
  <p align="center"><img src="docs/media/FormBridge-booking-desk-mobile.png" alt="FormBridge booking brief on mobile" width="360" /></p>
</details>

<details>
  <summary>The enquiry book</summary>
  <img src="docs/media/FormBridge-enquiry-book.png" alt="Private restaurant enquiries in the FormBridge enquiry book" width="100%" />
</details>

### Meet FormBridge

A dinner enquiry changes. The brief keeps up. **57 seconds.**

https://github.com/user-attachments/assets/6f236ad9-0861-4294-bf45-9d9d3cd96b5d

### From first hello to handoff

Bring your own conversation, follow a change of plans, check the sources, and prepare a reviewed brief for your team. **2 minutes 9 seconds.**

https://github.com/user-attachments/assets/43616c6d-b6fc-48fd-9320-eb3e18c6b9b9

## Use your own enquiry

1. [Open FormBridge](https://formbridge-nlp-at2.vercel.app/). A new visit starts with an empty brief.
2. Paste your conversation, or enter a customer message about a restaurant booking. Add staff replies and further customer messages as the conversation develops.
3. Review the restaurant, city, date, time, and party size in the booking brief. Select a detail to see the messages behind it.
4. Ask the suggested follow-up question when a detail is missing or uncertain. You can also edit a detail yourself.
5. Save the enquiry to your device or private team workspace. Approve and download the brief when it is ready to hand off.

The booking desk and device library work without an account. Team workspaces require staff sign-in.

Select **Try an example** if you want to explore a prepared conversation first. You can start over at any time with **New brief**.

**Approving a brief does not make a reservation.** FormBridge prepares information for a person to review; it does not check availability or contact a restaurant.

## What FormBridge handles

- **Changes of mind:** “Four people at seven” followed by “make that five, after eight” updates the party size and leaves the exact time open.
- **Family parties:** Adults and children are counted together. Children already included in a stated total are counted once.
- **Uncertain details:** Preferences and alternatives stay visible until the customer confirms a specific answer.
- **Staff suggestions:** A proposed time becomes the requested time only when the customer accepts it.
- **Clear review:** Each extracted detail links to the conversation, and earlier values appear in the change history.
- **An enquiry book:** Save, search, archive and reopen cases, with notes for the next shift.
- **Private team desks:** Share saved enquiries with invited teammates. Concurrent edits are checked before a saved case is replaced.
- **A desk assistant:** Ask what needs clarification, summarise changes or prepare a warm reply. Draft replies go into the staff composer for review.
- **Conversation corrections:** Edit a message, correct its speaker, remove it or undo the change. The brief is reviewed against the updated conversation.
- **Human control:** Resolve conflicting changes, keep a staff edit or use the customer’s latest request, then approve the brief.
- **Useful handoff:** Download text or JSON, reopen a saved JSON file, create a tentative calendar reminder and open the restaurant’s booking page.

FormBridge is designed for text conversations about **restaurant reservations**. It tracks five details: restaurant, city, date, time, and party size.

## Run locally

Install Node.js 24 and pnpm 11.24.0, then run:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Add your `OPENAI_API_KEY` to `.env.local` to analyse new messages. Open [http://localhost:3000](http://localhost:3000) in your browser. The example, manual review and device case library can be used without an API key. Keep `.env.local` private; it is excluded from Git.

For team cases, create a Supabase project, apply the migrations in `supabase/migrations/`, and set the three Supabase variables shown in `.env.example`. The publishable key belongs in the browser; the secret key stays on the server. Team sign-in uses the authentication options enabled on that project.

A production deployment requires the Supabase configuration for its shared API allowance. Set the variables in Vercel for the relevant environments before deploying. The database starts with an estimated US$1 daily and US$5 monthly analysis allowance, shared by extraction and the assistant. When the allowance is reached, saved cases and manual review remain available.

To check a local change:

```bash
pnpm test
pnpm typecheck
pnpm build
```

The web app uses Next.js and TypeScript. Its server calls OpenAI to understand the conversation, while the app checks each proposed change before updating the brief. The API key stays on the server. The site is deployed on Vercel. Supabase stores private team cases and enforces the shared analysis allowance.

## Your data

Your current draft is saved in this browser tab so you can refresh the page. Cases saved to **This device** stay in this browser. Cases saved to a **team** are stored in Supabase and visible to that team’s members. Device sign-in cannot be recovered after clearing browser data without joining the team again. Text submitted for analysis or to the desk assistant is sent to OpenAI. Avoid entering sensitive personal information, and review the brief before using it.

---

<div align="center">
  <strong>FormBridge</strong><br />
  Clear details. Thoughtful handoff.
</div>
