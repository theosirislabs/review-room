import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Post } from "../types";
import ClientView from "./ClientView";
import { ToastProvider } from "./Toast";

const makePost = (overrides: Partial<Post> = {}): Post => ({
  id: "visible-post",
  tenantId: "tenant-a",
  title: "Visible post",
  format: "image",
  mediaUrls: [],
  caption: "A post",
  hashtags: [],
  date: "2026-09-20",
  time: "10:00 AM",
  clientStatus: "Needs Your Review",
  clientComments: [],
  internalStatus: "Ready for Client",
  assignee: "Operator",
  campaignCode: "",
  contentPillar: "",
  internalNotes: "",
  assetLineage: "",
  isBlocked: false,
  internalTasks: [],
  ...overrides,
});

const renderView = (previewMode: boolean, onUpdatePost = vi.fn(), onAddComment = vi.fn(), reviewerName = "") => {
  render(
    <ToastProvider>
      <ClientView
        posts={[
          makePost(),
          makePost({ id: "hidden-post", title: "Hidden draft", clientStatus: "Not Ready for Client" }),
        ]}
        tenantId="tenant-a"
        brandName="Tenant A"
        reviewerName={reviewerName}
        previewMode={previewMode}
        postShareLinkEligible={false}
        onUpdatePost={onUpdatePost}
        onAddComment={onAddComment}
        onDeleteComment={vi.fn()}
      />
    </ToastProvider>,
  );
  return { onUpdatePost, onAddComment };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ClientView preview mode", () => {
  it("shows the client profile while filtering internal-only posts", async () => {
    renderView(true);

    expect(screen.getByTestId("client-review-room").getAttribute("data-preview-mode")).toBe("true");
    expect(screen.getByRole("button", { name: "View post: Visible post" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "View post: Hidden draft" })).toBeNull();
    expect(screen.getByText("posts").parentElement?.textContent).toContain("1");
     expect(screen.getByText("Client view preview · Client decisions are disabled")).not.toBeNull();
  });

  it("shows disabled client decisions without mutating posts", async () => {
    const user = userEvent.setup();
    const { onUpdatePost, onAddComment } = renderView(true);

    await user.click(screen.getByRole("button", { name: "View post: Visible post" }));

     expect(screen.getByText("Preview mode · Client decisions are disabled")).not.toBeNull();
     expect(screen.getByRole("button", { name: "Approve post" })).toHaveProperty("disabled", true);
     expect(screen.getByRole("button", { name: "Request changes" })).toHaveProperty("disabled", true);
     expect(screen.queryByPlaceholderText("Leave feedback…")).toBeNull();
    expect(onUpdatePost).not.toHaveBeenCalled();
    expect(onAddComment).not.toHaveBeenCalled();
  });

  it("shows the active post title and position in the viewer", async () => {
    const user = userEvent.setup();
    renderView(false);

    await user.click(screen.getByRole("button", { name: "View post: Visible post" }));

    expect(screen.getByRole("heading", { name: "Visible post" })).not.toBeNull();
    expect(screen.getByText(/Post 1 of 1/)).not.toBeNull();
  });

  it("keeps the normal client review actions outside preview mode", async () => {
    const user = userEvent.setup();
    renderView(false);

    await user.click(screen.getByRole("button", { name: "View post: Visible post" }));

     expect(screen.getByRole("button", { name: "Approve post" })).not.toHaveProperty("disabled", true);
     expect(screen.getByRole("button", { name: "Request changes" })).not.toHaveProperty("disabled", true);
     expect(screen.queryByRole("button", { name: "Disapprove" })).toBeNull();
     expect(screen.getByPlaceholderText("Leave feedback…")).not.toBeNull();
  });

  it("uses the named reviewer for feedback attribution", async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn();
    renderView(false, vi.fn(), onAddComment, "Jordan Lee");

    await user.click(screen.getByRole("button", { name: "View post: Visible post" }));
    await user.type(screen.getByPlaceholderText("Leave feedback…"), "Please revise the headline");
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(onAddComment).toHaveBeenCalledWith("visible-post", expect.objectContaining({ author: "Jordan Lee" }));
  });
});
