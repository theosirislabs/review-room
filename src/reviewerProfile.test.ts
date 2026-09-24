import { beforeEach, describe, expect, it } from "vitest";
import {
  normalizeReviewerName,
  readReviewerPreference,
  reviewerNameFromHash,
  saveReviewerPreference,
  withReviewerFragment,
} from "./reviewerProfile";

describe("reviewerProfile", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes names without losing ordinary punctuation", () => {
    expect(normalizeReviewerName("  Jordan\n  Lee  ")).toBe("Jordan Lee");
    expect(normalizeReviewerName("A&B")).toBe("A&B");
    expect(normalizeReviewerName("x".repeat(100))).toHaveLength(80);
  });

  it("stores a remembered name per user and tenant", () => {
    saveReviewerPreference("user-1", "acme", { name: "Jordan Lee", remember: true });
    expect(readReviewerPreference("user-1", "acme")).toEqual({ name: "Jordan Lee", remember: true });
    expect(readReviewerPreference("user-2", "acme")).toEqual({ name: "", remember: false });
    expect(readReviewerPreference("user-1", "other")).toEqual({ name: "", remember: false });
  });

  it("clears the stored preference when remember is disabled", () => {
    saveReviewerPreference("user-1", "acme", { name: "Jordan Lee", remember: true });
    saveReviewerPreference("user-1", "acme", { name: "Jordan Lee", remember: false });
    expect(readReviewerPreference("user-1", "acme")).toEqual({ name: "", remember: false });
  });

  it("reads a reviewer name from a URL fragment", () => {
    expect(reviewerNameFromHash("#reviewer=Jordan%20Lee&section=feedback")).toBe("Jordan Lee");
    expect(reviewerNameFromHash("#reviewer=%20%20")).toBe("");
  });

  it("adds a reviewer fragment while preserving other fragment parameters", () => {
    const result = withReviewerFragment("https://example.test/review/token?source=mail#section=feedback", "Jordan & Lee");
    const parsed = new URL(result);
    expect(parsed.searchParams.get("source")).toBe("mail");
    expect(new URLSearchParams(parsed.hash.slice(1)).get("section")).toBe("feedback");
    expect(reviewerNameFromHash(parsed.hash)).toBe("Jordan & Lee");
  });
});
