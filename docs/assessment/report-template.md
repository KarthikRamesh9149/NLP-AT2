<!-- PAGE 1 -->
# Assessment Task 2
## FormBridge Restaurant Enquiry Workspace

**Subject:** 36118 Applied Natural Language Processing

**Student Name:** Karthik Ramesh

**Student ID:** 26043455

<!-- PAGE 2 -->
# Abstract

Restaurant enquiries arrive as conversations, with details spread across messages and revised as guests make plans. FormBridge converts these conversations into booking briefs that staff can inspect, correct and share with their team. It tracks five booking fields, preserves uncertainty and links extracted values to supporting messages. The completed web application also provides a restaurant guest assistant, voice transcription, guest-care suggestions, private review links and a shared enquiry desk. Staff retain control of approval and follow-up actions. Messaging and reservation connections are simulated.

The project compares regular-expression rules, direct contextual extraction and contextual extraction with evidence validation and state reconciliation. A fresh evaluation of the released extraction code used 20 previously selected development dialogues from the Schema-Guided Dialogue dataset. Rules, direct extraction and FormBridge achieved {{DEV_RULES}}/100, {{DEV_DIRECT}}/100 and {{DEV_FB}}/100 canonical field matches respectively. FormBridge matched all five values in {{DEV_COMPLETE}}/20 dialogues. A separate run on 20 inspected test dialogues achieved {{REG_FB}}/100 field matches. These are development and regression results, not estimates of unseen performance. {{COST_ABSTRACT}}

Verification includes 230 automated tests, 31 production API and database checks, and 22 recorded browser workflows for the restaurant workspace. The results demonstrate implemented behaviour and access controls. They do not establish staff time savings or ease of use in a restaurant; no recruited-user study was conducted.

## Contents

| Section | Page |
| --- | --- |
| 1 Problem and objectives | 3 |
| 2 Product and user journey | 4 |
| 3 Architecture and state | 5 |
| 4 NLP methods and choices | 6 |
| 5 Data and preparation | 7 |
| 6 Evaluation design | 8 |
| 7 Results and resource use | 9 |
| 8 Error analysis and development findings | 10 |
| 9 Interaction design | 11 |
| 10 Functional verification | 12 |
| 11 Ethics and limitations | 13 |
| 12 Project delivery and next steps | 14 |
| References | 15 |
| Appendices A to D | 16–19 |

<!-- PAGE 3 -->
# 1 Problem and objectives

## The restaurant enquiry problem

A guest asks for four people at seven, then changes the request to five people sometime after eight. The current guest count is clear; the exact time is not. Reading only the first message produces an outdated brief. Reading only the last one loses the restaurant and date. Choosing 8:30 pm would add a decision the guest has not made.

This is a dialogue state tracking problem: maintaining the current values and constraints across a changing conversation. Earlier research, including TRADE, predicts state values from utterances rather than relying entirely on a fixed list of possible values (Wu et al., 2019). The Schema-Guided Dialogue dataset supplies service descriptions, task-oriented conversations and annotated states for this problem (Rastogi et al., 2020).

FormBridge applies this task to small restaurant teams. Front-of-house staff need to understand an enquiry, ask for missing details and hand it to the next person without losing a revision or special request. Guests need a clear way to describe their plans and correct them. The project defines these needs through enquiry scenarios; it has not established market demand through restaurant interviews.

## Objectives and research question

The principal objective was to build a usable web application around accurate, inspectable booking information. Four technical objectives guided implementation:

1. Maintain restaurant, city, date, time and guest count as messages change.
2. Explain extracted values through source quotations, preserve uncertainty and require staff review.
3. Compare a traditional rule baseline with contextual extraction under a documented evaluation procedure.
4. Carry an enquiry through intake, review and team handoff, with protected records and recoverable errors.

**Research question:** How does contextual extraction with evidence validation and state reconciliation compare with rules and direct extraction, and how can its output support staff review of restaurant enquiries?

## Scope and completion criteria

The implemented product accepts English text and short voice messages, with a maximum of 30 transcript messages of 1,000 characters each. Optional guest-care details sit alongside the five booking fields. Staff can save cases locally or in a private team, assign work, return a review link and prepare a handoff.

A successful workflow produces a brief whose current values, unresolved questions and staff decisions are visible. Approval means that the brief has been reviewed. External email, WhatsApp and reservation actions run through mock connectors; no real booking, payment or availability guarantee is made. The product scope is broader than the five-field benchmark, so workflow verification is reported separately from extraction accuracy.

<!-- PAGE 4 -->
# 2 Product and user journey

FormBridge has two connected entry points. Staff start with an empty booking desk and enter their own transcript, import a saved enquiry or review a voice transcription. Restaurants can publish a branded guest page or embed its assistant on their website. The assistant uses approved restaurant information and gathers the request before the guest consents to share contact details with the team.

