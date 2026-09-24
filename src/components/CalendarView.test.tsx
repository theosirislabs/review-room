import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Post } from "../types";
import CalendarView from "./CalendarView";

const post: Post = {
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
};

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
});
