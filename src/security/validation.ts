export const ALLOWED_POST_FORMATS = ["image", "carousel", "reel", "story"] as const;
export const ALLOWED_INTERNAL_STATUSES = [
  "Concept",
  "Draft",
  "Internal QA",
  "Ready for Client",
  "Changes Requested",
  "Approved",
  "Ready to Schedule",
  "Scheduled",
  "Posted",
] as const;
export const ALLOWED_CLIENT_STATUSES = [
  "Not Ready for Client",
  "Needs Your Review",
  "Approved",
  "Changes Requested",
] as const;

export const POST_LIMITS = {
  title: 240,
  caption: 20000,
  mediaUrls: 50,
  mediaUrl: 2048,
  hashtags: 50,
  hashtag: 100,
  text: 10000,
  shortText: 240,
  internalNotes: 10000,
  assetLineage: 4000,
  scheduledAt: 80,
} as const;

export const MAX_BULK_POSTS = 100;

export const COMMENT_LIMITS = {
  text: 5000,
  changeType: 50,
  slideIndex: 10000,
} as const;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

type ValidationCheck = { ok: true } | { ok: false; error: string };

type PostRecord = Record<string, any>;

const isRecord = (value: unknown): value is PostRecord => !!value && typeof value === "object" && !Array.isArray(value);
const has = (record: PostRecord, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);
const isAllowed = (value: string, allowed: readonly string[]): boolean => allowed.includes(value);

const validDate = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));

const validateString = (
  record: PostRecord,
  key: string,
  max: number,
  required: boolean,
  creating: boolean
): ValidationCheck => {
  if (!has(record, key)) {
    if (required && creating) return { ok: true };
    return { ok: true };
  }
  const value = record[key];
  if (value === undefined) {
    if (required && creating && key === "title") {
      record[key] = "Untitled";
      return { ok: true };
    }
    if (!required) {
      delete record[key];
      return { ok: true };
    }
    return { ok: false, error: `${key} is required` };
  }
  if (value === null && !required) return { ok: true };
  if (typeof value !== "string") return { ok: false, error: `${key} must be a string` };
  const trimmed = value.trim();
  if (!trimmed && required) {
    if (creating && key === "title") {
      record[key] = "Untitled";
      return { ok: true };
    }
    return { ok: false, error: `${key} is required` };
  }
  if (value.length > max) return { ok: false, error: `${key} is too long` };
  if (trimmed) record[key] = trimmed;
  return { ok: true };
};

const validateStringArray = (
  record: PostRecord,
  key: "mediaUrls" | "hashtags",
  maxItems: number,
  maxItemLength: number
): ValidationCheck => {
  if (!has(record, key)) return { ok: true };
  const value = record[key];
  if (value === undefined) {
    delete record[key];
    return { ok: true };
  }
  if (!Array.isArray(value) || value.length > maxItems) return { ok: false, error: `${key} must contain at most ${maxItems} items` };
  for (const item of value) {
    if (typeof item !== "string" || item.length > maxItemLength) {
      return { ok: false, error: `${key} contains an invalid item` };
    }
  }
  record[key] = value.map((item) => item.trim()).filter((item) => item.length > 0);
  return { ok: true };
};

