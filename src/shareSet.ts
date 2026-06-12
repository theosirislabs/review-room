/**
 * Create a share set link (multi-post client review) and copy it to the clipboard.
 * Requires agency session (Bearer) or tenant internal token in localStorage.
 */
export async function createShareSetLink(opts: {
  tenantId: string;
  postIds: string[];
  name?: string;
  adminToken?: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const intTkn =
    typeof localStorage !== "undefined" ? localStorage.getItem(`osiris_${opts.tenantId}_internal`) || "" : "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.adminToken) headers.Authorization = `Bearer ${opts.adminToken}`;
  else if (intTkn) headers["x-tenant-token"] = intTkn;
  else {
    return {
      ok: false,
      error: "Sign in to the agency or open this workspace with your internal token to create a share set link.",
    };
  }
  try {
    const res = await fetch(`/api/tenants/${opts.tenantId}/share-sets`, {
      method: "POST",
      headers,
      body: JSON.stringify({ postIds: opts.postIds, name: opts.name, expiresInDays: 30 }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string; sharePath?: string };
    if (!res.ok) return { ok: false, error: data.error || "Could not create share set link." };
    const url =
      data.url ||
      `${typeof window !== "undefined" ? window.location.origin : ""}${data.sharePath || ""}`;
    if (!url) return { ok: false, error: "Server did not return a link." };
    await navigator.clipboard.writeText(url);
    return { ok: true, url };
  } catch {
    return { ok: false, error: "Could not create share set link." };
  }
}
