import { describe, expect, it } from "vitest";
import { createEmptyBrief, applyManualEdit, approveBrief } from "@/lib/state";
import {
  emptyDesk,
  emptyWorkflow,
  updateWorkflow,
  saveGuest,
  reminderAlerts,
  checkedCareSuggestions,
  mergeGuests,
  publicRestaurant,
} from "@/lib/restaurant-desk";
import {
  receiveMockMessage,
  mockAvailability,
  mockReservation,
} from "@/lib/mock-connectors";

describe("restaurant operations", () => {
  it("requires an owner or manager to publish restaurant information", () => {
    expect(
      publicRestaurant({
        ...emptyDesk().restaurant,
        name: "Juniper",
        city: "Sydney",
        published: false,
      }),
    ).toBeNull();
  });
  it("escalates an overdue assigned task at the exact configured interval", () => {
    const desk = emptyDesk();
    desk.workflows.a = {
      stage: "needs_reply",
      priority: "normal",
      assigneeId: "alice",
      dueAt: "2026-10-13T04:00:00.000Z",
      task: "Check the time",
      escalationMinutes: 60,
      guestId: null,
    };
    expect(
      reminderAlerts(desk, "alice", "staff", "2026-10-13T04:59:00.000Z")[0]
        ?.escalated,
    ).toBe(false);
    expect(
      reminderAlerts(desk, "owner", "owner", "2026-10-13T05:00:00.000Z")[0]
        ?.escalated,
    ).toBe(true);
    desk.workflows.a.stage = "handed_off";
    expect(
      reminderAlerts(desk, "alice", "staff", "2026-10-13T06:00:00.000Z"),
    ).toEqual([]);
  });
  it("rejects an assignee who is not a member of this workspace", () => {
    expect(() =>
      updateWorkflow(
        emptyDesk(),
        "a",
        {
          stage: "under_review",
          priority: "normal",
          assigneeId: "outsider",
          dueAt: null,
          task: "",
          escalationMinutes: 60,
          guestId: null,
        },
        ["alice"],
      ),
    ).toThrow();
  });
  it("moves an enquiry between guests and completely unlinks Keep separate", () => {
    const a = {
      id: crypto.randomUUID(),
      name: "Alex",
      contact: "",
      notes: "",
      caseIds: [],
      updatedAt: new Date().toISOString(),
    };
    const b = { ...a, id: crypto.randomUUID(), name: "Morgan" };
    let desk: ReturnType<typeof emptyDesk> = { ...emptyDesk(), guests: [a, b] };
    for (const guestId of [a.id, b.id, null]) {
      desk = updateWorkflow(
        desk,
        "case-one",
        { ...emptyWorkflow(), guestId },
        [],
      );
      expect(
        desk.guests
          .filter((guest) => guest.caseIds.includes("case-one"))
          .map((guest) => guest.id),
      ).toEqual(guestId ? [guestId] : []);
      expect(desk.workflows["case-one"].guestId).toBe(guestId);
    }
  });
  it("keeps guest-book edits and workflow associations consistent in both directions", () => {
    const a = {
      id: crypto.randomUUID(),
      name: "Alex",
      contact: "",
      notes: "",
      caseIds: ["case-one"],
      updatedAt: new Date().toISOString(),
    };
    const b = { ...a, id: crypto.randomUUID(), name: "Morgan", caseIds: [] };
    let desk = saveGuest({ ...emptyDesk(), guests: [b] }, a);
    expect(desk.workflows["case-one"].guestId).toBe(a.id);
    desk = saveGuest(desk, { ...b, caseIds: ["case-one"] });
    expect(desk.guests.find((g) => g.id === a.id)?.caseIds).toEqual([]);
    expect(desk.workflows["case-one"].guestId).toBe(b.id);
    desk = saveGuest(desk, { ...b, caseIds: [] });
    expect(desk.workflows["case-one"].guestId).toBeNull();
  });
  it("accepts only customer quotations that actually support the care value", () => {
    const messages = [
      {
        id: "m1",
        speaker: "customer" as const,
        text: "One guest has a peanut allergy. A quiet table please.",
      },
    ];
    const proposals = checkedCareSuggestions(
      [
        {
          field: "dietary",
          value: "peanut allergy",
          quote: "peanut allergy",
          messageId: "m1",
        },
        { field: "name", value: "Alex", quote: "Alex", messageId: "m1" },
        {
          field: "seating",
          value: "window",
          quote: "quiet table",
          messageId: "m1",
        },
      ],
      messages,
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].value).toBe("peanut allergy");
  });
  it("requires explicit merge consent and retains both guest histories", () => {
    const desk = emptyDesk();
    desk.guests = [
      {
        id: "a",
        name: "Alex",
        contact: "alex@example.test",
        notes: "",
        caseIds: ["one"],
        updatedAt: "2026-10-13T00:00:00.000Z",
      },
      {
        id: "b",
        name: "Alex R",
        contact: "alex@example.test",
        notes: "Quiet table requested",
        caseIds: ["two"],
        updatedAt: "2026-10-13T00:00:00.000Z",
      },
    ];
    expect(() => mergeGuests(desk, "a", "b", false)).toThrow();
    const next = mergeGuests(desk, "a", "b", true);
    expect(next.guests).toHaveLength(1);
    expect(next.guests[0].caseIds).toEqual(["one", "two"]);
    expect(next.guests[0].notes).toContain("Quiet table");
  });
  it("publishes approved facts and excludes drafts and staff notes", () => {
    const desk = emptyDesk();
    desk.restaurant = {
      ...desk.restaurant,
      name: "Juniper",
      city: "Sydney",
      published: true,
      facts: [
        {
          id: "a",
          category: "hours",
          title: "Hours",
          text: "Dinner from 5 pm",
          approved: true,
        },
        {
          id: "b",
          category: "policy",
          title: "Draft",
          text: "Internal note",
          approved: false,
        },
      ],
    };
    const result = publicRestaurant(desk.restaurant)!;
    expect(result.facts).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("Internal note");
  });
});