![The restaurant team desk with enquiry stages and navigation](assets/FormBridge-team-desk.png)
*Figure 1. The deployed team desk for the fictional Juniper House restaurant. The overview separates enquiries needing a reply from those under review. Original product capture, 13 October 2026.*

## A complete enquiry

Alex requests a birthday dinner for five on 23 October 2027 at 8:30 pm, with a peanut allergy and a quiet-table preference. The guest page gathers contact details and sends the enquiry to the private inbox. Staff inspect the five-field brief and accept supported guest-care suggestions individually. They assign an owner, set a due time and approve the reviewed brief.

Alex later uses a private link to change the count to six. The correction becomes a customer message, clears approval and returns the enquiry to **Needs reply**. After analysis and staff review, the updated brief can be handed off. A simulated reservation connection demonstrates the final transfer and failure handling without making a restaurant reservation.

## Work beyond the first reply

The desk supports comments, priority, ownership, returning-guest history and exact reminders. Staff explicitly link or merge guest records; the system does not assume that matching names identify the same person. A service planner organises saved enquiries with resolved dates. The desk assistant can draft replies, suggest a follow-up and prepare a handoff note, all subject to staff acceptance.

Device sign-in and private team invitations work in the deployed product. Email signup and password recovery can be explored in a separate, labelled simulation. Real email delivery remains disabled until a sender is configured and tested.

<!-- PAGE 5 -->
# 3 Architecture and state

The application uses Next.js 16.3.6, React 19.3.0 and TypeScript 5.9.3 on Vercel. OpenAI SDK 7.23.0 provides language and transcription requests; Zod 4.6.5 validates inputs and structured outputs. Supabase provides authentication, PostgreSQL storage and row-level security. A locked dependency file records the installed versions.

![The flow from conversation input through extraction and validation to review and shared storage](assets/architecture-current.png)
*Figure 2. Application architecture. Model output is checked before it changes the brief. Guest-facing routes expose selected information, while staff actions require workspace membership. External messaging and reservations use simulations.*

## State ownership

The model proposes a current value, status, constraint and evidence for each field. Application code decides what enters the brief. A field may be missing, resolved or awaiting clarification, and may originate from the model or a staff edit. Source IDs connect it to transcript messages. Revision history records changes; approval refers to one particular revision. A changed request therefore cannot retain an earlier approval silently.

The active draft uses browser session storage. The device library uses local storage and holds up to 50 cases. Shared cases are saved in Supabase with workspace membership checks. Guest preferences, comments and follow-up actions remain distinct from the five extracted booking fields. Reimported JSON and older model-derived drafts require renewed checking before approval.

## Shared edits and request boundaries

Writes carry a saved version. A stale write returns a conflict rather than overwriting a teammate's changes. Where possible, the interface preserves unrelated edits and asks which version to keep when the same field changed. In-flight reply requests are tied to the selected case, preventing a late response from appearing in another enquiry.

Server routes validate body size and field schemas before provider calls. A shared database allowance reserves estimated usage, then settles known usage; uncertain failed requests retain their reservation. If the allowance service is unavailable in production, AI requests stop while manual review and saved work remain available. This is an application spending control, not an account-wide billing guarantee.

<!-- PAGE 6 -->
# 4 NLP methods and choices

## Three approaches to booking state

*Table 1. Approaches to booking-state extraction.*

| Approach | Method | Purpose |
| --- | --- | --- |
| Rules | Regular expressions, number-word conversion and simple correction or acceptance patterns | An interpretable baseline without model calls |
| Direct extraction | A structured five-field prediction from each visible conversation prefix | Measures contextual extraction with minimal application reconciliation |
| FormBridge | Contextual candidates with quotations, deterministic validation and revision-aware reconciliation | Produces a state that staff can inspect and review |

All approaches receive the same speaker-labelled prefixes. FormBridge accepts a staff-proposed field only when its checks find customer acceptance. FormBridge reconstructs the request from the visible conversation, then checks cited IDs, literal quotations, value support, acceptance and recency. It checks calendar validity, time constraints, guest-count expressions and explicit cancellation. Manual edits are preserved, and later conflicts require review.

Structured output makes the response shape predictable; it does not make the content correct (OpenAI, n.d.-b). A phrase such as “after 7 pm” must remain a constraint, and a time's numeral must not become a guest count. Validation addresses these task-specific errors. Its pattern-based checks can still reject a valid paraphrase or misunderstand acceptance, so human inspection remains necessary.

## Model and latency choices

The deployed extraction configuration uses `gpt-6-luna` and permits one `gpt-6.1-sol` repair or transient-failure recovery. Both use low reasoning effort. Primary and secondary timeouts are 12 and 14 seconds; SDK retries are disabled. The output budget is 2,400 tokens for evidence-bearing extraction and 900 for direct extraction. These limits bound waiting and token use within the analysis route's 30-second duration.

