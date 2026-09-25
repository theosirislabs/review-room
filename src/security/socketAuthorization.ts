export type ShareActor = {
  kind: "share" | "share-set";
  tenantId: string;
  postIds: string[];
  shareToken: string;
};

export type ActiveShareRecord = {
  token: string;
  tenantId: string;
  postIds: string[];
  revoked?: boolean;
  expiresAt?: string | null;
};

export type ShareActorValidation =
  | { valid: true }
  | { valid: false; reason: "missing" | "inactive" | "token" | "tenant" | "posts" | "post" };

export function validateShareActor(
  actor: ShareActor,
  record: ActiveShareRecord | null | undefined,
  requestedPostId?: string,
  now = Date.now()
): ShareActorValidation {
  if (!actor || !record) return { valid: false, reason: "missing" };
  if (record.revoked) return { valid: false, reason: "inactive" };
  if (record.expiresAt) {
    const expiresAt = Date.parse(record.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return { valid: false, reason: "inactive" };
  }
  if (!actor.shareToken || !record.token || actor.shareToken !== record.token) return { valid: false, reason: "token" };
  if (actor.tenantId !== record.tenantId) return { valid: false, reason: "tenant" };
  if (!actor.postIds.length || actor.postIds.some((postId) => !record.postIds.includes(postId))) {
    return { valid: false, reason: "posts" };
  }
  if (requestedPostId && (!actor.postIds.includes(requestedPostId) || !record.postIds.includes(requestedPostId))) {
    return { valid: false, reason: "post" };
  }
  return { valid: true };
}
