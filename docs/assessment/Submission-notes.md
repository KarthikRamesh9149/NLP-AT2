# FormBridge report handover

The report contains **15 main pages, including the cover and references, plus three appendix pages**. The Word document is editable; the PDF is the matching review copy. The Markdown source, build scripts, screenshot assets and error-analysis records are retained alongside them.

## Rubric coverage

| Assessment requirement | Report location |
| --- | --- |
| Specific problem, user group, objectives and scope | Section 1, page 3 |
| Web application features and user journey | Section 2, page 4 |
| System implementation and state design | Section 3, page 5 |
| NLP approaches and justification | Section 4, pages 6–7 |
| Data sources, selection and preparation | Section 5, page 8 |
| Evaluation design and reproducibility | Section 6, page 9; Appendix A, pages 16–17 |
| Findings and comparison of traditional/newer methods | Sections 7–8, pages 10–11 |
| User interaction, ease of use and communication | Sections 2 and 9, pages 4 and 12 |
| Outcomes and value added | Abstract; Sections 7–9; conclusion |
| Challenges and solutions | Section 8, page 11 |
| Ethics, limitations, recommendations and next steps | Section 10, page 13 |
| Phases and individual contributions | Section 11, page 14; contribution fields require completion |
| APA-style references | Page 15 |
| Supporting evidence and AI assistance acknowledgement | Appendices B–C, page 18 |

## Required before submission

1. Supply every team member's full name and student ID, and the individual submitting student's identity.
2. Confirm actual responsibilities, report sections and supporting evidence for each person in Table 5. Do not assign equal contribution without confirmation.
3. Have each member review and contribute to the report, including its technical findings and references.
4. Check the subject's AI-use policy and use any prescribed acknowledgement wording. Appendix C truthfully records AI assistance; it is not a substitute for a required declaration.
5. Provide the required code upload or source archive. The repository is private, so a link alone may not give the assessor access. Do not include API keys, environment secrets or local dependency directories in an archive.
6. Verify the deadline and required upload format in Canvas. The pasted PDF's “Monday, 14 October 2026” is inconsistent: 14 October 2026 is Wednesday.
7. Each member must complete the required individual submission and SPARKPlus peer evaluation.

## Evidence boundaries

- The inspected regression score is reported separately from the controlled comparison. It is not presented as unseen or universal accuracy.
- The same-model systems tie under canonical field matching. The report explains their representation, workflow and operating-cost differences without claiming a semantic accuracy win.
- The 35 browser cases are authored functional checks. They are not a recruited-user study or a customer satisfaction measure.
- Product images are genuine live-app captures using a fictional restaurant enquiry. No customer information appears.
- The report does not guarantee a grade. Its structure and evidence target the supplied HD criteria; marking remains with the assessor.

## Files

- `FormBridge-AT2-Report.docx`: editable report.
- `FormBridge-AT2-Report.pdf`: matching 18-page report and appendices.
- `FormBridge-AT2-Report.md`: report source.
- `build-report.py`: Word generation script.
- `build-assets.py`: reproducible chart and figure generation.
- `assets/`: original captures and report figures.
- `error-audit.json` and `error-transcripts.json`: error-analysis records, with upstream dataset attribution in the report.

The report is a technical draft until the identity and contribution fields are completed. No Canvas submission or SPARKPlus evaluation has been performed.
