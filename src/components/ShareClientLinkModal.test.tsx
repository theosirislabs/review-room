import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShareClientLinkModal from "./ShareClientLinkModal";
import { ToastProvider } from "./Toast";

const tenant = { id: "acme", name: "Acme Corp" };

const renderModal = () => render(
  <ToastProvider>
    <ShareClientLinkModal
      isOpen
      onClose={vi.fn()}
      tenant={tenant}
      adminToken="admin-token"
      currentUser={{ id: "user-1", username: "owner@example.com", role: "super-admin" }}
    />
  </ToastProvider>,
);

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("ShareClientLinkModal", () => {
  it("requires a reviewer name, adds the fragment, and optionally remembers it", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      clientUrl: "https://review-room.test/client/acme?token=client-token",
      agencyUrl: "https://review-room.test/agency/acme?token=internal-token",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    renderModal();

    const copyButton = await screen.findByRole("button", { name: "Copy client review link" });
    expect(copyButton).toHaveProperty("disabled", true);

    const nameInput = screen.getByRole("textbox", { name: /Reviewer's name/ });
    await user.type(nameInput, "Jordan Lee");
    await user.click(screen.getByRole("checkbox", { name: /Remember this reviewer's name/ }));
    expect(copyButton).toHaveProperty("disabled", false);

    await user.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(new URL(copied).pathname).toBe("/client/acme");
    expect(new URLSearchParams(new URL(copied).hash.slice(1)).get("reviewer")).toBe("Jordan Lee");
    expect(localStorage.getItem("review-room:reviewer:user-1:acme")).toContain("Jordan Lee");
  });
});
