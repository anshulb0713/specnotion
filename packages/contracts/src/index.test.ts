import { describe, expect, it } from "vitest";
import { createCardSchema, createProjectSchema, inviteMemberSchema } from "./index";

describe("createCardSchema", () => {
  it("accepts a whole-block review", () => {
    expect(
      createCardSchema.parse({
        title: "Cache invalidation risk",
        body: "How is stale data removed?",
        risk: "blocker",
        anchor: { blockStart: 10, blockEnd: 40 },
      }),
    ).toMatchObject({ risk: "blocker" });
  });

  it("rejects an empty first message", () => {
    expect(() =>
      createCardSchema.parse({
        title: "Cache invalidation risk",
        body: "",
        risk: "discussion",
        anchor: { blockStart: 10, blockEnd: 40 },
      }),
    ).toThrow();
  });
});

describe("inviteMemberSchema", () => {
  it("normalizes an invited email", () => {
    expect(inviteMemberSchema.parse({ email: " NEW@Example.COM " })).toEqual({
      email: "new@example.com",
    });
  });

  it("ignores client-supplied role escalation fields", () => {
    expect(inviteMemberSchema.parse({ email: "member@example.com", role: "project_owner" })).toEqual({
      email: "member@example.com",
    });
  });
});

describe("createProjectSchema", () => {
  it("trims a valid project name", () => {
    expect(createProjectSchema.parse({ name: "  Payments Platform  " })).toEqual({
      name: "Payments Platform",
    });
  });

  it("rejects empty and oversized project names", () => {
    expect(() => createProjectSchema.parse({ name: " " })).toThrow();
    expect(() => createProjectSchema.parse({ name: "x".repeat(121) })).toThrow();
  });
});
