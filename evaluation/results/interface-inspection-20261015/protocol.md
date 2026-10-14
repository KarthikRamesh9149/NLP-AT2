# FormBridge interface inspection

Protocol recorded before the walkthrough on 15 October 2026 (Australia/Sydney). This is task-based development inspection using browser interaction, screenshots, source checks and targeted automated tests. There are no recruited participants. No human completion time, satisfaction, workload or learnability will be reported.

Scope: public booking desk and its local saved enquiries. Use a fictional Harbour Table booking in Sydney. Leave unrelated user records intact. Test the deployed version first; if a defect needs a code fix, verify the changed flow locally and after deployment. Keep benchmark claims separate.

## Tasks and acceptance criteria

1. Empty entry: clear invitation to add an enquiry; no prefilled customer details.
2. Help: explain source links, uncertainty and approval; open and close with keyboard.
3. Own conversation: input a new fictional booking; extract five explicit fields.
4. Evidence: open a field source and locate the supporting message.
5. Correction: update guest count without changing other fields; show history.
6. Uncertain time: retain 'after 8 pm' without inventing an exact time; block approval and ask for clarification.
7. Staff suggestion: do not accept an offered time until the customer agrees.
8. Customer acceptance: resolve to the offered time with source links.
9. Message editing: revise wording or speaker, recompute affected state and revoke stale approval.
10. Manual review: edit a field; preserve the staff decision and explain the source.
11. Approval and export: require complete details; export contains current values and review status, without claiming a reservation.
12. Save and restore: save a named enquiry, start another and reopen; preserve state after refresh.
13. Incomplete export: show a warning and unresolved fields.
14. Error recovery: preserve draft and expose Retry after an update failure; identify fault injection separately from live provider behaviour.
15. Keyboard: reach primary controls, show focus, trap modal focus and return focus on close.
16. Mobile: 390 x 844 viewport, switch conversation/brief, reach primary controls without horizontal scrolling or overlap.
17. Reflow: 640px viewport (layout equivalent of a 1280px display at 200% scale), read and operate primary controls. This does not replace browser zoom or screen reader testing.
18. Contrast and labels: inspect computed styles for key text/control states; check accessible names and landmarks. Limited sample, not WCAG conformance certification.
19. Validation: reject an empty submission and invalid import without replacing the draft; explain the correction.
20. Console and page health: meaningful content, correct title/URL, no unexplained runtime/framework errors in tested states.

For each task record observed state, outcome and evidence. Use pass, fail, partial or not tested; do not infer a pass from source alone. Findings use blocker, substantial, minor or observation based on task impact. Count checks, not users.