A hosted model enabled work on state integrity and interaction without training or serving weights. The tradeoffs are external processing, network dependence and changing model aliases. Development trials informed the selected configuration, but did not establish an optimal model. FormBridge's extra model call is counted when comparing accuracy, latency and usage.

## Language features around the brief

Voice input uses `gpt-transcribe`; staff review its text before adding it. Guest-care extraction requires literal customer quotations and explicit acceptance of each suggestion. The desk assistant uses structured output and a narrowly defined function for proposed notes or follow-ups. Its tools do not book tables or overwrite booking fields. Restaurant questions use category matching over approved facts, returning their text or acknowledging a missing answer. This is bounded retrieval, not a general-purpose restaurant knowledge model.

<!-- PAGE 7 -->
# 5 Data and preparation

## Dataset and mapping

The evaluation uses Google's Schema-Guided Dialogue dataset at revision `e852981ae34990f4358979625854259302feaa78` (Google Research, n.d.). Conversations are retained only when they concern one restaurant service and contain a customer frame with the `ReserveRestaurant` intent. The repository audit identifies the following subset before the evaluation runner's maximum-prefix-length filter.

*Table 2. Audited restaurant subset before prefix-length filtering.*

| Split | Restaurant service | Eligible dialogues | Reservation customer turns |
| --- | --- | --- | --- |
| Train | Restaurants_1 | 367 | 1,870 |
| Development | Restaurants_2 | 73 | 385 |
| Test | Restaurants_2 | 73 | 342 |

The training schema uses `city` and `party_size`; the development and test schemas use `location` and `number_of_seats`. The loader maps both to the application's city and guest-count fields. Restaurant name, date and time complete the five-field task. No model weights were trained on these data.

## Preparing each example

Files are read in a stable order. The input ends at the final reservation customer turn and is restricted to at most 30 messages. USER and SYSTEM become customer and staff, with stable message IDs. The final annotated slot values supply acceptable answers for scoring. Each system processes every customer prefix in chronological order, so later messages are unavailable at earlier steps.

Gold labels, schema defaults and future turns are excluded from model input. Historical conversations have no reference date. Consequently, “tomorrow” is not interpreted using the date of the experiment. A yearless date can remain a recognised value while still requiring clarification before staff approval.

## Other inputs and data limitations

Live inputs are user-provided conversations, approved restaurant facts and reviewed voice transcripts. Product screenshots and functional tests use fictional restaurants and guests. These are separate from SGD and are not collected restaurant traffic. Guest-care and workflow features are outside the dataset's five-field labels.

SGD provides useful task-oriented state labels, but does not fully label evidence quality, clarification wording, staff workload or operational readiness. Its public availability also means absence from a hosted model's pretraining cannot be established. Repeatedly inspected selections support regression testing; they cannot become unseen tests through rerunning.

The upstream dataset is licensed under Creative Commons Attribution-ShareAlike 4.0. Dataset-derived excerpts and retained outputs require the applicable attribution and licensing. The project keeps the corpus revision and licence with its evaluation materials.

<!-- PAGE 8 -->
# 6 Evaluation design

## Current code and fixed selections

The evaluation uses extraction version `grounded-state-v18` at application revision `b0d389e`. Two previously selected samples are reused: 20 development dialogues for all three methods, and 20 inspected test dialogues for a FormBridge regression run. Their selection manifests were saved before provider calls. Both samples had been inspected during development.

Rules, direct extraction and FormBridge see identical ordered conversation prefixes and finish at the same customer turn. The direct baseline and FormBridge use the same primary model, GPT-6 Luna. FormBridge additionally permits a Sol repair or recovery and produces evidence quotations. This compares complete systems; it does not isolate the causal effect of validation or control total computation.

An earlier equal-model comparison used Luna for all contextual calls, including repair. It is retained as historical evidence in Appendix C. Its results are not presented as measurements of the current application.

## Metrics

**Field accuracy** is the number of matching final values divided by five times the number of attempted dialogues. For 20 dialogues the denominator is 100. **Complete-brief accuracy** is the number of dialogues with all five matching values divided by the number attempted. A failed dialogue remains in both denominators; staff edits are excluded.

The strict matcher applies the original text normalisation. The canonical matcher additionally accepts supported equivalent date and time forms. Both are reported. Canonicalisation does not supply a missing year or turn an uncertain range into an exact value. These scores measure the selected five-field task, not full SGD joint goal accuracy or approval readiness.

Resource accounting includes analysis requests, provider attempts, observed input/output tokens and whole-dialogue replay time. Replay time includes multiple prefixes and cannot be read as one user-message response time. Failed calls may not return usage, so reported tokens are not complete billing records.

## Reproduction and interpretation

The runner calls the same analysis functions directly with real provider requests. This binds evaluation to the selected source and configuration while avoiding public endpoint quotas. It does not test the deployed route. Separate browser and database checks address the application boundary.

