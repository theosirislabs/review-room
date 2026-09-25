import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type Database from "better-sqlite3";
import { canCreatePosts, canMutatePosts, type McpActor } from "./auth.js";
import {
  ALLOWED_CLIENT_STATUSES,
  ALLOWED_INTERNAL_STATUSES,
  COMMENT_LIMITS,
  POST_LIMITS,
  validateCommentMutation,
  validatePostMutation,
} from "../security/validation.js";

type Deps = {
  db: Database.Database;
  actor: McpActor;
  getPosts: (tenantId: string, includeArchived?: boolean) => any[];
  getPostById: (tenantId: string, postId: string) => any;
  tenantPublic: (row: any) => any;
  deriveClientStatus: (internalStatus: string, requested?: string, previous?: string) => string;
  nextSortOrder: (tenantId: string) => number;
  logActivity: (tenantId: string, action: string, subject: string, detail?: string) => void;
  broadcastPostUpdated: (tenantId: string, postId: string) => void;
  broadcastPostCreated: (tenantId: string, postId: string) => void;
};

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function fail(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true };
}

function stripForRole(post: any, role: string) {
  if (!post) return post;
  const { script, ...rest } = post;
  if (role === "user") {
    return {
      id: rest.id,
      tenantId: rest.tenantId,
      title: rest.title,
      format: rest.format,
      caption: rest.caption,
      hashtags: rest.hashtags,
      date: rest.date,
      time: rest.time,
      clientStatus: rest.clientStatus,
      internalStatus: rest.internalStatus,
      campaignCode: rest.campaignCode,
      contentPillar: rest.contentPillar,
      dueDate: rest.dueDate,
      mediaUrls: rest.mediaUrls,
      thumbnailUrl: rest.thumbnailUrl,
      archivedAt: rest.archivedAt,
    };
  }
  const { internalNotes, assetLineage, ...safe } = rest;
  return role === "super-admin" || role === "graphic-designer" || role === "reviewer"
    ? { ...safe, internalNotes, assetLineage }
    : safe;
}

function parseJsonArr(v: any): any[] {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v || "[]"); } catch { return []; }
}

const actorCanUseTenant = (actor: McpActor, tenantId: string): boolean => actor.tenantIds.includes(tenantId);

