import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AnalyticsView from "./AnalyticsView";

vi.mock("recharts", () => {
  const Frame = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    BarChart: Frame,
    Bar: Frame,
    PieChart: Frame,
    Pie: Frame,
    Cell: Frame,
    LineChart: Frame,
    Line: Frame,
    XAxis: Frame,
    YAxis: Frame,
    Tooltip: Frame,
    ResponsiveContainer: Frame,
  };
});

const analytics = {
  totalPosts: 4,
  approvalRate: 50,
  statusPipeline: [
    { status: "Ready for Client", count: 1 },
    { status: "Scheduled", count: 1 },
  ],
  pillarMix: [],
  formatDistribution: [],
  weeklyApproval: [],
  clientStatus: { approved: 2, needsReview: 1, changesRequested: 1 },
  operational: { readyToSchedule: 3, missingScheduleTime: 1, blocked: 2, overdueFeedback: 4 },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AnalyticsView export", () => {
  it("shows operational pressure alongside historical analytics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => analytics }));

    render(<AnalyticsView tenantId="tenant-a" adminToken="session-token" brandName="Acme" />);

    expect(await screen.findByText("Operational pressure")).not.toBeNull();
    expect(screen.getByText("Feedback overdue").parentElement?.textContent).toContain("4");
    expect(screen.getByText("Missing schedule time").parentElement?.textContent).toContain("1");
  });

  it("offers a retry action when analytics cannot be loaded", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "unavailable" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => analytics });
    vi.stubGlobal("fetch", fetchMock);

    render(<AnalyticsView tenantId="tenant-a" adminToken="session-token" brandName="Acme" />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Analytics unavailable");
    await user.click(screen.getByRole("button", { name: "Retry analytics" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Content performance overview/)).not.toBeNull();
  });

  it("surfaces an export failure instead of downloading an error response", async () => {
    const user = userEvent.setup();
    const NativeURL = globalThis.URL;
    class URLWithBlobSupport extends NativeURL {}
    const createObjectURL = vi.fn(() => "blob:export");
    Object.assign(URLWithBlobSupport, { createObjectURL, revokeObjectURL: vi.fn() });
    vi.stubGlobal("URL", URLWithBlobSupport);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => analytics })
      .mockResolvedValueOnce({ ok: false, status: 403, blob: async () => new Blob(["forbidden"]) }));

    render(<AnalyticsView tenantId="tenant-a" brandName="Acme" adminToken="token" />);
    await screen.findByText(/Content performance overview/);
    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Export failed");
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("exports the date range currently selected by the operator", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => analytics })
      .mockResolvedValueOnce({ ok: true, json: async () => analytics })
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["id,title\n1,Launch"]) });
    vi.stubGlobal("fetch", fetchMock);
    const NativeURL = globalThis.URL;
    class URLWithBlobSupport extends NativeURL {}
    Object.assign(URLWithBlobSupport, {
      createObjectURL: vi.fn(() => "blob:export"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("URL", URLWithBlobSupport);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<AnalyticsView tenantId="tenant-a" adminToken="session-token" brandName="Acme" />);
    await screen.findByText("Analytics");

    await user.click(screen.getByRole("button", { name: "Last 30d" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("button", { name: /Export CSV/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [url] = fetchMock.mock.calls[2] as [string];
    const params = new URL(url, "https://review-room.test").searchParams;
    expect(params.get("tenantId")).toBe("tenant-a");
    expect(params.get("from")).toBeTruthy();
    expect(params.get("to")).toBeTruthy();
  });
});