The source fingerprint is checked before and after each run. Predictions, warnings, errors, selected IDs and settings are saved, with unique filenames that prevent replacement. The current run is reported once, including failures. Model aliases and provider variability prevent a guarantee of identical future outputs. Appendices A and B give the exact setup and evaluation commands.

<!-- PAGE 9 -->
# 7 Results and resource use

## Development comparison

Table 3 reports the 20 development dialogues evaluated on 13 October 2026. Each method completed all 20; the field denominator is 100. Complete-brief scores require all five values to match within the same dialogue.

*Table 3. Development accuracy on 20 dialogues.*

| Method | Strict fields | Canonical fields | Strict complete | Canonical complete |
| --- | --- | --- | --- | --- |
| Rules | 35/100 | 35/100 | 0/20 | 0/20 |
| Direct Luna | 83/100 | 89/100 | 6/20 | 11/20 |
| FormBridge | 97/100 | 97/100 | 17/20 | 17/20 |

FormBridge exceeded direct extraction by eight canonical field matches and six complete briefs on this selection. This is a difference between the configured systems, including prompts, output representation, reconciliation and additional repair calls. It cannot be attributed to validation alone. Both models found every restaurant and city; dates and guest counts account for most remaining differences.

*Table 4. Development matches by field.*

| Correct canonical values | Restaurant | City | Date | Time | Guests |
| --- | --- | --- | --- | --- | --- |
| Rules | 3/20 | 8/20 | 0/20 | 12/20 | 12/20 |
| Direct Luna | 20/20 | 20/20 | 12/20 | 19/20 | 18/20 |
| FormBridge | 20/20 | 20/20 | 18/20 | 20/20 | 19/20 |

## Additional computation

Each method processed 166 customer prefixes. Direct extraction made 166 provider attempts; FormBridge made 196. Observed token totals were 93,947 input and 21,817 output for direct extraction, compared with 381,706 input and 61,309 output for FormBridge. Three FormBridge dialogues recovered from a failed primary request whose usage was unavailable. Its token totals are therefore lower bounds for those calls.

Mean whole-dialogue replay time was 21.87 seconds for direct extraction and 45.11 seconds for FormBridge. The latter obtained more matching values at approximately twice the measured replay time. These are serial multi-turn replays with concurrent evaluation activity, not controlled production latency measurements. Rules required no provider calls; their sub-millisecond mean rounds to zero in the saved summary.

## Inspected regression sample

On the inspected test selection, FormBridge matched 100/100 fields and 20/20 complete briefs under both matchers. It processed 137 prefixes with 149 provider attempts, 289,466 input and 50,732 output tokens. Mean replay time was 32.93 seconds, with no failed dialogues or incomplete usage records. This is regression evidence for the selected cases.

<!-- PAGE 10 -->
# 8 Error analysis and development findings

## What the three remaining field mismatches mean

The saved development predictions were compared with their source conversations. Two failures concern how far a short acceptance should extend across earlier staff proposals. The third concerns the matcher rather than a different requested date.

*Table 5. FormBridge development mismatches.*

| Dialogue / field | Observed output | Interpretation |
| --- | --- | --- |
| 1_00005 / date | Missing; label is “today” | Staff proposed today in an earlier summary. Later venue corrections were followed by acceptance of a shorter summary that omitted the date. FormBridge did not carry that earlier proposal into its final value. |
| 1_00017 / guests | Missing; label is 2 | Staff proposed two guests before the customer changed date and venue. The final accepted summary repeated only the new date and venue. The final state did not retain the earlier proposed count. |
| 4_00069 / date | “the 5th of this month”; label includes “5th of this month” | The requested date is retained with a clarification status. The canonical matcher does not remove this leading article from a relative date, so it remains a scored mismatch. |

The date-expression mismatch contributes one of the three errors under the current scoring rule. A broader relative-date normaliser could recognise this equivalence. Its rules should be developed separately and then applied consistently to all methods, alongside the existing metric.

The first two cases expose tension between dataset dialogue-state labels and conservative customer confirmation. They count as errors against the selected labels. The absence of an original model candidate in the saved trace prevents a complete separation of extraction and guard effects. A targeted replay with candidate logging would be needed for that diagnosis.

## Why the baselines differ

The rules recognise full calendar dates, while these dataset dates are yearless or relative. Their zero date matches show that this simple baseline lacks the date coverage required by the dataset. Broader date parsing and a trained slot tagger would provide stronger comparisons.

All eight of the direct model's date mismatches involved a relative-date phrase. In six cases it retained that phrase as a constraint while leaving the value empty. FormBridge can retain a phrase in the value while still requiring clarification. The field metric therefore partly rewards representation choices. A separate metric for constraint retention and approval readiness would assess this distinction more fairly.

## Problems resolved during development

