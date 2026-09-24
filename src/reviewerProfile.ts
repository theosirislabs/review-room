export interface ReviewerPreference {
  name: string;
  remember: boolean;
}

const MAX_REVIEWER_NAME_LENGTH = 80;

export function normalizeReviewerName(value: string | null | undefined): string {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_REVIEWER_NAME_LENGTH);
}

export function reviewerStorageKey(userId?: string | null, tenantId?: string | null): string | null {
  const tenant = String(tenantId || "").trim();
  if (!tenant) return null;
  const user = String(userId || "").trim() || "shared";
  return `review-room:reviewer:${encodeURIComponent(user)}:${encodeURIComponent(tenant)}`;
}

export function readReviewerPreference(userId?: string | null, tenantId?: string | null): ReviewerPreference {
  const key = reviewerStorageKey(userId, tenantId);
  if (!key || typeof localStorage === "undefined") return { name: "", remember: false };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { name: "", remember: false };
    const value = JSON.parse(raw) as Partial<ReviewerPreference>;
    if (value.remember !== true) return { name: "", remember: false };
    const name = normalizeReviewerName(typeof value.name === "string" ? value.name : "");
    return name ? { name, remember: true } : { name: "", remember: false };
  } catch {
    return { name: "", remember: false };
  }
}

export function saveReviewerPreference(
  userId: string | null | undefined,
  tenantId: string | null | undefined,
  preference: ReviewerPreference,
): void {
  const key = reviewerStorageKey(userId, tenantId);
  if (!key || typeof localStorage === "undefined") return;
  const name = normalizeReviewerName(preference.name);
  try {
    if (preference.remember && name) {
      localStorage.setItem(key, JSON.stringify({ name, remember: true }));
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    return;
  }
}

export function reviewerNameFromHash(hash: string | null | undefined): string {
  const raw = String(hash || "").replace(/^#/, "");
  if (!raw) return "";
  return normalizeReviewerName(new URLSearchParams(raw).get("reviewer"));
}

export function withReviewerFragment(url: string, reviewerName: string): string {
  const name = normalizeReviewerName(reviewerName);
  if (!name) return url;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(url, base);
    const params = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    params.set("reviewer", name);
    parsed.hash = params.toString();
    return parsed.toString();
  } catch {
    return url;
  }
}
