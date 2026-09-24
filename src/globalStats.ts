export interface GlobalStatsTenant {
  tenantId: string;
  name: string;
  total: number;
  approved: number;
  blocked: number;
  needsReview: number;
  scheduled: number;
  changesRequested: number;
}

export interface GlobalOverviewCard extends Omit<GlobalStatsTenant, "tenantId" | "total"> {
  id: string;
  totalPosts: number;
}

export function normalizeGlobalOverviewStats(rows: GlobalStatsTenant[]): GlobalOverviewCard[] {
  return rows.map(({ tenantId, total, ...stats }) => ({
    ...stats,
    id: tenantId,
    totalPosts: total,
  }));
}