Testing exposed negated cancellations clearing valid details, unsupported guest-count evidence, invalid corrections leaving stale approval, and retry controls disappearing after an error was dismissed. State and evidence checks were tightened, and recovery remains available. Later shared-workflow checks found stale writes, late replies appearing in another case, and guest corrections retaining a handed-off status. Version checks, request scoping and approval invalidation addressed these failures.

The release also fixed dinner-hours question routing, lost quotations after refresh and the valid “Guests: 6” correction format. These corrections are supported by targeted tests and deployed workflow retests; they do not establish a zero-error rate.

<!-- PAGE 11 -->
# 9 Interaction design

The main interaction is a conversation beside a booking card. Staff can inspect a field's source, revise a message or speaker, compare a changed value and ask for the unresolved detail. Status text accompanies colour. Approval is a separate action and is removed when the underlying request changes. This approach follows human–AI interaction guidance on explaining behaviour and supporting correction (Amershi et al., 2019).

![Guest-care suggestions with the original customer quotation and a separate acceptance button](assets/FormBridge-guest-care.png)
*Figure 3. Detail from the live guest-care panel. Each suggestion displays the original customer quotation and a separate “Keep this request” action.*

## Making review practical

Suggestions are optional and accepted individually. An allergy is recorded as the guest's request, not as a promise that the kitchen can accommodate it. A private review link lets the guest correct booking details without seeing the transcript or staff discussion. Clear distinctions between enquiry received, brief approved and simulated reservation prevent a reassuring interface from implying a real booking.

The restaurant style uses cream surfaces, dark green navigation and serif headings. Primary actions remain consistent across the booking desk and team workspace. Mobile layouts stack the conversation and brief, while the team navigation adapts to the smaller screen. Keyboard checks cover dialog closing and focus return, including the embedded assistant.

## What remains unmeasured

Browser workflows show that the paths can be completed and that selected failure states recover. They do not measure how quickly a new staff member learns the interface, whether controls are discoverable or whether users make fewer mistakes. No participant satisfaction scores, accessibility certification or restaurant productivity improvement is claimed. Those questions require a separate user study.

<!-- PAGE 12 -->
# 10 Functional verification

Verification covers the language safeguards, application routes, shared records and complete browser workflows. The final email-preview release, revision `b0d389e`, passed 230 automated tests across 27 files, TypeScript checking and the production build. The associated GitHub Actions run succeeded, and Vercel served that revision on the production address.

*Table 6. Verification scope and results.*

| Evidence | Scope and result | What it establishes |
| --- | --- | --- |
| Automated tests | 230 passed; state, evidence, dates, input limits, request scoping and email-preview transitions | Expected behaviour for the tested inputs and mocks |
| Production API/database | 31/31 passed using real Supabase identities, permissions, functions and application routes | Selected access, concurrency and workflow boundaries work against the deployed backend |
| Restaurant browser workflows | 22 recorded workflows, plus overlapping edge checks | Intake, consent, care, review, corrections, team work, widget and simulated handoff paths can be completed |
| Email preview | Local full cycle and deployed signup, verification, sign-in, recovery and reset | The isolated simulation works; it does not send real mail or create a production account |

The backend checks were recorded on `0b25ba8`; the restaurant browser record identifies `ddf8acd`. The later email-preview release adds an isolated route and a team-dialog link. It does not change the backend or restaurant extraction code covered by those records. The checks are reported separately with their original revisions because their coverage overlaps.

## Checks that matter to the workflow

Unauthenticated and cross-workspace access was rejected. Staff could not publish restaurant facts, change connector settings or promote their own role. Stale edits returned conflicts, and assignment to a non-member was rejected. Guest review snapshots omitted contact details, internal comments and full transcripts; invalid and revoked links revealed no snapshot.

Duplicate incoming messages and reply retries did not create duplicate records. Simulated reservation handoff required a current approved brief, and provider failure preserved the enquiry. A correction after handoff removed approval, reopened **Needs reply**, and changed five guests to six without changing date or time. These checks cover the decisions and state changes within the workflow.

Desktop inspection used 1280 × 720; the restaurant desk also used 437 × 827 without horizontal overflow. The email preview was checked at 390 pixels wide. These observations cover selected layouts, not every browser or assistive technology. Voice input has automated format and duration checks; this report does not claim a multilingual speech-accuracy study.

<!-- PAGE 13 -->
# 11 Ethics and limitations

## Guest information and access

Conversations can contain names, contact details and dietary requirements. Public intake asks the guest to consent before sharing contact details with the restaurant. Team membership restricts access to private records. PostgreSQL row-level security protects reads, and authorised mutations check the caller and record version (Supabase, n.d.). Private review links expire after 72 hours and expose only the information needed for guest review; anyone possessing an active link can use it.