describe("simulated connectors", () => {
  it("deduplicates redelivered channel messages while retaining real new messages", () => {
    const desk = emptyDesk();
    const event = {
      id: "event-one",
      channel: "email" as const,
      from: "alex@example.test",
      name: "Alex",
      text: "A table for four please.",
    };
    const first = receiveMockMessage(desk, event, "case-one");
    const again = receiveMockMessage(first, event, "case-two");
    expect(again.inbox).toHaveLength(1);
    expect(again.inbox[0].caseId).toBe("case-one");
    expect(again.inbox[0].simulation).toBe(true);
    expect(
      receiveMockMessage(again, { ...event, id: "event-two" }, "case-two")
        .inbox,
    ).toHaveLength(2);
  });
  it("never offers simulated availability without an exact valid request", () => {
    expect(() =>
      mockAvailability({ date: "2026-02-30", time: "20:00", partySize: 4 }),
    ).toThrow();
    expect(() =>
      mockAvailability({
        date: "2027-10-18",
        time: "after eight",
        partySize: 4,
      }),
    ).toThrow();
    const result = mockAvailability({
      date: "2027-10-18",
      time: "20:30",
      partySize: 5,
    });
    expect(result.simulation).toBe(true);
    expect(result.slots.some((s) => s.time === "20:30")).toBe(true);
  });
  it("rejects unapproved or stale booking handoffs and always marks the result simulated", () => {
    let brief = createEmptyBrief();
    for (const [field, value] of [
      ["restaurantName", "Juniper"],
      ["city", "Sydney"],
      ["date", "18 October 2027"],
      ["time", "8:30 pm"],
      ["partySize", "5"],
    ] as const)
      brief = applyManualEdit(brief, field, value);
    expect(() =>
      mockReservation({ messages: [], brief }, "opentable", "key"),
    ).toThrow();
    brief = approveBrief(brief);
    const reservation = mockReservation(
      { messages: [], brief },
      "opentable",
      "key",
    );
    expect(reservation.status).toBe("simulated_confirmed");
    expect(reservation.simulation).toBe(true);
    expect(reservation.reference).toMatch(/^SIM-/);
    expect(() =>
      mockReservation(
        { messages: [], brief, pendingAnalysis: true },
        "opentable",
        "key",
      ),
    ).toThrow();
  });
});
