import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Post } from "../types";
import CalendarView from "./CalendarView";

const makePost = (overrides: Partial<Post> = {}): Post => ({
  id: "calendar-post",
  tenantId: "tenant-a",
  title: "September launch reel",
  format: "reel",
  mediaUrls: ["/uploads/launch.mp4"],
  caption: "Launch day",
  hashtags: [],
  date: "2026-09-20",
  time: "1:30 PM",
  clientStatus: "Approved",
  internalStatus: "Ready to Schedule",
  assignee: "Momen",
  campaignCode: "SEP-LAUNCH",
  contentPillar: "Product Launch",
  internalNotes: "",
  assetLineage: "",
  isBlocked: false,
  clientComments: [],
  internalTasks: [],
  ...overrides,
});

const post = makePost();

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 18, 12, 0, 0));
});

describe("CalendarView", () => {
  it("keeps the current date when the native jump picker is cleared", () => {
    render(<CalendarView posts={[post]} onOpenPost={vi.fn()} />);

    const jumpDate = screen.getByLabelText("Jump to date") as HTMLInputElement;
    fireEvent.change(jumpDate, { target: { value: "" } });

    expect(jumpDate.value).toBe("2026-09-18");
  });

  it("keeps the selected agenda date inside the month an operator navigates to", () => {
    render(<CalendarView posts={[post]} onOpenPost={vi.fn()} />);

    const jumpDate = screen.getByLabelText("Jump to date") as HTMLInputElement;
    expect(jumpDate.value).toBe("2026-09-18");

    fireEvent.click(screen.getByRole("button", { name: "Show October 2026" }));

    expect(jumpDate.value).toBe("2026-10-18");
  });

  it("moves the agenda to the day an operator selects in the month grid", () => {
    render(<CalendarView posts={[post]} onOpenPost={vi.fn()} />);

    fireEvent.click(screen.getByRole("gridcell", { name: /Show agenda for Sunday, September 20, 2026/ }));

    expect((screen.getByLabelText("Jump to date") as HTMLInputElement).value).toBe("2026-09-20");
    expect(screen.getByRole("heading", { name: "Sunday, September 20" })).not.toBeNull();
  });

  it("supports keyboard selection on month grid days", () => {
    render(<CalendarView posts={[post]} onOpenPost={vi.fn()} />);

    fireEvent.keyDown(screen.getByRole("gridcell", { name: /Show agenda for Tuesday, September 22, 2026/ }), { key: "Enter" });

    expect((screen.getByLabelText("Jump to date") as HTMLInputElement).value).toBe("2026-09-22");
  });

  it("points an empty month at the next dated item while one is still upcoming", () => {
    render(<CalendarView posts={[makePost({ date: "2026-10-02" })]} onOpenPost={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Jump to next dated item/ })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Jump to earliest dated item/ })).toBeNull();
  });

  it("labels the jump action as earliest when every dated item has passed", () => {
    render(<CalendarView posts={[makePost({ date: "2026-07-04" })]} onOpenPost={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Jump to earliest dated item/ })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Jump to next dated item/ })).toBeNull();
  });

  it("keeps the dated-item count in sync with the active filters", () => {
    const scheduled = makePost({ id: "scheduled-post", date: "2026-09-24", internalStatus: "Scheduled", scheduledAt: "2026-09-24" });
    render(<CalendarView posts={[post, scheduled]} onOpenPost={vi.fn()} />);

    expect(screen.getByText("Showing 2 dated items.")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Filter calendar events"), { target: { value: "scheduled" } });

    expect(screen.getByText("Showing 1 dated item with the current filters.")).not.toBeNull();
  });
});
