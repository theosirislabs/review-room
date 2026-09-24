import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Post } from "../types";
import PostFormModal from "./PostFormModal";

vi.mock("./MediaUploadZone", () => ({
  default: () => <div data-testid="media-upload-zone" />,
}));

afterEach(cleanup);

const post: Post = {
  id: "scheduled-post",
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

describe("PostFormModal scheduling", () => {
  it("starts a calendar-created post on the operator's selected date", () => {
    render(
      <PostFormModal
        initialDate="2026-09-25"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("2026-09-25")).toBeTruthy();
  });

  it("exposes an accessible editor dialog and named close action", () => {
    render(<PostFormModal post={post} onSubmit={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Edit Post" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("button", { name: "Close post editor" })).not.toBeNull();
  });

  it("exposes operational editor fields through programmatic labels", () => {
    render(<PostFormModal post={post} onSubmit={vi.fn()} onClose={vi.fn()} />);

    for (const label of [
      /Post Title/,
      "Publish Date",
      "Time",
      "Feedback Due",
      "Internal Status",
      "Client Status",
      "Assignee",
      "Campaign Code",
      "Content Pillar",
      "Caption",
      "Hashtags",
      "Internal Notes",
      "Asset Lineage",
    ]) {
      expect(screen.getByLabelText(label)).not.toBeNull();
    }
  });

  it("keeps a scheduled post open and explains an invalid publish time", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<PostFormModal post={post} onSubmit={onSubmit} onClose={onClose} />);

    await user.selectOptions(screen.getByLabelText("Internal Status"), "Scheduled");
    const time = screen.getByLabelText("Time");
    await user.clear(time);
    await user.type(time, "after lunch");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Use a valid post time to schedule this post.")).not.toBeNull();
  });

  it("writes a worker timestamp when an operator saves a scheduled post", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PostFormModal post={post} onSubmit={onSubmit} onClose={vi.fn()} />);

    await user.selectOptions(screen.getAllByRole("combobox")[0], "Scheduled");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      internalStatus: "Scheduled",
      scheduledAt: expect.any(String),
    }));
    const saved = onSubmit.mock.calls[0][0] as Post;
    expect(new Date(saved.scheduledAt as string).getHours()).toBe(13);
    expect(new Date(saved.scheduledAt as string).getMinutes()).toBe(30);
  });
});
