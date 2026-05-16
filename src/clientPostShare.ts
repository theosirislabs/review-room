/**
 * Create a single-post client review magic link and copy it to the clipboard.
 * Requires agency session (Bearer) or tenant internal token in localStorage.
 */
export async function createAndCopyClientPostShare(opts: {
  tenantId: string;
  postId: string;
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
      error: "Sign in to the agency or open this workspace with your internal token to create a link.",
    };
  }
  try {
    const res = await fetch(`/api/tenants/${opts.tenantId}/posts/${opts.postId}/client-share`, {
      method: "POST",
      headers,
      body: JSON.stringify({ expiresInDays: 90 }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; shareUrl?: string; sharePath?: string };
    if (!res.ok) return { ok: false, error: data.error || "Could not create share link." };
    const url =
      data.shareUrl ||
      `${typeof window !== "undefined" ? window.location.origin : ""}${data.sharePath || ""}`;
    if (!url) return { ok: false, error: "Server did not return a link." };
    await navigator.clipboard.writeText(url);
    return { ok: true, url };
  } catch {
    return { ok: false, error: "Could not create share link." };
  }
}
