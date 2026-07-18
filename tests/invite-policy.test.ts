import { describe, expect, it } from "vitest";
import { bootstrapEmails, isBootstrapEmail, normalizeEmail } from "../functions/src/invite-policy";
import { hasRecentLogin, RECENT_LOGIN_SECONDS, safeErrorText } from "../functions/src/security";

describe("invite-only policy helpers", () => {
  it("normalizes invitation and bootstrap emails", () => {
    expect(normalizeEmail("  Carter@Example.COM ")).toBe("carter@example.com");
    expect([...bootstrapEmails("owner@example.com, SECOND@example.com")]).toEqual(["owner@example.com", "second@example.com"]);
  });

  it("matches only an explicitly configured bootstrap owner", () => {
    expect(isBootstrapEmail("OWNER@example.com", "owner@example.com")).toBe(true);
    expect(isBootstrapEmail("other@example.com", "owner@example.com")).toBe(false);
  });
});

describe("destructive action security helpers", () => {
  it("requires a sign-in no older than ten minutes", () => {
    const now = 2_000_000;
    expect(hasRecentLogin(now - RECENT_LOGIN_SECONDS, now)).toBe(true);
    expect(hasRecentLogin(now - RECENT_LOGIN_SECONDS - 1, now)).toBe(false);
    expect(hasRecentLogin(undefined, now)).toBe(false);
  });

  it("limits error text written to monitoring logs", () => {
    expect(safeErrorText(new Error("safe"))).toBe("safe");
    expect(safeErrorText("x".repeat(2_000))).toHaveLength(1_500);
  });
});
