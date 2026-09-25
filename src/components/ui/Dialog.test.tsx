import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Dialog from "./Dialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Dialog", () => {
  it("exposes dialog semantics, traps focus, and closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog isOpen onClose={onClose} title="Review settings" description="Update this workspace.">
        <label htmlFor="dialog-name">Name</label>
        <input id="dialog-name" />
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Review settings" });
    expect(dialog).not.toBeNull();
    expect(screen.getByText("Update this workspace.")).not.toBeNull();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
