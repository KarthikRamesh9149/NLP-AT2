import { describe, it, expect } from "vitest";
import { readGuestDraft } from "@/lib/guest-draft";
import { emptyGuestCare } from "@/lib/follow-up";
import { messageSchema } from "@/lib/contracts";
import { mergeGuests, emptyDesk } from "@/lib/restaurant-desk";
const draft = {
  messages: [],
  draft: "Still choosing a time",
  care: emptyGuestCare(),
  fields: null,
  submissionId: "647b7b5c-a339-4e71-b17e-345de38c4f73",
  received: false,
  savedAt: 1000,
};
describe("guest draft recovery", () => {
  it("restores a valid tab draft and rejects expired or malformed storage", () => {
    expect(readGuestDraft(JSON.stringify(draft), 2000)?.draft).toBe(
      "Still choosing a time",
    );
    expect(readGuestDraft(JSON.stringify(draft), 86_401_001)).toBeNull();
    expect(readGuestDraft("{bad")).toBeNull();
    expect(
      readGuestDraft(
        JSON.stringify({
          ...draft,
          messages: [{ id: "x".repeat(50), speaker: "customer", text: "Hi" }],
        }),
        2000,
      ),
    ).toBeNull();
  });
  it("uses message identifiers accepted by the conversation boundary", () => {
    for (const prefix of ["g_", "s_", "c_"])
      expect(
        messageSchema.safeParse({
          id: prefix + draft.submissionId,
          speaker: "customer",
          text: "Hi",
        }).success,
      ).toBe(true);
  });
  it("refuses a guest merge that would silently truncate notes", () => {
    const desk = emptyDesk();
    desk.guests = [
      {
        id: "a",
        name: "Alex",
        contact: "",
        notes: "a".repeat(1200),
        caseIds: [],
        updatedAt: "2026-10-13T00:00:00Z",
      },
      {
        id: "b",
        name: "Alex",
        contact: "",
        notes: "b".repeat(1000),
        caseIds: [],
        updatedAt: "2026-10-13T00:00:00Z",
      },
    ];
    expect(() => mergeGuests(desk, "a", "b", true)).toThrow("combined notes");
  });
});
