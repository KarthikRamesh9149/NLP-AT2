# FormBridge usability study

## Purpose

Measure whether FormBridge helps people prepare a correct restaurant booking brief, and identify obstacles in its review workflow. This document is a study protocol, not a record of completed participants or results.

## Participants and consent

Aim for six participants. Restaurant staff are preferred. If classmates or friends take part, describe them as proxy users and record any relevant booking experience. Give each participant a random identifier; do not collect names, email addresses or customer information.

Read this invitation before beginning:

> We are testing a restaurant enquiry tool using fictional conversations. Participation is voluntary and takes about 20 minutes. You can stop at any time. We will record task time, the final booking details and short feedback without recording your name. This does not make any restaurant booking. May we record these observations for our coursework report?

Record consent as yes/no. Stop if consent is not given. Do not record audio or video without separate explicit consent.

## Conditions and order

Each person completes four tasks: two using a plain five-field form and two using FormBridge. Keep the transcript visible in both conditions. The manual form can be a text document with Restaurant, City, Date, Time and Guests, plus an Unresolved details line.

| Participant | Task order and condition |
| --- | --- |
| P01, P03, P05 | A1 manual → B1 FormBridge → A2 FormBridge → B2 manual |
| P02, P04, P06 | A1 FormBridge → B1 manual → A2 manual → B2 FormBridge |

A1/B1 and A2/B2 are matched pairs. Do not let participants perform the same transcript twice. This balances each transcript across conditions and alternates the condition within each participant. It remains a small exploratory convenience sample.

Provide one practice enquiry that is not among the four scored tasks. Explain how to paste Customer:/Staff: messages, inspect sources, edit and download. Do not explain the answers to scored tasks. Use the same device for both conditions and record its type.

## Participant instruction

> Read the conversation and prepare the current booking brief. Keep details unresolved where an exact answer has not been agreed. Check your work and tell us when it is ready. Approve a FormBridge brief only if the details are resolved. For an unresolved brief, save a draft and state what needs to be asked. You may inspect the transcript and sources as often as you want.

Start timing when the task transcript is shown. Stop when the participant declares completion and hands over the final brief/draft. Include API waiting time. Record provider failures; do not silently exclude slow or failed tasks. Record any facilitator assistance and whether the task was abandoned.

## Task transcripts

### A1 — accepted time and guest correction

```text
Customer: Four guests at Juniper in Sydney on 18 October 2027, sometime after 7 pm.
Staff: Would 7:30 pm work?
Customer: Yes, that's good. Actually make it five guests.
```

### B1 — matched accepted time and guest correction

```text
Customer: Two guests at Willow House in Melbourne on 19 October 2027, sometime after 6 pm.
Staff: Would 6:45 pm work?
Customer: Yes, that works. Actually make it three guests.
```

### A2 — rejected offer and remaining uncertainty

```text
Customer: Six guests at Cedar Table in Adelaide on 20 October 2027 at 7 pm.
Customer: Change that to sometime after 8 pm instead.
Staff: Would 8:30 pm work?
Customer: No, I haven't decided the exact time yet. Keep the date and six guests.
```

### B2 — matched rejected offer and remaining uncertainty

```text
Customer: Four guests at Olive & Thyme in Brisbane on 21 October 2027 at 6 pm.
Customer: Change that to sometime after 7 pm instead.
Staff: Would 7:30 pm work?
Customer: No, I haven't decided the exact time yet. Keep the date and four guests.
```

## Scoring key — keep separate from participant view

| Task | Restaurant | City | Date | Time | Guests | Required uncertainty |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Juniper | Sydney | 18 October 2027 | 7:30 pm | 5 | None |
| B1 | Willow House | Melbourne | 19 October 2027 | 6:45 pm | 3 | None |
| A2 | Cedar Table | Adelaide | 20 October 2027 | No exact time | 6 | After 8 pm; ask the exact time; draft only |
| B2 | Olive & Thyme | Brisbane | 21 October 2027 | No exact time | 4 | After 7 pm; ask the exact time; draft only |

Count one final field error for each incorrect/missing field; equivalent explicit date/time formats count as correct. For A2/B2, filling the offered time or leaving the old time is an error. Separately record whether the constraint and uncertainty were retained, and whether the brief was wrongly approved. Do not merge those separate outcomes into an unexplained composite score.

In FormBridge, count deliberate source inspections. In the manual condition mark source inspections not applicable; transcript revisits may be noted separately. Save the final result with the anonymous participant/task ID. If possible, have a second group member check the final field-error coding without knowing the condition.

## Questions after each task

1. How easy was this task? Rate from 1 (very difficult) to 7 (very easy).
2. Which detail was hardest to understand or check?
3. Was anything confusing or did you need help?

After the FormBridge tasks, ask whether sources and uncertainty labels helped, and whether waiting for analysis interrupted the workflow. Record participants' own words. Do not turn paraphrases into verbatim quotations.

## Analysis and reporting

Use `usability-observations.csv`, one row per participant/task. Preserve every attempted task, including failures. For each participant, calculate the mean time and total final errors in each condition; show paired participant outcomes and descriptive medians/ranges. Report unresolved-detail handling, wrong approval, task abandonment and assistance separately. With six participants, avoid claims of population-level effectiveness or statistical significance without an appropriate analysis.

State the actual participant count, recruitment method, proxy/staff status, consent, task order, device and any deviations. Report both favourable and critical feedback. Only add a completed study section to the report after observations exist; this protocol alone does not establish usability.