OpenAI processes the submitted text or audio needed for a request. Responses API calls use `store: false`, which does not by itself guarantee zero provider retention; applicable abuse-monitoring and account controls still matter (OpenAI, n.d.-a). FormBridge does not retain raw voice recordings. JSON exports contain transcript data and should be handled as guest records.

The current product has no automated retention schedule for all shared enquiries or a complete data-subject request workflow. A restaurant deployment would need an agreed retention policy, deletion procedures and an explanation of external processing. Free-plan service limits and dependency availability also constrain operation.

## Human decisions and consequences

An extracted allergy or accessibility request can be incomplete. Staff should confirm practical arrangements with the guest and restaurant; extraction does not establish medical or operational suitability. Returning-guest records are linked deliberately to avoid combining different people with the same name. Staff can reject suggestions, correct fields and inspect their sources.

Prompts and validation reduce the effect of instructions embedded in a conversation, but do not prove immunity to prompt injection. Rate limits and reserved usage reduce uncontrolled model spending, while failed requests preserve the last valid brief. These controls have bounded test evidence rather than an assurance against every malicious input or outage.

## Evaluation and deployment limits

The evaluated domain is English restaurant enquiries. Twenty inspected dialogues per selection, one current run and hosted model aliases do not support broad accuracy or statistical superiority claims. Field matching does not independently measure quotation relevance, clarification usefulness or safe approval. Public-data pretraining contamination is unknown.

The guest endpoint currently uses Australia/Sydney as its reference-date timezone; reminder times follow the staff device. Restaurant-specific timezone configuration is needed before wider geographic deployment. Reminders update while the application is open; background notification delivery is absent. Device identities are tied to their browser and do not offer email recovery.

Messaging and reservation connectors are explicit simulations. Email registration and recovery have a separate simulation, while real delivery awaits a configured sender. There is no live reservation-provider integration, restaurant availability verification or payment processing. The application is a tested enquiry workflow with these stated operating boundaries.

<!-- PAGE 14 -->
# 12 Project delivery and next steps

## Project phases and contribution

The project progressed through five phases, extending the initial booking brief into a shared restaurant enquiry workflow.

*Table 7. Project phases and outputs.*

| Phase | Main output |
| --- | --- |
| Problem definition | Restaurant enquiry scope, current-state fields and a review-first workflow |
| NLP implementation | Rules, direct extraction, evidence validation, state reconciliation and repair limits |
| Evaluation and correction | SGD mapping, repeatable selections, strict and canonical scoring, error investigation and regression tests |
| Product development | Restaurant-styled interface, voice input, saved cases, team access, guest intake, care and review links |
| Release and communication | Deployed checks, reproducibility instructions, product films and technical findings |

Karthik Ramesh (26043455) is responsible for technical implementation. This includes the application, NLP integration, evaluation tooling, deployment and technical verification.

## Recommendations in priority order

1. **Test with restaurant staff.** Use paired tasks with and without FormBridge, vary task order and measure errors, completion time and reasons for corrections. Obtain consent and use fictional guest data.
2. **Strengthen evaluation.** Reserve an independent sample before tuning. Measure evidence, constraints, clarification and approval separately. Improve the rule baseline and compare systems with equal models and call budgets.
3. **Complete operational setup.** Configure and verify real account email delivery, recoverable staff access, restaurant timezones, retention and background reminders. Replace mock connectors only after provider authorisation and sandbox testing.
4. **Reduce waiting and cost.** Investigate when repair is needed and whether shorter evidence outputs preserve accuracy. Test both quality and latency before release.

## Conclusion

FormBridge demonstrates an end-to-end NLP application for a defined user group. It connects contextual extraction to inspectable evidence, revision-aware approval and a shared restaurant enquiry process. On the current development selection it matched 97 of 100 fields and 17 of 20 complete briefs, exceeding the configured direct baseline while using more computation. The inspected regression selection matched all 100 fields.

The product makes current details, corrections and unresolved questions available for staff review. Independent data and restaurant user studies should now test whether this workflow improves real enquiry handling.

<!-- PAGE 15 -->
# References

Amershi, S., Weld, D., Vorvoreanu, M., Fourney, A., Nushi, B., Collisson, P., Suh, J., Iqbal, S., Bennett, P. N., Inkpen, K., Teevan, J., Kikin-Gil, R., & Horvitz, E. (2019). Guidelines for human–AI interaction. In *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems* (pp. 1–13). Association for Computing Machinery. https://doi.org/10.1145/3290605.3300233

Google Research. (n.d.). *Schema-Guided Dialogue dataset* [Data set; revision e852981ae34990f4358979625854259302feaa78]. GitHub. https://github.com/google-research-datasets/dstc8-schema-guided-dialogue/tree/e852981ae34990f4358979625854259302feaa78

OpenAI. (n.d.-a). *Data controls in the OpenAI platform*. Retrieved October 13, 2026, from https://developers.openai.com/api/docs/guides/your-data

