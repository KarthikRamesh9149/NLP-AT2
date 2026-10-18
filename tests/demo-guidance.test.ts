import { describe, expect, it } from "vitest";
import { demoGuidance, type DemoGuidanceState } from "@/lib/demo-guidance";

const initial: DemoGuidanceState = {
  step: 0,
  draft: "",
  careReady: false,
  keptCount: 0,
  reviewReady: false,
  consent: false,
  availabilityReady: false,
  hasAvailability: false,
};

describe("demo presentation guidance", () => {
  it("offers a usable fill action before sending, without advancing the phase", () => {
    const blank = demoGuidance({ ...initial, step: 2 })!;
    const filled = demoGuidance({
      ...initial,
      step: 2,
      draft: "Would 8:30 pm work?",
    })!;
    expect(blank).toMatchObject({
      role: "Staff",
      action: "fill",
      label: "Fill staff reply",
    });
    expect(filled).toMatchObject({
      role: "Staff",
      action: "perform",
      label: "Add the staff reply",
    });
    expect(blank.phase).toBe(filled.phase);
    expect(blank.next).toBe("Guest accepts");
  });
  it("returns to the guest after the staff offer", () => {
    expect(
      demoGuidance({ ...initial, step: 3, draft: "Yes please" }),
    ).toMatchObject({
      role: "Guest",
      person: "Alex Morgan",
      action: "perform",
      label: "Add Alex’s answer",
    });
  });
  it("guides whitespace-only drafts back to filling rather than submitting", () => {
    expect(demoGuidance({ ...initial, draft: "   " })?.action).toBe("fill");
  });
  it("changes phase when care arrives, but not when requests are selected", () => {
    const find = demoGuidance({ ...initial, step: 4 })!;
    const choose = demoGuidance({ ...initial, step: 4, careReady: true })!;
    const chosen = demoGuidance({
      ...initial,
      step: 4,
      careReady: true,
      keptCount: 2,
    })!;
    expect(find.phase).not.toBe(choose.phase);
    expect(choose.phase).toBe(chosen.phase);
    expect(choose.label).toBe("Continue without extra requests");
    expect(chosen.label).toBe("Save 2 selected requests");
  });
  it("assigns review link creation to staff, then confirmation to the guest", () => {
    const create = demoGuidance({ ...initial, step: 6 })!;
    const review = demoGuidance({ ...initial, step: 6, reviewReady: true })!;
    const confirm = demoGuidance({
      ...initial,
      step: 6,
      reviewReady: true,
      consent: true,
    })!;
    expect(create).toMatchObject({
      role: "Staff",
      action: "perform",
      label: "Create guest review link",
    });
    expect(review).toMatchObject({
      role: "Guest",
      action: "review",
      label: "Review Alex’s details",
    });
    expect(confirm).toMatchObject({
      role: "Guest",
      action: "perform",
      label: "Confirm as Alex",
    });
    expect(create.phase).not.toBe(review.phase);
    expect(review.phase).toBe(confirm.phase);
  });
  it("offers another availability check when no slots are returned", () => {
    expect(
      demoGuidance({ ...initial, step: 7, availabilityReady: true }),
    ).toMatchObject({
      label: "Check simulated availability",
      action: "perform",
    });
    expect(
      demoGuidance({
        ...initial,
        step: 7,
        availabilityReady: true,
        hasAvailability: true,
      }),
    ).toMatchObject({
      label: "Complete simulated handoff",
      next: "Tour complete",
    });
  });
  it("does not offer another workflow action after completion", () => {
    expect(demoGuidance({ ...initial, step: 8 })).toBeNull();
  });
});