export function createReviewRoomMcp(deps: Deps) {
  const { db, actor } = deps;
  const server = new McpServer({ name: "review-room", version: "1.0.0" });

  server.registerTool("whoami", {
    description: "Current Review Room MCP identity (username, role, key name, expiry).",
  }, async () => ok({
    username: actor.username,
    role: actor.role,
    tokenName: actor.tokenName,
    expiresAt: actor.expiresAt,
  }));

  server.registerTool("list_tenants", {
    description: "List workspaces (id, name, logo, bio, lastActive). Never returns invite tokens.",
  }, async () => {
    if (!actor.tenantIds.length) return ok([]);
    const placeholders = actor.tenantIds.map(() => "?").join(",");
    const tenants = db.prepare(`SELECT * FROM tenants WHERE id IN (${placeholders}) ORDER BY name`).all(...actor.tenantIds);
    return ok(tenants.map((t: any) => deps.tenantPublic({ ...t, settings: JSON.parse(t.settings || "{}") })));
  });

  server.registerTool("list_posts", {
    description: "List posts in a workspace. Caps at 50. Optional status/search filters.",
    inputSchema: {
      tenantId: z.string(),
      internalStatus: z.string().optional(),
      clientStatus: z.string().optional(),
      q: z.string().optional(),
      includeArchived: z.boolean().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
  }, async ({ tenantId, internalStatus, clientStatus, q, includeArchived, limit }) => {
    if (!actorCanUseTenant(actor, tenantId)) return fail("Unauthorized: You do not have access to this workspace");
    let posts = deps.getPosts(tenantId, !!includeArchived);
    if (internalStatus) posts = posts.filter((p) => p.internalStatus === internalStatus);
    if (clientStatus) posts = posts.filter((p) => p.clientStatus === clientStatus);
    if (q) {
      const needle = q.toLowerCase();
      posts = posts.filter((p) =>
        String(p.title || "").toLowerCase().includes(needle) ||
        String(p.caption || "").toLowerCase().includes(needle) ||
        String(p.campaignCode || "").toLowerCase().includes(needle)
      );
    }
    const cap = limit || 50;
    return ok({
      tenantId,
      total: posts.length,
      posts: posts.slice(0, cap).map((p) => stripForRole(p, actor.role)),
    });
  });

  server.registerTool("get_post", {
    description: "Get one post with comments and tasks. Includes archived.",
    inputSchema: { tenantId: z.string(), postId: z.string() },
  }, async ({ tenantId, postId }) => {
    if (!actorCanUseTenant(actor, tenantId)) return fail("Unauthorized: You do not have access to this workspace");
    const post = deps.getPostById(tenantId, postId);
    if (!post) return fail("Post not found");
    return ok(stripForRole(post, actor.role));
  });

  server.registerTool("search", {
    description: "Search posts across workspaces by title, caption, hashtags, or client name. Limit 50.",
    inputSchema: { q: z.string() },
  }, async ({ q }) => {
    const query = q.trim();
    if (!query || !actor.tenantIds.length) return ok([]);
    const like = `%${query}%`;
    const placeholders = actor.tenantIds.map(() => "?").join(",");
    const rows = db.prepare(`
      SELECT p.id, p.tenantId, p.title, p.format, p.clientStatus, p.internalStatus, p.campaignCode, p.dueDate, p.thumbnailUrl, t.name as tenantName
      FROM posts p JOIN tenants t ON t.id = p.tenantId
      WHERE (p.title LIKE ? OR p.caption LIKE ? OR p.hashtags LIKE ? OR t.name LIKE ?)
        AND p.tenantId IN (${placeholders})
      LIMIT 50
    `).all(like, like, like, like, ...actor.tenantIds);
    return ok(rows);
  });

  server.registerTool("get_stats", {
    description: "Global post counts and per-workspace funnel.",
  }, async () => {
    if (!actor.tenantIds.length) {
      return ok({ totalPosts: 0, totalApproved: 0, totalBlocked: 0, totalNeedsReview: 0, totalScheduled: 0, perTenant: [] });
    }
    const placeholders = actor.tenantIds.map(() => "?").join(",");
    const tenants = db.prepare(`SELECT * FROM tenants WHERE id IN (${placeholders})`).all(...actor.tenantIds) as any[];
    const allPosts = db.prepare(`SELECT * FROM posts WHERE tenantId IN (${placeholders})`).all(...actor.tenantIds) as any[];
    const perTenant = tenants.map((t) => {
      const tp = allPosts.filter((p) => p.tenantId === t.id);
      return {
        tenantId: t.id,
        name: t.name,
        total: tp.length,
        approved: tp.filter((p) => p.clientStatus === "Approved").length,
        blocked: tp.filter((p) => p.isBlocked).length,
        needsReview: tp.filter((p) => p.clientStatus === "Needs Your Review").length,
        scheduled: tp.filter((p) => p.internalStatus === "Scheduled").length,
        changesRequested: tp.filter((p) => p.clientStatus === "Changes Requested").length,
      };
    });
    return ok({
      totalPosts: allPosts.length,
      totalApproved: allPosts.filter((p) => p.clientStatus === "Approved").length,
      totalBlocked: allPosts.filter((p) => p.isBlocked).length,
      totalNeedsReview: allPosts.filter((p) => p.clientStatus === "Needs Your Review").length,
      totalScheduled: allPosts.filter((p) => p.internalStatus === "Scheduled").length,
      perTenant,
    });
  });

  server.registerTool("list_activity", {
    description: "Recent activity log. Optional tenant filter. Cap 50.",
    inputSchema: {
      tenantId: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
  }, async ({ tenantId, limit }) => {
    const n = limit || 50;
    if (tenantId) {
      if (!actorCanUseTenant(actor, tenantId)) return fail("Unauthorized: You do not have access to this workspace");
      return ok(db.prepare("SELECT * FROM activity_log WHERE tenantId = ? ORDER BY timestamp DESC LIMIT ?").all(tenantId, n));
    }
    if (!actor.tenantIds.length) return ok([]);
    const placeholders = actor.tenantIds.map(() => "?").join(",");
    return ok(db.prepare(`SELECT * FROM activity_log WHERE tenantId IN (${placeholders}) ORDER BY timestamp DESC LIMIT ?`).all(...actor.tenantIds, n));
  });

  server.registerTool("list_campaigns", {
    description: "List campaigns for a workspace.",
    inputSchema: { tenantId: z.string() },
  }, async ({ tenantId }) => {
    if (!actorCanUseTenant(actor, tenantId)) return fail("Unauthorized: You do not have access to this workspace");
    return ok(db.prepare("SELECT * FROM campaigns WHERE tenantId = ? ORDER BY startDate").all(tenantId));
  });

  server.registerTool("upsert_post", {
    description: "Create or update a post (no file upload). Omit arrays to keep existing media/hashtags. Create requires designer or super-admin.",
    inputSchema: {
      tenantId: z.string(),
      post: z.object({
        id: z.string().max(200).optional(),
        title: z.string().trim().min(1).max(POST_LIMITS.title).optional(),
        format: z.enum(["image", "carousel", "reel", "story"]).optional(),
        caption: z.string().max(POST_LIMITS.caption).optional(),
        hashtags: z.array(z.string().max(POST_LIMITS.hashtag)).max(POST_LIMITS.hashtags).optional(),
        mediaUrls: z.array(z.string().max(POST_LIMITS.mediaUrl)).max(POST_LIMITS.mediaUrls).optional(),
        date: z.string().max(POST_LIMITS.shortText).optional(),
        time: z.string().max(POST_LIMITS.shortText).optional(),
        internalStatus: z.enum([...ALLOWED_INTERNAL_STATUSES] as [string, ...string[]]).optional(),
        clientStatus: z.enum([...ALLOWED_CLIENT_STATUSES] as [string, ...string[]]).optional(),
        assignee: z.string().max(POST_LIMITS.shortText).optional(),
        campaignCode: z.string().max(POST_LIMITS.shortText).optional(),
        contentPillar: z.string().max(POST_LIMITS.shortText).optional(),
        internalNotes: z.string().max(POST_LIMITS.internalNotes).optional(),
        dueDate: z.string().max(POST_LIMITS.shortText).nullable().optional(),
        scheduledAt: z.string().max(POST_LIMITS.scheduledAt).nullable().optional(),
        thumbnailUrl: z.string().max(POST_LIMITS.mediaUrl).nullable().optional(),
        archivedAt: z.string().max(POST_LIMITS.shortText).nullable().optional(),
        sortOrder: z.number().int().optional(),
      }),
    },
  }, async ({ tenantId, post }) => {
    if (!actorCanUseTenant(actor, tenantId)) return fail("Unauthorized: You do not have access to this workspace");
    if (post.id) {
      const otherPost = db.prepare("SELECT tenantId FROM posts WHERE id = ?").get(post.id) as { tenantId: string } | undefined;
      if (otherPost && otherPost.tenantId !== tenantId) return fail("Post not found in this workspace");
    }
    const existing = post.id ? deps.getPostById(tenantId, post.id) : null;
    const validation = validatePostMutation(post, existing || undefined, !existing);
    if (!validation.ok) return fail(validation.error);
    post = validation.value;
    if (!existing) {
      if (!canCreatePosts(actor.role)) return fail("Unauthorized: cannot create posts");
      const id = post.id || randomUUID();
      const internalStatus = post.internalStatus || "Draft";
      const clientStatus = deps.deriveClientStatus(internalStatus, post.clientStatus);
      db.prepare(`INSERT INTO posts (id, tenantId, title, format, mediaUrls, caption, hashtags,
        date, time, clientStatus, internalStatus, assignee, campaignCode, contentPillar,
        internalNotes, assetLineage, isBlocked, blockedReason, thumbnailUrl, revisionCount, dueDate, scheduledAt, sortOrder)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(
          id, tenantId, post.title || "Untitled", post.format || "image",
          JSON.stringify(post.mediaUrls || []), post.caption || "", JSON.stringify(post.hashtags || []),
          post.date || new Date().toISOString().slice(0, 10), post.time || "00:00",
          clientStatus, internalStatus, post.assignee || "Unassigned",
          post.campaignCode || "", post.contentPillar || "", post.internalNotes || "", "",
          0, null, post.thumbnailUrl || null, 0, post.dueDate || null, post.scheduledAt || null,
          post.sortOrder ?? deps.nextSortOrder(tenantId)
        );
      deps.logActivity(tenantId, "post-created", post.title || "Untitled", `MCP create (${actor.username})`);
      deps.broadcastPostCreated(tenantId, id);
      return ok(stripForRole(deps.getPostById(tenantId, id), actor.role));
    }
    if (!canMutatePosts(actor.role)) return fail("Unauthorized: cannot update posts");
    const internalStatus = post.internalStatus || existing.internalStatus || "Draft";
    const clientStatus = deps.deriveClientStatus(internalStatus, post.clientStatus, existing.clientStatus);
    const nextScheduledAt = internalStatus === "Scheduled"
      ? (post.scheduledAt !== undefined ? post.scheduledAt || null : existing.scheduledAt || null)
      : (post.scheduledAt !== undefined ? post.scheduledAt || null : existing.internalStatus === "Scheduled" ? null : existing.scheduledAt || null);
    const mediaUrls = Array.isArray(post.mediaUrls) ? post.mediaUrls : parseJsonArr(existing.mediaUrls);
    const hashtags = Array.isArray(post.hashtags) ? post.hashtags : parseJsonArr(existing.hashtags);
    db.prepare(`UPDATE posts SET title=?, format=?, mediaUrls=?, caption=?, hashtags=?, date=?,
      time=?, clientStatus=?, internalStatus=?, assignee=?, campaignCode=?, contentPillar=?,
      internalNotes=?, thumbnailUrl=?, archivedAt=?, scheduledAt=?, dueDate=?, sortOrder=? WHERE id=? AND tenantId=?`)
      .run(
        post.title ?? existing.title,
        post.format || existing.format,
        JSON.stringify(mediaUrls),
        post.caption ?? existing.caption ?? "",
        JSON.stringify(hashtags),
        post.date || existing.date,
        post.time || existing.time || "00:00",
        clientStatus,
        internalStatus,
        post.assignee ?? existing.assignee ?? "Unassigned",
        post.campaignCode ?? existing.campaignCode ?? "",
        post.contentPillar ?? existing.contentPillar ?? "",
        post.internalNotes ?? existing.internalNotes ?? "",
        post.thumbnailUrl !== undefined ? (post.thumbnailUrl || null) : (existing.thumbnailUrl || null),
        post.archivedAt !== undefined ? (post.archivedAt ?? null) : (existing.archivedAt || null),
        nextScheduledAt,
        post.dueDate !== undefined ? (post.dueDate || null) : (existing.dueDate || null),
        post.sortOrder ?? existing.sortOrder ?? null,
        existing.id,
        tenantId
      );
    if (internalStatus !== existing.internalStatus) {
      deps.logActivity(tenantId, "status-changed", existing.title, `MCP: ${existing.internalStatus} → ${internalStatus}`);
    }
    deps.broadcastPostUpdated(tenantId, existing.id);
    return ok(stripForRole(deps.getPostById(tenantId, existing.id), actor.role));
  });

  server.registerTool("set_post_status", {
    description: "Change workflow status. Send-to-client: set internalStatus Ready for Client (also sets Needs Your Review). Staff except role=user.",
    inputSchema: {
      tenantId: z.string(),
      postId: z.string(),
      internalStatus: z.enum([...ALLOWED_INTERNAL_STATUSES] as [string, ...string[]]).optional(),
      clientStatus: z.enum([...ALLOWED_CLIENT_STATUSES] as [string, ...string[]]).optional(),
    },
  }, async ({ tenantId, postId, internalStatus, clientStatus }) => {
    if (!actorCanUseTenant(actor, tenantId)) return fail("Unauthorized: You do not have access to this workspace");
    if (!canMutatePosts(actor.role)) return fail("Unauthorized: cannot change status");
    const existing = deps.getPostById(tenantId, postId);
    if (!existing) return fail("Post not found");
    const statusValidation = validatePostMutation({ internalStatus, clientStatus }, existing, false);
    if (!statusValidation.ok) return fail(statusValidation.error);
    const nextInternal = statusValidation.value.internalStatus || existing.internalStatus;
    const nextClient = deps.deriveClientStatus(nextInternal, statusValidation.value.clientStatus, existing.clientStatus);
    const nextScheduledAt = nextInternal === "Scheduled" ? (existing.scheduledAt || null) : null;
    db.prepare("UPDATE posts SET internalStatus=?, clientStatus=?, scheduledAt=? WHERE id=? AND tenantId=?")
      .run(nextInternal, nextClient, nextScheduledAt, postId, tenantId);
    deps.logActivity(tenantId, "status-changed", existing.title, `MCP: ${existing.internalStatus}/${existing.clientStatus} → ${nextInternal}/${nextClient}`);
    deps.broadcastPostUpdated(tenantId, postId);
    return ok(stripForRole(deps.getPostById(tenantId, postId), actor.role));
  });

  server.registerTool("add_comment", {
    description: "Add a comment on a post. Staff except role=user. Prove post belongs to tenant.",
    inputSchema: {
      tenantId: z.string(),
      postId: z.string(),
      text: z.string().trim().min(1).max(COMMENT_LIMITS.text),
      isInternalOnly: z.boolean().optional(),
      changeType: z.string().max(COMMENT_LIMITS.changeType).optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      slideIndex: z.number().int().min(0).max(COMMENT_LIMITS.slideIndex).optional(),
    },
  }, async ({ tenantId, postId, text, isInternalOnly, changeType, priority, slideIndex }) => {
    if (!actorCanUseTenant(actor, tenantId)) return fail("Unauthorized: You do not have access to this workspace");
    if (!canMutatePosts(actor.role)) return fail("Unauthorized: cannot comment");
    const owned = db.prepare("SELECT id, title FROM posts WHERE id = ? AND tenantId = ?").get(postId, tenantId) as any;
    if (!owned) return fail("Post not found in this workspace");
    const commentValidation = validateCommentMutation({ text, isInternalOnly, changeType, priority, slideIndex });
    if (!commentValidation.ok) return fail(commentValidation.error);
    const safeComment = commentValidation.value;
    const id = randomUUID();
    db.prepare("INSERT INTO comments (id, postId, author, text, timestamp, isInternalOnly, changeType, priority, slideIndex) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(id, postId, actor.username, safeComment.text, new Date().toISOString(), safeComment.isInternalOnly ? 1 : 0, safeComment.changeType, safeComment.priority, safeComment.slideIndex);
    deps.logActivity(tenantId, "comment-added", owned.title, `MCP ${actor.username}: ${safeComment.text.slice(0, 60)}`);
    deps.broadcastPostUpdated(tenantId, postId);
    return ok({ id, postId, author: actor.username });
  });

  server.registerTool("manage_task", {
    description: "Add, toggle, or delete an internal task on a post. Staff except role=user.",
    inputSchema: {
      tenantId: z.string(),
      postId: z.string(),
      action: z.enum(["add", "toggle", "delete"]),
      text: z.string().trim().min(1).max(500).optional(),
      taskId: z.string().max(200).optional(),
      completed: z.boolean().optional(),
    },
  }, async ({ tenantId, postId, action, text, taskId, completed }) => {
    if (!actorCanUseTenant(actor, tenantId)) return fail("Unauthorized: You do not have access to this workspace");
    if (!canMutatePosts(actor.role)) return fail("Unauthorized: cannot mutate tasks");
    const owned = db.prepare("SELECT id FROM posts WHERE id = ? AND tenantId = ?").get(postId, tenantId);
    if (!owned) return fail("Post not found in this workspace");
    if (action === "add") {
      if (!text) return fail("text required");
      const id = randomUUID();
      db.prepare("INSERT INTO tasks (id, postId, text, completed) VALUES (?,?,?,?)").run(id, postId, text, completed ? 1 : 0);
      deps.broadcastPostUpdated(tenantId, postId);
      return ok({ id, postId, text });
    }
    if (!taskId) return fail("taskId required");
    const taskOwned = db.prepare(`
      SELECT t.id
      FROM tasks t
      JOIN posts p ON p.id = t.postId
      WHERE t.id = ? AND t.postId = ? AND p.tenantId = ?
    `).get(taskId, postId, tenantId);
    if (!taskOwned) return fail("Task not found in this workspace");
    if (action === "toggle") {
      db.prepare("UPDATE tasks SET completed = ? WHERE id = ? AND postId = ?").run(completed ? 1 : 0, taskId, postId);
    } else {
      db.prepare("DELETE FROM tasks WHERE id = ? AND postId = ?").run(taskId, postId);
    }
    deps.broadcastPostUpdated(tenantId, postId);
    return ok({ ok: true, action, taskId });
  });

  return server;
}