OpenAI. (n.d.-b). *Structured model outputs*. Retrieved October 13, 2026, from https://developers.openai.com/api/docs/guides/structured-outputs

Rastogi, A., Zang, X., Sunkara, S., Gupta, R., & Khaitan, P. (2020). Towards scalable multi-domain conversational agents: The Schema-Guided Dialogue dataset. *Proceedings of the AAAI Conference on Artificial Intelligence, 34*(5), 8689–8696. https://doi.org/10.1609/aaai.v34i05.6394

Supabase. (n.d.). *Row level security*. Retrieved October 13, 2026, from https://supabase.com/docs/guides/database/postgres/row-level-security

Wu, C.-S., Madotto, A., Hosseini-Asl, E., Xiong, C., Socher, R., & Fung, P. (2019). Transferable multi-domain state generator for task-oriented dialogue systems. In A. Korhonen, D. Traum, & L. Màrquez (Eds.), *Proceedings of the 57th Annual Meeting of the Association for Computational Linguistics* (pp. 808–819). Association for Computational Linguistics. https://doi.org/10.18653/v1/P19-1078

<!-- PAGE 16 -->
# Appendix A · Run the application

## Source and environment

Source: https://github.com/KarthikRamesh9149/NLP-AT2

Live application: https://formbridge-nlp-at2.vercel.app/

Use Node.js 24, pnpm 11.24.0 and Git. The commands below select the exact application revision evaluated in this report. The public repository's later documentation commits contain this report and its saved results.

~~~bash
git clone https://github.com/KarthikRamesh9149/NLP-AT2.git
cd NLP-AT2
git checkout b0d389e410af735ba622b41a937adc351162058b
pnpm install --frozen-lockfile
cp .env.example .env.local
~~~

Edit `.env.local` in a text editor. Set `OPENAI_API_KEY` to a key from your own API project, with access to the configured models. Keep the key out of source control. Set `OPENAI_MODEL=gpt-6-luna` for the report's direct baseline; the template's older direct-model default is not the reported configuration. Keep `FORMBRIDGE_MODEL=gpt-6-luna` and `FORMBRIDGE_REPAIR_MODEL=gpt-6.1-sol`.

Shared features require a dedicated Supabase project. Apply every file in `supabase/migrations/` in filename order. Set the public project URL and publishable key, plus the server-only `SUPABASE_SECRET_KEY`. Enable anonymous sign-in in Supabase before setting `NEXT_PUBLIC_DEVICE_SIGN_IN_ENABLED=true`. Rebuild after changing public environment variables. Keep real email delivery disabled until a sender and the `/auth` redirect have been verified.

~~~bash
pnpm test
pnpm typecheck
pnpm build
pnpm start
~~~

Open `http://localhost:3000`. Keep this terminal running and use a second terminal, in the same directory, for route checks or dataset commands. Stop and restart the server after rebuilding. `pnpm dev` supports development without shared storage; production AI routes deliberately reject requests when the shared allowance database is absent.

## Verification and provider boundaries

The repository's `docs/OPERATIONS.md` describes workspace setup, permissions, usage allowances and connector simulations. `scripts/check-restaurant-workspace.ts` creates synthetic accounts and cases against a configured test project. It needs the Supabase variables; use a dedicated project and retain its output to identify test records. Real API runs consume provider usage.

The `/auth/preview` route requires no mail sender. It accepts sample `.test` addresses, keeps its account and inbox in memory and clears them on refresh. Its verification and recovery links expire after 15 minutes and can be used once. This simulation has no access to real team records.

<!-- PAGE 17 -->
# Appendix B · Reproduce the evaluation

## Dataset and configuration

Run these commands from the application directory in a second terminal. Dataset acquisition is separate from installing the app. Preserve the upstream Creative Commons Attribution-ShareAlike 4.0 licence and attribution with dataset-derived material.

~~~bash
git clone \
  https://github.com/google-research-datasets/dstc8-schema-guided-dialogue.git \
  ../formbridge-sgd
git -C ../formbridge-sgd checkout e852981ae34990f4358979625854259302feaa78
pnpm data:audit ../formbridge-sgd

export OPENAI_MODEL=gpt-6-luna
export FORMBRIDGE_MODEL=gpt-6-luna
export FORMBRIDGE_REPAIR_MODEL=gpt-6.1-sol
~~~

The two selection files below already exist at application revision `b0d389e` and contain exactly the IDs used by the refreshed runs. The runner copies them into new selection records before making provider calls. Gold values are only used for scoring.

~~~bash
EVAL_RESULTS=evaluation/results
pnpm exec tsx --env-file=.env.local scripts/evaluate.ts ../formbridge-sgd \
  --split=dev --sample=20 --transport=in-process \
  --replay=all-user-turns --modes=rules,model,formbridge \
  --selection="$EVAL_RESULTS/selection-product-v17-20261013-same-primary-development.json" \
  --tag=reproduce-report-development