export function validatePostMutation(
  input: unknown,
  existing?: PostRecord,
  creating = false
): ValidationResult<PostRecord> {
  if (!isRecord(input)) return { ok: false, error: "Post payload must be an object" };
  const value: PostRecord = { ...input };
  if (has(value, "id") && value.id !== undefined && value.id !== null) {
    if (typeof value.id !== "string" || value.id.length > 200 || !value.id.trim()) return { ok: false, error: "id is invalid" };
    value.id = value.id.trim();
  }
  if (has(value, "title") && value.title !== undefined) {
    const result = validateString(value, "title", POST_LIMITS.title, true, false);
    if (!result.ok) return result;
  } else if (creating) {
    value.title = "Untitled";
  }
  if (has(value, "format") && value.format !== undefined) {
    if (typeof value.format !== "string" || !isAllowed(value.format, ALLOWED_POST_FORMATS)) {
      return { ok: false, error: "format is invalid" };
    }
  } else if (creating) {
    value.format = "image";
  }
  for (const key of ["date", "time", "dueDate", "caption", "internalNotes", "assetLineage", "assignee", "campaignCode", "contentPillar", "blockedReason", "thumbnailUrl", "archivedAt"] as const) {
    const result = validateString(value, key, key === "caption" ? POST_LIMITS.caption : key === "internalNotes" ? POST_LIMITS.internalNotes : key === "assetLineage" ? POST_LIMITS.assetLineage : key === "thumbnailUrl" ? POST_LIMITS.mediaUrl : POST_LIMITS.shortText, false, false);
    if (!result.ok) return result;
  }
  const mediaResult = validateStringArray(value, "mediaUrls", POST_LIMITS.mediaUrls, POST_LIMITS.mediaUrl);
  if (!mediaResult.ok) return mediaResult;
  const hashtagResult = validateStringArray(value, "hashtags", POST_LIMITS.hashtags, POST_LIMITS.hashtag);
  if (!hashtagResult.ok) return hashtagResult;
  if (has(value, "internalStatus")) {
    if (value.internalStatus === "") delete value.internalStatus;
    else if (typeof value.internalStatus !== "string" || !isAllowed(value.internalStatus, ALLOWED_INTERNAL_STATUSES)) {
      return { ok: false, error: "internalStatus is invalid" };
    }
  }
  if (has(value, "clientStatus")) {
    if (value.clientStatus === "") delete value.clientStatus;
    else if (typeof value.clientStatus !== "string" || !isAllowed(value.clientStatus, ALLOWED_CLIENT_STATUSES)) {
      return { ok: false, error: "clientStatus is invalid" };
    }
  }
  const finalInternalStatus = value.internalStatus ?? existing?.internalStatus ?? "Draft";
  const finalClientStatus = value.clientStatus ?? existing?.clientStatus;
  if (typeof finalInternalStatus !== "string" || !isAllowed(finalInternalStatus, ALLOWED_INTERNAL_STATUSES)) {
    return { ok: false, error: "internalStatus is invalid" };
  }
  if (finalClientStatus !== undefined && (typeof finalClientStatus !== "string" || !isAllowed(finalClientStatus, ALLOWED_CLIENT_STATUSES))) {
    return { ok: false, error: "clientStatus is invalid" };
  }
  if (has(value, "scheduledAt")) {
    if (value.scheduledAt === undefined) {
      delete value.scheduledAt;
    } else if (value.scheduledAt !== null && !validDate(value.scheduledAt)) {
      return { ok: false, error: "scheduledAt must be a valid date" };
    }
    if (typeof value.scheduledAt === "string" && value.scheduledAt.length > POST_LIMITS.scheduledAt) {
      return { ok: false, error: "scheduledAt is too long" };
    }
  }
  const finalScheduledAt = has(value, "scheduledAt") ? value.scheduledAt : existing?.scheduledAt;
  if (finalInternalStatus === "Scheduled" && !validDate(finalScheduledAt)) {
    return { ok: false, error: "Scheduled posts require a valid scheduledAt" };
  }
  if (has(value, "sortOrder") && value.sortOrder !== undefined && value.sortOrder !== null) {
    if (typeof value.sortOrder !== "number" || !Number.isInteger(value.sortOrder)) return { ok: false, error: "sortOrder must be an integer" };
  }
  if (has(value, "isBlocked") && value.isBlocked !== undefined && typeof value.isBlocked !== "boolean") {
    return { ok: false, error: "isBlocked must be boolean" };
  }
  return { ok: true, value };
}

export type CommentMutation = {
  text: string;
  isInternalOnly: boolean;
  changeType: string | null;
  priority: "low" | "medium" | "high" | null;
  slideIndex: number | null;
};

export function validateCommentMutation(input: unknown): ValidationResult<CommentMutation> {
  if (!isRecord(input)) return { ok: false, error: "Comment payload must be an object" };
  const text = input.text;
  if (typeof text !== "string" || !text.trim() || text.length > COMMENT_LIMITS.text) {
    return { ok: false, error: `Comment text must be non-empty and at most ${COMMENT_LIMITS.text} characters` };
  }
  if (has(input, "isInternalOnly") && input.isInternalOnly !== undefined && typeof input.isInternalOnly !== "boolean") {
    return { ok: false, error: "isInternalOnly must be boolean" };
  }
  const changeType = input.changeType;
  if (changeType !== undefined && changeType !== null && (typeof changeType !== "string" || changeType.length > COMMENT_LIMITS.changeType)) {
    return { ok: false, error: "changeType is invalid" };
  }
  const priority = input.priority;
  if (priority !== undefined && priority !== null && !["low", "medium", "high"].includes(String(priority))) {
    return { ok: false, error: "priority is invalid" };
  }
  const slideIndex = input.slideIndex;
  if (slideIndex !== undefined && slideIndex !== null && (typeof slideIndex !== "number" || !Number.isInteger(slideIndex) || slideIndex < 0 || slideIndex > COMMENT_LIMITS.slideIndex)) {
    return { ok: false, error: "slideIndex is invalid" };
  }
  return {
    ok: true,
    value: {
      text: text.trim(),
      isInternalOnly: input.isInternalOnly === true,
      changeType: typeof changeType === "string" && changeType.trim() ? changeType.trim() : null,
      priority: typeof priority === "string" ? priority as "low" | "medium" | "high" : null,
      slideIndex: typeof slideIndex === "number" ? slideIndex : null,
    },
  };
}
