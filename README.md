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

### A quick introduction

https://github.com/user-attachments/assets/18bf88d7-7031-447f-bc3c-800a070171ed

### A full walkthrough

https://github.com/user-attachments/assets/3d43b8a2-d011-4e47-aeac-9c11354216b4

## Use your own enquiry

1. [Open FormBridge](https://formbridge-nlp-at2.vercel.app/). A new visit starts with an empty brief.
2. Paste your conversation, or enter a customer message about a restaurant booking. Add staff replies and further customer messages as the conversation develops.
3. Review the restaurant, city, date, time, and party size in the booking brief. Select a detail to see the messages behind it.
4. Ask the suggested follow-up question when a detail is missing or uncertain. You can also edit a detail yourself.
5. Approve and download the brief when it is ready to hand off.

Select **Try an example** if you want to explore a prepared conversation first. You can start over at any time with **New brief**.

**Approving a brief does not make a reservation.** FormBridge prepares information for a person to review; it does not check availability or contact a restaurant.

## What FormBridge handles

- **Changes of mind:** “Four people at seven” followed by “make that five, after eight” updates the party size and leaves the exact time open.
- **Uncertain details:** Preferences and alternatives stay visible until the customer confirms a specific answer.
- **Staff suggestions:** A proposed time becomes the requested time only when the customer accepts it.
- **Clear review:** Each extracted detail links to the conversation, and earlier values appear in the change history.
- **Human control:** Staff can correct the brief, approve it, and download a copy.

FormBridge is designed for text conversations about **restaurant reservations**. It tracks five details: restaurant, city, date, time, and party size.

## Run locally

Install Node.js 24 and pnpm 11.24.0, then run:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Add your `OPENAI_API_KEY` to `.env.local` to analyse new messages. Open [http://localhost:3000](http://localhost:3000) in your browser. The example can be loaded without an API key. Keep `.env.local` private; it is excluded from Git.

To check a local change:

```bash
pnpm test
pnpm typecheck
pnpm build
```

The web app uses Next.js and TypeScript. Its server calls OpenAI to understand the conversation, while the app checks each proposed change before updating the brief. The API key stays on the server. The site is deployed on Vercel.

## Your data

Your current draft is saved in this browser tab so you can refresh the page. It is not saved to a FormBridge account or database. Text submitted for analysis is sent to OpenAI. Avoid entering sensitive personal information, and review the brief before using it.

---

<div align="center">
  <strong>FormBridge</strong><br />
  Clear details. Thoughtful handoff.
</div>