pnpm exec tsx --env-file=.env.local scripts/evaluate.ts ../formbridge-sgd \
  --split=test --sample=20 --transport=in-process \
  --replay=all-user-turns --modes=formbridge \
  --selection="$EVAL_RESULTS/selection-product-v17-20261013-regression.json" \
  --tag=reproduce-report-regression
~~~

## Saved outputs and scoring

The report uses `sgd-dev-20-report-v18-20261013-development.json` and `sgd-test-20-report-v18-20261013-regression.json`, under `evaluation/results/` on the report revision. Each includes selected IDs, model settings, per-field predictions, final states, per-turn usage and summary metrics. Corresponding `selection-report-v18-...` and `progress-report-v18-...` files preserve selection and progress.

Use a new tag for another run: the runner refuses to overwrite selections or final results. Keep all attempts, including provider failures and lower scores. A rerun of these samples remains development or regression evidence.

The extraction version is `grounded-state-v18`. The source fingerprint is `b9c32b2629269567a2fba24edd706bd7fdc102df7210c6721693b28f2a515424`; the runner fingerprint is `1b89aeedce527eaec164b0530f98d3072709009c57def1162fadedd40a6920ef`. Matching is implemented in `lib/evaluation-match.ts`; prefixes are replayed through `lib/evaluation-replay.ts`. The runner checks fingerprints at both ends of a run. Results may vary even when those files do not change, because hosted model responses are not fully deterministic.

<!-- PAGE 18 -->
# Appendix C · Evidence and comparisons

## Current evidence records

All paths below are relative to the public repository. Saved results identify their original source version and scope. Each record preserves the inputs, observations or instructions needed to audit the reported findings.

*Table C1. Retained technical evidence.*

| Record | Scope |
| --- | --- |
| `evaluation/results/sgd-dev-20-report-v18-20261013-development.json` | Current three-method comparison: 20 development dialogues, 100 final field checks per method |
| `evaluation/results/sgd-test-20-report-v18-20261013-regression.json` | Current FormBridge regression: 20 inspected test dialogues |
| `evaluation/results/restaurant-workspace-production.json` | 31 real production route and database checks at `0b25ba8`; provider actions simulated |
| `evaluation/results/restaurant-workspace-browser.md` | 22 restaurant workflows and associated edge checks; final source `ddf8acd` |
| `evaluation/results/email-preview-verification.md` | Email simulation tests and deployed verification at `b0d389e` |
| `tests/` | Automated test inputs and assertions; 230 passing at `b0d389e` |

## Historical equal-model comparison

The earlier application at `32af459b6a1cd20ede9b08c2b73c20a0c385301e` compared Luna direct extraction with Luna primary and Luna repair in FormBridge. On 20 development dialogues, both reached 92/100 canonical fields; FormBridge matched 14/20 complete briefs. On a further 13 then-unselected eligible test dialogues, both contextual methods matched 62/65 fields and 12/13 complete briefs.

These results qualify the interpretation of the new comparison. The earlier system did not obtain a canonical field advantage under that equal-model configuration. The current application, prompts and repair model differ, so comparing the two releases cannot attribute improvement to a single component. Even equal-model runs may have different numbers of calls and output budgets.

The historical files and commands remain in `evaluation/REPRODUCIBILITY.md` with their source revision. They are not pooled with the current 20-dialogue results and are not described as current unseen performance.

## Traceability of figures

Figures 1, 3 and 4 are actual captures of the deployed product using a fictional Juniper House workspace. The images are retained in `docs/media/`. Figure 2 is an architecture diagram drawn from the implemented request and storage paths. The product captures illustrate the workflow described in the browser verification record.

<!-- PAGE 19 -->
# Appendix D · Guest review workflow

![A private guest review showing booking details and a way to request a correction](assets/FormBridge-guest-review.png)
*Figure 4. The deployed guest review page with a fictional enquiry. A private link presents the booking details for confirmation or correction; it does not expose the staff conversation or reserve a table.*

## State transitions checked in the product

*Table D1. Guest review and handoff transitions.*

| Event | Result |
| --- | --- |
| Staff approve a current brief | Approval applies to that revision; a saved case can receive a private review link |
| Guest opens a valid link | Only the selected booking details and preferences are returned |
| Guest requests six places instead of five | A new customer message is queued; approval is removed and the case returns to Needs reply |
| Staff check the correction | The count updates while the retained date and time remain visible for review |
| Link is revoked, expired or stale | The page returns an unavailable state without showing the saved snapshot |
| Simulated provider fails | The approved enquiry remains available for staff action |

The review flow demonstrates how language input becomes an accountable change to a shared record. It also shows why a correct final value is only one part of the product: the change must reach the right enquiry, invalidate the right approval and remain understandable to staff and guest.
