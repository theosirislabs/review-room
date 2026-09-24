import { describe, expect, it } from "vitest";
import { normalizeGlobalOverviewStats } from "./globalStats";

describe("normalizeGlobalOverviewStats", () => {
  it("maps the live stats endpoint shape to the agency overview card contract", () => {
    const cards = normalizeGlobalOverviewStats([
      {
        tenantId: "tenant-a",
        name: "Acme",
        total: 12,
        approved: 4,
        blocked: 2,
        needsReview: 3,
        scheduled: 1,
        changesRequested: 2,
      },
    ]);

    expect(cards).toEqual([
      {
        id: "tenant-a",
        name: "Acme",
        totalPosts: 12,
        approved: 4,
        blocked: 2,
        needsReview: 3,
        scheduled: 1,
        changesRequested: 2,
      },
    ]);
  });
});
