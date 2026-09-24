import { describe, expect, it } from "vitest";
import { buildAnalyticsQuery, getOperationalAnalytics } from "./analyticsUtils";

describe("analytics utilities", () => {
  it("keeps the selected analytics date range in the request and CSV query", () => {
    const query = buildAnalyticsQuery("tenant a", { from: "2026-09-01", to: "2026-09-30" });
    const params = new URLSearchParams(query);

    expect(params.get("tenantId")).toBe("tenant a");
    expect(params.get("from")).toBe("2026-09-01");
    expect(params.get("to")).toBe("2026-09-30");
  });

  it("reports actionable schedule and review pressure without counting approved feedback as overdue", () => {
    const operational = getOperationalAnalytics([
      { internalStatus: "Ready to Schedule", isBlocked: false },
      { internalStatus: "Scheduled", isBlocked: true, scheduledAt: null },
      { internalStatus: "Changes Requested", isBlocked: false, dueDate: "2026-09-17" },
      { internalStatus: "Approved", isBlocked: false, dueDate: "2026-09-17" },
    ], new Date(2026, 8, 18, 12, 0, 0));

    expect(operational).toEqual({
      readyToSchedule: 1,
      missingScheduleTime: 1,
      blocked: 1,
      overdueFeedback: 1,
    });
  });
});
