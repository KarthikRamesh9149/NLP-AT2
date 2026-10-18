import { DEMO_STEPS } from "./guided-demo";

export type DemoGuidanceState = {
  step: number;
  draft: string;
  careReady: boolean;
  keptCount: number;
  reviewReady: boolean;
  consent: boolean;
  availabilityReady: boolean;
  hasAvailability: boolean;
};

export function demoGuidance(state: DemoGuidanceState) {
  const step = DEMO_STEPS[state.step];
  if (!step) return null;
  const messageStep = [0, 1, 2, 3, 5].includes(state.step);
  const role = state.step === 6 && !state.reviewReady ? "Staff" : step.role;
  const person = role === "Guest" ? "Alex Morgan" : "Juniper House host";
  const fillLabel =
    state.step === 5
      ? "Fill handoff note"
      : role === "Staff"
        ? "Fill staff reply"
        : "Fill guest message";
  let action: "fill" | "perform" | "review" =
    messageStep && !state.draft.trim() ? "fill" : "perform";
  let label: string = action === "fill" ? fillLabel : step.action;
  let instruction =
    action === "fill"
      ? `Click “${fillLabel}” or press Tab in the message box. Then click “${step.action}”.`
      : `Ready to continue. Click “${label}” below.`;
  let phase = String(state.step);
  let next: string = DEMO_STEPS[state.step + 1]?.short ?? "Tour complete";

  if (state.step === 4) {
    phase += state.careReady ? ":choose" : ":find";
    if (state.careReady) {
      label = state.keptCount
        ? `Save ${state.keptCount} selected request${state.keptCount > 1 ? "s" : ""}`
        : "Continue without extra requests";
      instruction = state.keptCount
        ? `You’ve selected ${state.keptCount} request${state.keptCount > 1 ? "s" : ""}. Click “${label}” below.`
        : "Read the quotations and tick the requests you want to keep. You can also continue without adding any.";
    } else {
      next = "Choose the guest’s requests";
    }
  }
  if (state.step === 6) {
    phase += state.reviewReady ? ":confirm" : ":create";
    if (state.reviewReady) {
      action = state.consent ? "perform" : "review";
      label = state.consent ? "Confirm as Alex" : "Review Alex’s details";
      instruction = state.consent
        ? "Details checked. Click “Confirm as Alex” to send the review back to the team."
        : "You’re Alex now. Check the details and tick the confirmation box, then click “Confirm as Alex”.";
    } else {
      instruction =
        "You’re the host. Click “Create guest review link”, then switch to Alex’s view.";
      next = "Alex checks the details";
    }
  }
  if (state.step === 7) {
    phase += state.availabilityReady ? ":handoff" : ":check";
    if (state.availabilityReady && state.hasAvailability) {
      label = "Complete simulated handoff";
      instruction =
        "Review the demonstration times, then click “Complete simulated handoff”. No real table is reserved.";
    } else {
      instruction = state.availabilityReady
        ? "No demonstration times were returned. Click “Check simulated availability” to try again."
        : "Click “Check simulated availability” to see the demonstration provider’s times.";
      next = "Review the simulated handoff";
    }
  }
  return { role, person, label, instruction, action, phase, next };
}
