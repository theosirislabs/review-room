import { describe, expect, it } from "vitest";
import {
  ALLOWED_CLIENT_STATUSES,
  ALLOWED_INTERNAL_STATUSES,
  COMMENT_LIMITS,
  POST_LIMITS,
  validateCommentMutation,
  validatePostMutation,
} from "./validation.js";

describe("post and comment validation", () => {
  it("accepts bounded compatible post payloads and defaults create fields", () => {
    const result = validatePostMutation({
      title: "  Launch post  ",
      format: "carousel",
      internalStatus: "Ready for Client",
      clientStatus: "Needs Your Review",
      mediaUrls: ["/uploads/one.jpg"],
      hashtags: ["#launch"],
      scheduledAt: null,
    }, undefined, true);
    expect(result).toEqual({
      ok: true,
      value: {
        title: "Launch post",
        format: "carousel",
        internalStatus: "Ready for Client",
        clientStatus: "Needs Your Review",
        mediaUrls: ["/uploads/one.jpg"],
        hashtags: ["#launch"],
        scheduledAt: null,
      },
    });
  });

  it("rejects invalid statuses, formats, and oversized arrays", () => {
    expect(validatePostMutation({ title: "", format: "image" }, undefined, true).ok).toBe(false);
    expect(validatePostMutation({ title: "x", format: "video" }, undefined, true).ok).toBe(false);
    expect(validatePostMutation({ title: "x", internalStatus: "Unknown" }, undefined, true).ok).toBe(false);
    expect(validatePostMutation({ title: "x", clientStatus: "Unknown" }, undefined, true).ok).toBe(false);
    expect(validatePostMutation({ title: "x", mediaUrls: Array.from({ length: POST_LIMITS.mediaUrls + 1 }, () => "/uploads/a.jpg") }, undefined, true).ok).toBe(false);
    expect(validatePostMutation({ title: "x", hashtags: Array.from({ length: POST_LIMITS.hashtags + 1 }, () => "#x") }, undefined, true).ok).toBe(false);
  });

  it("requires a valid schedule when entering Scheduled", () => {
    expect(validatePostMutation({ internalStatus: "Scheduled" }, { internalStatus: "Draft", scheduledAt: null }).ok).toBe(false);
    expect(validatePostMutation({ internalStatus: "Scheduled" }, { internalStatus: "Draft", scheduledAt: "2026-12-01T10:00:00.000Z" }).ok).toBe(true);
    expect(validatePostMutation({ title: "Already scheduled", scheduledAt: undefined }, { internalStatus: "Scheduled", scheduledAt: "2026-12-01T10:00:00.000Z" }).ok).toBe(true);
    expect(validatePostMutation({ title: "x", internalStatus: "Scheduled" }, undefined, true).ok).toBe(false);
  });

  it("bounds comment text and structured fields while ignoring identity fields", () => {
    const result = validateCommentMutation({
      id: "untrusted-id",
      author: "untrusted-author",
      timestamp: "1900-01-01T00:00:00.000Z",
      text: "  Looks good  ",
      changeType: " Tone ",
      priority: "high",
      slideIndex: 2,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        text: "Looks good",
        isInternalOnly: false,
        changeType: "Tone",
        priority: "high",
        slideIndex: 2,
      },
    });
    expect(validateCommentMutation({ text: "x".repeat(COMMENT_LIMITS.text + 1) }).ok).toBe(false);
    expect(validateCommentMutation({ text: "x", priority: "urgent" }).ok).toBe(false);
    expect(validateCommentMutation({ text: "x", slideIndex: -1 }).ok).toBe(false);
  });

  it("keeps allowed status sets explicit", () => {
    expect(ALLOWED_INTERNAL_STATUSES).toContain("Scheduled");
    expect(ALLOWED_CLIENT_STATUSES).toContain("Changes Requested");
  });
});
