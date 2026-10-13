# FormBridge report handover

The revised report describes the restaurant workspace released at `b0d389e410af735ba622b41a937adc351162058b`. It contains 15 main pages, including the cover and references, and four appendix pages. The editable Word document and PDF contain the same report.

## Brief and rubric coverage

| Requirement | Location |
| --- | --- |
| Problem, user group, objectives and scope | Section 1, page 3 |
| Web application features and user journey | Section 2, page 4 |
| Architecture and implementation | Section 3, page 5 |
| NLP methods and justification | Section 4, page 6 |
| Data sources and preparation | Section 5, page 7 |
| Evaluation design and reproducibility | Section 6, page 8; Appendices A–C |
| Findings and traditional/contextual comparison | Sections 7–8, pages 9–10 |
| Design, ease of use and communication | Sections 2 and 9–10, pages 4 and 11–12 |
| Challenges and solutions | Section 8, page 10 |
| Ethics and limitations | Section 11, page 13 |
| Phases, contributions, outcomes and recommendations | Section 12, page 14 |
| APA references | Page 15 |
| Supporting material | Appendices A–D, pages 16–19 |

## Before submission

Confirm each group member's full name and actual contribution. Page 14 currently records only Karthik Ramesh's confirmed technical responsibility. Each member should review and contribute to the report and complete their required individual upload and SPARKPlus evaluation. Neither submission action has been performed by these report updates.

The cover uses Karthik Ramesh, student ID 26043455, as supplied by the user. Other members need their own cover details. Check the exact deadline in Canvas because the supplied PDF gives an inconsistent weekday and date.

The repository is public. Include the code or source archive in the format Canvas requires; exclude secrets, environment files and installed dependencies. The report's structure and evidence address the supplied rubric, but cannot guarantee a mark.

## Evidence

The current development run reports 35/100 canonical field matches for rules, 89/100 for direct Luna and 97/100 for FormBridge. FormBridge matches all five fields in 17/20 development dialogues. The inspected regression run reports 100/100 fields and 20/20 complete briefs. Both selections were previously inspected. They are not unseen performance estimates.

The current comparison uses the same primary model and additional Sol repair in FormBridge. The report accounts for extra provider attempts, latency and incomplete token records. The earlier equal-model comparison remains separately identified as historical evidence.

Functional verification includes 230 automated tests, 31 production backend checks and 22 restaurant browser workflows, with revisions and coverage stated in the report. No participant study or satisfaction measurements have been invented. Real email, WhatsApp and reservation connections remain simulated or unconfigured as described.

## Report files

- `FormBridge-AT2-Report.docx`: editable report.
- `FormBridge-AT2-Report.pdf`: matching 19-page review copy.
- `FormBridge-AT2-Report.md`: resolved report source.
- `report-template.md`: source used by the document builder.
- `report-base.docx`: clean document style and section reference.
- `build-report.py`: Word builder and architecture diagram generation.
- `report-quality-check.json`: current layout, metric recount and file hashes.
- `assets/`: original product captures, UTS logo and explanatory figures.

The builder requires Python with python-docx, Pillow, ReportLab and pdf2image, plus Poppler for PDF rasterisation. Run it from this directory; it reads the retained evaluation JSON files. The PDF requires a DOCX renderer. Recheck page count and screenshots after changing text or fonts.

Earlier error audits, browser records, figures and the unfilled usability-study materials remain available as historical evidence. They are not presented as fresh measurements in the rewritten report.
