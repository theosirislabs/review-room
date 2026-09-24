import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CampaignManagerModal from "./CampaignManagerModal";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("CampaignManagerModal", () => {
  it("refreshes taxonomy only after acknowledged campaign creation", async () => {
    const user = userEvent.setup();
    type Ack = (result: { success: boolean; campaign?: { id: string; tenantId: string; name: string; code: string; color: string; startDate: string; endDate: string; description: string; createdAt: string } }) => void;
    let acknowledgement: Ack | undefined;
    const emit = vi.fn((_event: string, _data: unknown, callback?: Ack) => { acknowledgement = callback; });
    const onRefresh = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => [] }));
    render(<CampaignManagerModal isOpen onClose={vi.fn()} tenantId="tenant-a" adminToken="session-token" emit={emit} onRefresh={onRefresh} />);
    await screen.findByText("Campaign Manager");
    await user.click(screen.getByRole("button", { name: /New Campaign/ }));
    await user.type(screen.getByPlaceholderText("Campaign name *"), "Autumn Launch");
    await user.click(screen.getByRole("button", { name: "Save Campaign" }));
    expect(emit).toHaveBeenCalledWith("create-campaign", expect.objectContaining({ tenantId: "tenant-a" }), expect.any(Function));
    expect(onRefresh).not.toHaveBeenCalled();
    expect(acknowledgement).toEqual(expect.any(Function));
    acknowledgement?.({ success: true, campaign: { id: "campaign-1", tenantId: "tenant-a", name: "Autumn Launch", code: "AUT26", color: "#6366f1", startDate: "", endDate: "", description: "", createdAt: "2026-09-18T00:00:00.000Z" } });
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Autumn Launch")).not.toBeNull();
  });

  it("keeps creation open and reports an acknowledged rejection", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const emit = vi.fn((_event: string, _data: unknown, callback?: (result: { success: boolean; error?: string }) => void) => callback?.({ success: false, error: "Campaign code already exists." }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => [] }));
    render(<CampaignManagerModal isOpen onClose={vi.fn()} tenantId="tenant-a" adminToken="session-token" emit={emit} onRefresh={onRefresh} />);
    await screen.findByText("Campaign Manager");
    await user.click(screen.getByRole("button", { name: /New Campaign/ }));
    await user.type(screen.getByPlaceholderText("Campaign name *"), "Autumn Launch");
    await user.click(screen.getByRole("button", { name: "Save Campaign" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Campaign code already exists.");
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Campaign name *")).not.toBeNull();
  });
});
