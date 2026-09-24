import type { Post } from "./types";
import { dateOnly, isOverdue, parseDateSafe } from "./utils";

export type CalendarEventKind = "planned" | "scheduled" | "feedback-due";

export interface CalendarEvent {
  date: string;
  postId: string;
  post: Post;
  kinds: CalendarEventKind[];
}

export interface ScheduleHealth {
  readyToSchedule: Post[];
  missingScheduleTime: Post[];
  scheduled: Post[];
  overdueFeedback: Post[];
  blocked: Post[];
}

const TERMINAL_STATUSES = new Set(["Approved", "Posted"]);

export function isScheduledPost(post: Post): boolean {
  return post.internalStatus === "Scheduled" || post.internalStatus === "Posted" || !!post.scheduledAt;
}

function localDateKey(value?: string | null): string {
  if (!value) return "";
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
  return `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, "0")}-${String(instant.getDate()).padStart(2, "0")}`;
}

function insertEvent(
  events: Map<string, CalendarEvent>,
  post: Post,
  date: string,
  kind: CalendarEventKind,
) {
  if (!date) return;
  const key = `${post.id}:${date}`;
  const existing = events.get(key);
  if (existing) {
    if (!existing.kinds.includes(kind)) existing.kinds.push(kind);
    return;
  }
  events.set(key, { date, postId: post.id, post, kinds: [kind] });
}

/**
 * Produces one calendar item per post/day, even when a publication and a
 * feedback deadline coincide. A scheduled timestamp wins over a generic
 * planned date so operators can distinguish intent from an actual schedule.
 */
export function buildCalendarEvents(posts: Post[]): CalendarEvent[] {
  const events = new Map<string, CalendarEvent>();

  for (const post of posts) {
    const plannedDate = dateOnly(post.date);
    // Timestamps are stored as UTC instants; render them in the operator's local
    // calendar. Date-only legacy values keep their explicit date unchanged.
    const scheduledDate = post.scheduledAt?.includes("T")
      ? localDateKey(post.scheduledAt)
      : dateOnly(post.scheduledAt);
    const dueDate = dateOnly(post.dueDate);

    if (scheduledDate) {
      insertEvent(events, post, scheduledDate, "scheduled");
    } else if (plannedDate) {
      insertEvent(events, post, plannedDate, isScheduledPost(post) ? "scheduled" : "planned");
    }
    if (dueDate) insertEvent(events, post, dueDate, "feedback-due");
  }

  return [...events.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const byTime = parseDateSafe(a.post.date || a.date, a.post.time || "") - parseDateSafe(b.post.date || b.date, b.post.time || "");
    if (byTime !== 0) return byTime;
    return a.post.title.localeCompare(b.post.title);
  });
}

/** Normalises 24-hour and AM/PM content times into a local scheduled instant. */
export function scheduleAtFromDateAndTime(date: string, time?: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) throw new Error("A valid calendar date is required to schedule a post.");

  const value = (time || "12:00 PM").trim();
  const matched = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!matched) throw new Error("Use a valid post time to schedule this post.");

  let hours = Number(matched[1]);
  const minutes = Number(matched[2] || "0");
  const meridiem = matched[3]?.toUpperCase();
  if (minutes > 59 || hours > 23 || hours < 0) throw new Error("Use a valid post time to schedule this post.");

  if (meridiem) {
    if (hours < 1 || hours > 12) throw new Error("Use a valid 12-hour post time to schedule this post.");
    if (hours === 12) hours = 0;
    if (meridiem === "PM") hours += 12;
  }

  const local = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    Number.isNaN(local.getTime())
    || local.getFullYear() !== year
    || local.getMonth() !== month - 1
    || local.getDate() !== day
  ) {
    throw new Error("Use a valid calendar date to schedule this post.");
  }
  return local.toISOString();
}

export function scheduledAtForStatusTransition(
  previousStatus: Post["internalStatus"] | undefined,
  nextStatus: Post["internalStatus"],
  date: string,
  time: string,
): string | null | undefined {
  if (nextStatus === "Scheduled") return scheduleAtFromDateAndTime(date, time);
  if (previousStatus === "Scheduled") return null;
  return undefined;
}

export function schedulingPatchForPost(
  post: Pick<Post, "date" | "time" | "internalStatus">,
  changes: Partial<Pick<Post, "date" | "time" | "internalStatus">>,
): Partial<Pick<Post, "date" | "time" | "internalStatus" | "scheduledAt">> {
  const date = changes.date ?? post.date;
  const time = changes.time ?? post.time;
  const internalStatus = changes.internalStatus ?? post.internalStatus;
  const scheduledAt = scheduledAtForStatusTransition(post.internalStatus, internalStatus, date, time);

  return {
    ...changes,
    ...(scheduledAt === undefined ? {} : { scheduledAt }),
  };
}

export function scheduleHealth(posts: Post[], now: Date = new Date()): ScheduleHealth {
  const readyToSchedule = posts.filter((post) => post.internalStatus === "Ready to Schedule");
  const missingScheduleTime = posts.filter(
    (post) => post.internalStatus === "Scheduled" && !dateOnly(post.scheduledAt),
  );
  const scheduled = posts.filter(
    (post) => post.internalStatus === "Scheduled" && !!dateOnly(post.scheduledAt),
  );
  const overdueFeedback = posts.filter(
    (post) => !TERMINAL_STATUSES.has(post.internalStatus) && isOverdue(post.dueDate, now),
  );
  const blocked = posts.filter((post) => post.isBlocked);

  return { readyToSchedule, missingScheduleTime, scheduled, overdueFeedback, blocked };
}
