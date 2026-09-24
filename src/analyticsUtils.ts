export interface AnalyticsRange {
  from?: string;
  to?: string;
}

export interface AnalyticsOperationalPost {
  internalStatus: string;
  isBlocked?: boolean;
  dueDate?: string | null;
  scheduledAt?: string | null;
}

export interface OperationalAnalytics {
  readyToSchedule: number;
  missingScheduleTime: number;
  blocked: number;
  overdueFeedback: number;
}

const FINAL_FEEDBACK_STATUSES = new Set(["Approved", "Posted"]);

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildAnalyticsQuery(tenantId: string, range: AnalyticsRange = {}): string {
  const params = new URLSearchParams({ tenantId });
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  return params.toString();
}

export function getOperationalAnalytics(
  posts: AnalyticsOperationalPost[],
  now: Date = new Date(),
): OperationalAnalytics {
  const today = localDateKey(now);
  return {
    readyToSchedule: posts.filter((post) => post.internalStatus === "Ready to Schedule").length,
    missingScheduleTime: posts.filter((post) => post.internalStatus === "Scheduled" && !post.scheduledAt).length,
    blocked: posts.filter((post) => Boolean(post.isBlocked)).length,
    overdueFeedback: posts.filter((post) => {
      const dueDate = String(post.dueDate || "").slice(0, 10);
      return Boolean(dueDate) && dueDate < today && !FINAL_FEEDBACK_STATUSES.has(post.internalStatus);
    }).length,
  };
}
