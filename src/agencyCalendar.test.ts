import { describe, expect, it } from "vitest";
import type { Post } from "./types";
import {
  buildCalendarEvents,
  scheduleAtFromDateAndTime,
  scheduledAtForStatusTransition,
  schedulingPatchForPost,
  scheduleHealth,
} from "./agencyCalendar";

const basePost: Post = {
  id: "p-1",
  title: "Launch reel",
  format: "reel",
  mediaUrls: [],
  caption: "",
  hashtags: [],
  date: "2026-09-20",
  time: "12:00 PM",
  clientStatus: "Approved",
  clientComments: [],
  internalStatus: "Scheduled",
  assignee: "Amina",
  campaignCode: "SEP",
  contentPillar: "Launch",
  internalNotes: "",
  assetLineage: "",
  isBlocked: false,
  internalTasks: [],
};

describe("agency calendar model", () => {
  it("combines schedule and feedback-due signals for the same post/day without duplicate cards", () => {
    const events = buildCalendarEvents([{ ...basePost, dueDate: "2026-09-20" }]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ date: "2026-09-20", postId: "p-1" });
    expect(events[0].kinds).toEqual(expect.arrayContaining(["scheduled", "feedback-due"]));
  });

  it("uses a local schedule timestamp for noon and midnight without changing the selected calendar day", () => {
    const noon = new Date(scheduleAtFromDateAndTime("2026-09-20", "12:00 PM"));
    const midnight = new Date(scheduleAtFromDateAndTime("2026-09-20", "12:00 AM"));

    expect([noon.getFullYear(), noon.getMonth() + 1, noon.getDate(), noon.getHours()]).toEqual([2026, 9, 20, 12]);
    expect([midnight.getFullYear(), midnight.getMonth() + 1, midnight.getDate(), midnight.getHours()]).toEqual([2026, 9, 20, 0]);
  });

  it("keeps a locally selected midnight schedule on its intended calendar day", () => {
    const scheduledAt = scheduleAtFromDateAndTime("2026-09-20", "12:00 AM");
    const events = buildCalendarEvents([{ ...basePost, date: "", scheduledAt }]);

    expect(events).toHaveLength(1);
    expect(events[0].date).toBe("2026-09-20");
    expect(events[0].kinds).toContain("scheduled");
  });

  it("adds an auto-publish timestamp when work becomes scheduled", () => {
    const scheduledAt = scheduledAtForStatusTransition(
      "Ready to Schedule",
      "Scheduled",
      "2026-09-20",
      "1:30 PM",
    );

    const local = new Date(scheduledAt as string);
    expect(local.getFullYear()).toBe(2026);
    expect(local.getMonth()).toBe(8);
    expect(local.getDate()).toBe(20);
    expect(local.getHours()).toBe(13);
    expect(local.getMinutes()).toBe(30);
  });

  it("clears an auto-publish timestamp when scheduled work leaves the schedule", () => {
    expect(scheduledAtForStatusTransition("Scheduled", "Changes Requested", "2026-09-20", "1:30 PM")).toBeNull();
  });

  it("rebuilds the worker timestamp when a scheduled post moves to a new date", () => {
    const scheduledPost: Post = { ...basePost, internalStatus: "Scheduled", scheduledAt: "2026-09-20T10:30:00.000Z" };
    const patch = schedulingPatchForPost(
      scheduledPost,
      { date: "2026-09-23" },
    );

    expect(patch).toMatchObject({ date: "2026-09-23" });
    const local = new Date(patch.scheduledAt as string);
    expect(local.getFullYear()).toBe(2026);
    expect(local.getMonth()).toBe(8);
    expect(local.getDate()).toBe(23);
    expect(local.getHours()).toBe(12);
    expect(local.getMinutes()).toBe(0);
  });

  it("uses the actual scheduled day instead of duplicating a stale planned date", () => {
    const scheduledAt = scheduleAtFromDateAndTime("2026-09-22", "9:00 AM");
    const events = buildCalendarEvents([{ ...basePost, date: "2026-09-20", scheduledAt }]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ date: "2026-09-22", kinds: ["scheduled"] });
  });

  it("rejects calendar dates that JavaScript would otherwise normalize", () => {
    expect(() => scheduleAtFromDateAndTime("2026-02-31", "9:00 AM")).toThrow("valid calendar date");
  });

  it("separates ready-to-schedule work from already timestamped schedules", () => {
    const health = scheduleHealth([
      { ...basePost, id: "ready", internalStatus: "Ready to Schedule", scheduledAt: undefined },
      { ...basePost, id: "missing-time", internalStatus: "Scheduled", scheduledAt: undefined },
      { ...basePost, id: "scheduled", scheduledAt: "2026-09-20T09:00:00.000Z" },
    ]);

    expect(health.readyToSchedule.map((post) => post.id)).toEqual(["ready"]);
    expect(health.missingScheduleTime.map((post) => post.id)).toEqual(["missing-time"]);
    expect(health.scheduled.map((post) => post.id)).toEqual(["scheduled"]);
  });
});
