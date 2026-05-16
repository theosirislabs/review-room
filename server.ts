import express from "express";
import cookieParser from "cookie-parser";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import Database from "better-sqlite3";
import { randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { mkdirSync, existsSync, unlinkSync, createReadStream, createWriteStream, readdirSync, rmSync } from "fs";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import path from "path";
import multer from "multer";

// ── Data directories ──────────────────────────────────────────
const DATA_DIR = path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const CHUNKS_DIR = path.join(DATA_DIR, "chunks");
mkdirSync(UPLOADS_DIR, { recursive: true });
mkdirSync(CHUNKS_DIR, { recursive: true });

// ── Database ─────────────────────────────────────────────────
const db = new Database(path.join(DATA_DIR, "osiris.db"));
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    tenantId TEXT,
    title TEXT,
    format TEXT,
    mediaUrls TEXT,
    caption TEXT,
    hashtags TEXT,
    date TEXT,
    time TEXT,
    clientStatus TEXT,
    internalStatus TEXT,
    assignee TEXT,
    campaignCode TEXT,
    contentPillar TEXT,
    internalNotes TEXT,
    assetLineage TEXT,
    isBlocked INTEGER,
    blockedReason TEXT,
    thumbnailUrl TEXT
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    postId TEXT,
    author TEXT,
    text TEXT,
    timestamp TEXT,
    isInternalOnly INTEGER,
    changeType TEXT,
    priority TEXT,
    slideIndex INTEGER
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    postId TEXT,
    text TEXT,
    completed INTEGER
  );

  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT,
    logoUrl TEXT,
    bio TEXT,
    settings TEXT
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    tenantId TEXT,
    name TEXT,
    code TEXT,
    color TEXT,
    startDate TEXT,
    endDate TEXT,
    description TEXT,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS content_pillars (
    id TEXT PRIMARY KEY,
    tenantId TEXT,
    name TEXT,
    color TEXT
  );

  CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    role TEXT DEFAULT 'editor',
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    tenantId TEXT,
    action TEXT,
    subject TEXT,
    detail TEXT,
    user TEXT,
    timestamp TEXT
  );

  CREATE TABLE IF NOT EXISTS agency_users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'graphic-designer',
    createdAt TEXT
  );
`);

// ── Migrations ────────────────────────────────────────────────
const runMigration = (check: string, migrate: string, label: string) => {
  try { db.prepare(check).get(); } catch (e: any) {
    if (e.message.includes("no such column") || e.message.includes("no such table")) {
      console.log(`[MIGRATION] ${label}`);
      db.exec(migrate);
    }
  }
};

runMigration("SELECT bio FROM tenants LIMIT 1", "ALTER TABLE tenants ADD COLUMN bio TEXT", "Adding 'bio' to tenants");
runMigration("SELECT lastActive FROM tenants LIMIT 1", "ALTER TABLE tenants ADD COLUMN lastActive TEXT", "Adding 'lastActive' to tenants");
runMigration("SELECT scheduledAt FROM posts LIMIT 1", "ALTER TABLE posts ADD COLUMN scheduledAt TEXT", "Adding 'scheduledAt' to posts");
runMigration("SELECT revisionCount FROM posts LIMIT 1", "ALTER TABLE posts ADD COLUMN revisionCount INTEGER DEFAULT 0", "Adding 'revisionCount' to posts");
runMigration("SELECT publishedAt FROM posts LIMIT 1", "ALTER TABLE posts ADD COLUMN publishedAt TEXT", "Adding 'publishedAt' to posts");
runMigration("SELECT changeType FROM comments LIMIT 1", "ALTER TABLE comments ADD COLUMN changeType TEXT", "Adding 'changeType' to comments");
runMigration("SELECT priority FROM comments LIMIT 1", "ALTER TABLE comments ADD COLUMN priority TEXT", "Adding 'priority' to comments");
runMigration("SELECT slideIndex FROM comments LIMIT 1", "ALTER TABLE comments ADD COLUMN slideIndex INTEGER", "Adding 'slideIndex' to comments");
runMigration("SELECT thumbnailUrl FROM posts LIMIT 1", "ALTER TABLE posts ADD COLUMN thumbnailUrl TEXT", "Adding 'thumbnailUrl' to posts");
try {
  db.prepare("SELECT 1 FROM agency_users LIMIT 1").get();
} catch (e: any) {
  if (e.message?.includes("no such table")) {
    console.log("[MIGRATION] Creating agency_users table");
    db.exec(`CREATE TABLE agency_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'graphic-designer',
      createdAt TEXT
    )`);
  }
}

try {
  db.prepare("SELECT 1 FROM post_client_shares LIMIT 1").get();
} catch (e: any) {
  if (e.message?.includes("no such table")) {
    console.log("[MIGRATION] Creating post_client_shares table");
    db.exec(`
      CREATE TABLE post_client_shares (
        id TEXT PRIMARY KEY,
        tenantId TEXT NOT NULL,
        postId TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        createdAt TEXT NOT NULL,
        expiresAt TEXT,
        revoked INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_post_client_shares_token ON post_client_shares(token);
      CREATE INDEX idx_post_client_shares_post ON post_client_shares(postId);
    `);
  }
}

// ── Seed Tenants ──────────────────────────────────────────────
const tenantCount = db.prepare("SELECT COUNT(*) as count FROM tenants").get() as { count: number };
if (tenantCount.count === 0) {
  const insertTenant = db.prepare("INSERT INTO tenants (id, name, logoUrl, bio, settings) VALUES (?, ?, ?, ?, ?)");
  insertTenant.run("acmecorp", "Acme Corp", "https://picsum.photos/seed/acme/200/200", "A leading manufacturer of everything.", JSON.stringify({ theme: "default" }));
  insertTenant.run("osiris", "Osiris Labs", "https://picsum.photos/seed/osiris/200/200", "Artificial Intelligence & Creative Studio.", JSON.stringify({ theme: "dark" }));
  insertTenant.run("demo", "Demo Client", "https://picsum.photos/seed/demo/200/200", "Just a demo account for testing.", JSON.stringify({ theme: "default" }));
}

// ── Password hashing ───────────────────────────────────────────
const hashPassword = (password: string) => scryptSync(password, "osiris-salt-v1", 64).toString("hex");
const verifyPassword = (password: string, hash: string) => {
  const buf = Buffer.from(hash, "hex");
  const supplied = scryptSync(password, "osiris-salt-v1", 64);
  return buf.length === supplied.length && timingSafeEqual(buf, supplied);
};

// ── Seed Agency Users (auth accounts) ─────────────────────────
const defaultAdminUsername = "admin@reviewroom.local";
const defaultAdminPassword = "demo2026";
const existingAdmin = db.prepare("SELECT id FROM agency_users WHERE username = ?").get(defaultAdminUsername);
if (!existingAdmin) {
  db.prepare("INSERT INTO agency_users (id, username, passwordHash, role, createdAt) VALUES (?,?,?,?,?)")
    .run(randomUUID(), defaultAdminUsername, hashPassword(defaultAdminPassword), "super-admin", new Date().toISOString());
  console.log(`[SEED] Created super-admin: ${defaultAdminUsername}`);
}

// ── Seed Team Members ─────────────────────────────────────────
const teamCount = db.prepare("SELECT COUNT(*) as count FROM team_members").get() as { count: number };
if (teamCount.count === 0) {
  const ins = db.prepare("INSERT INTO team_members (id, name, email, role, createdAt) VALUES (?,?,?,?,?)");
  ins.run(randomUUID(), "Sarah Johnson", "sarah@osiris.io", "admin", new Date().toISOString());
  ins.run(randomUUID(), "Mike Torres", "mike@osiris.io", "editor", new Date().toISOString());
  ins.run(randomUUID(), "Elena Reyes", "elena@osiris.io", "editor", new Date().toISOString());
}

// ── Seed Campaigns ────────────────────────────────────────────
const campaignCount = db.prepare("SELECT COUNT(*) as count FROM campaigns").get() as { count: number };
if (campaignCount.count === 0) {
  const ins = db.prepare("INSERT INTO campaigns (id, tenantId, name, code, color, startDate, endDate, description, createdAt) VALUES (?,?,?,?,?,?,?,?,?)");
  ins.run(randomUUID(), "acmecorp", "Spring Launch 2026", "SPR26-LCH", "#6366f1", "2026-03-01", "2026-03-31", "Spring collection launch campaign.", new Date().toISOString());
  ins.run(randomUUID(), "acmecorp", "Always On", "ALW-ON", "#10b981", "2026-01-01", "2026-12-31", "Ongoing evergreen content.", new Date().toISOString());
}

// ── Seed Content Pillars ──────────────────────────────────────
const pillarCount = db.prepare("SELECT COUNT(*) as count FROM content_pillars").get() as { count: number };
if (pillarCount.count === 0) {
  const ins = db.prepare("INSERT INTO content_pillars (id, tenantId, name, color) VALUES (?,?,?,?)");
  const pillars = [
    { name: "Product Launch", color: "#6366f1" },
    { name: "Culture", color: "#f59e0b" },
    { name: "Thought Leadership", color: "#3b82f6" },
    { name: "Education", color: "#10b981" },
    { name: "UGC", color: "#ec4899" },
    { name: "Promotional", color: "#ef4444" },
  ];
  pillars.forEach(p => ins.run(randomUUID(), "acmecorp", p.name, p.color));
}

// ── Multer ────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB for large videos
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".avi", ".mkv", ".heic", ".webm"];
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${ext}`));
  },
});

// Chunked upload: 25MB per chunk (well under Cloudflare 100MB limit)
const CHUNK_SIZE = 25 * 1024 * 1024;
const CHUNK_MULTER_LIMIT = 30 * 1024 * 1024; // Slightly above CHUNK_SIZE for buffer
const chunkStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const uploadId = (req.body?.uploadId as string) || "unknown";
    const dir = path.join(CHUNKS_DIR, uploadId);
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, _file, cb) => {
    const idx = (req.body?.chunkIndex as string) ?? "0";
    cb(null, `chunk-${idx.padStart(5, "0")}`);
  },
});
const uploadChunk = multer({
  storage: chunkStorage,
  limits: { fileSize: CHUNK_MULTER_LIMIT },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".avi", ".mkv", ".heic", ".webm"];
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type for chunked upload: ${ext}`));
  },
});

// ── Seed data ─────────────────────────────────────────────────
const count = db.prepare("SELECT COUNT(*) as count FROM posts").get() as { count: number };
if (count.count === 0) {
  const insertPost = db.prepare(`
    INSERT INTO posts (id, tenantId, title, format, mediaUrls, caption, hashtags, date, time,
      clientStatus, internalStatus, assignee, campaignCode, contentPillar, internalNotes,
      assetLineage, isBlocked, blockedReason, thumbnailUrl, revisionCount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertComment = db.prepare(`
    INSERT INTO comments (id, postId, author, text, timestamp, isInternalOnly)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, postId, text, completed)
    VALUES (?, ?, ?, ?)
  `);

  const seedPosts = [
    {
      id: "p1", tenantId: "acmecorp", title: "Spring Collection Launch", format: "carousel",
      mediaUrls: JSON.stringify(["https://picsum.photos/seed/spring1/800/1000", "https://picsum.photos/seed/spring2/800/1000", "https://picsum.photos/seed/spring3/800/1000"]),
      caption: "The new season is finally here. Discover our Spring Collection, featuring lightweight fabrics and vibrant tones designed for the modern explorer.\n\nShop the link in bio.",
      hashtags: JSON.stringify(["#SpringCollection", "#ModernExplorer", "#NewArrivals"]),
      date: "2026-03-01", time: "09:00 AM", clientStatus: "Needs Your Review", internalStatus: "Ready for Client",
      assignee: "Sarah Johnson", campaignCode: "SPR26-LCH", contentPillar: "Product Launch",
      internalNotes: "Ensure colors match the final lookbook PDF. Client was very specific about the green tones.",
      assetLineage: "Final color grade from v3 folder. Do not use v2.", isBlocked: 0, blockedReason: null,
      thumbnailUrl: "", revisionCount: 2,
      comments: [], tasks: [{ id: "t1", text: "Verify color grade with creative director", completed: 1 }],
    },
    {
      id: "p2", tenantId: "acmecorp", title: "Behind the Scenes Reel", format: "reel",
      mediaUrls: JSON.stringify(["https://picsum.photos/seed/btsreel/800/1000"]),
      caption: "A little peek behind the curtain of our latest shoot. It takes a village. 🎬✨",
      hashtags: JSON.stringify(["#BehindTheScenes", "#CreativeProcess", "#OnSet"]),
      date: "2026-03-03", time: "12:00 PM", clientStatus: "Approved", internalStatus: "Scheduled",
      assignee: "Mike Torres", campaignCode: "SPR26-LCH", contentPillar: "Culture",
      internalNotes: "Audio is licensed via Artlist. Do not change the track.",
      assetLineage: "Final cut from editor (v4_final_final.mp4)", isBlocked: 0, blockedReason: null,
      thumbnailUrl: "https://picsum.photos/seed/bts-thumb/400/500", revisionCount: 1,
      comments: [{ id: "c1", author: "Client", text: "Love this energy! Approved.", timestamp: "2026-02-20T10:00:00Z", isInternalOnly: 0 }],
      tasks: [],
    },
    {
      id: "p3", tenantId: "acmecorp", title: "Founder Quote", format: "image",
      mediaUrls: JSON.stringify(["https://picsum.photos/seed/quote/800/1000"]),
      caption: '"Design is not just what it looks like and feels like. Design is how it works." — A reminder of our core philosophy.',
      hashtags: JSON.stringify(["#DesignThinking", "#FounderQuote", "#Philosophy"]),
      date: "2026-03-05", time: "10:00 AM", clientStatus: "Changes Requested", internalStatus: "Changes Requested",
      assignee: "Elena Reyes", campaignCode: "ALW-ON", contentPillar: "Thought Leadership",
      internalNotes: "Designer needs to update the background hex to #1A3B5C. Need this done by EOD.",
      assetLineage: "Figma file: Quotes_Q1.fig", isBlocked: 0, blockedReason: null,
      thumbnailUrl: "", revisionCount: 3,
      comments: [{ id: "c2", author: "Client", text: "Can we change the background color to our secondary brand blue?", timestamp: "2026-02-21T14:30:00Z", isInternalOnly: 0 }],
      tasks: [{ id: "t2", text: "Update background color", completed: 0 }, { id: "t3", text: "Re-export and upload", completed: 0 }],
    },
    {
      id: "p4", tenantId: "acmecorp", title: "Product Feature Highlight", format: "image",
      mediaUrls: JSON.stringify(["https://picsum.photos/seed/feature/800/1000"]),
      caption: "Engineered for durability. The new reinforced stitching means your gear lasts longer, no matter where you take it.",
      hashtags: JSON.stringify(["#ProductDesign", "#Durability", "#Quality"]),
      date: "2026-03-08", time: "03:00 PM", clientStatus: "Needs Your Review", internalStatus: "Ready for Client",
      assignee: "Sarah Johnson", campaignCode: "SPR26-LCH", contentPillar: "Education",
      internalNotes: "Double check the technical specs with the product team before final approval.",
      assetLineage: "Studio shot 4B, retouched.", isBlocked: 0, blockedReason: null,
      thumbnailUrl: "", revisionCount: 0,
      comments: [], tasks: [],
    },
    {
      id: "p5", tenantId: "acmecorp", title: "Community Spotlight", format: "carousel",
      mediaUrls: JSON.stringify(["https://picsum.photos/seed/comm1/800/1000", "https://picsum.photos/seed/comm2/800/1000"]),
      caption: "Seeing how you style our pieces is our favorite part of the day. Tag us to be featured! 📸",
      hashtags: JSON.stringify(["#Community", "#StyleInspo", "#OOTD"]),
      date: "2026-03-10", time: "11:00 AM", clientStatus: "Needs Your Review", internalStatus: "Internal QA",
      assignee: "Mike Torres", campaignCode: "ALW-ON", contentPillar: "UGC",
      internalNotes: "Waiting on usage rights confirmation for the second photo.",
      assetLineage: "UGC folder -> March", isBlocked: 1, blockedReason: "Missing usage rights for slide 2",
      thumbnailUrl: "", revisionCount: 1,
      comments: [], tasks: [{ id: "t4", text: "DM user @styleicon for photo rights", completed: 0 }],
    },
    {
      id: "p6", tenantId: "acmecorp", title: "Weekend Sale Teaser", format: "reel",
      mediaUrls: JSON.stringify(["https://picsum.photos/seed/sale/800/1000"]),
      caption: "Something big is coming this weekend. Turn on post notifications so you don't miss out. 🤫",
      hashtags: JSON.stringify(["#WeekendSale", "#Teaser", "#ComingSoon"]),
      date: "2026-03-12", time: "06:00 PM", clientStatus: "Approved", internalStatus: "Approved",
      assignee: "Elena Reyes", campaignCode: "ALW-ON", contentPillar: "Promotional",
      internalNotes: 'Hook line: "Wait for it..." - ensure text overlay is within safe zones.',
      assetLineage: "Motion graphics team -> Final render", isBlocked: 0, blockedReason: null,
      thumbnailUrl: "https://picsum.photos/seed/sale-thumb/400/500", revisionCount: 0,
      comments: [], tasks: [],
    },
  ];

  db.transaction(() => {
    for (const p of seedPosts) {
      insertPost.run(p.id, p.tenantId, p.title, p.format, p.mediaUrls, p.caption, p.hashtags,
        p.date, p.time, p.clientStatus, p.internalStatus, p.assignee, p.campaignCode,
        p.contentPillar, p.internalNotes, p.assetLineage, p.isBlocked, p.blockedReason, p.thumbnailUrl || null, p.revisionCount || 0);
      for (const c of p.comments) insertComment.run(c.id, p.id, c.author, c.text, c.timestamp, c.isInternalOnly);
      for (const t of p.tasks) insertTask.run(t.id, p.id, t.text, t.completed);
    }
  })();
}

// ── Helpers ───────────────────────────────────────────────────
/** Client share link must not list posts until the agency marks them ready for client review. */
function isPostVisibleOnClientLink(p: { clientStatus?: string }) {
  return p.clientStatus !== "Not Ready for Client";
}

function getPosts(tenantId: string) {
  const posts = db.prepare("SELECT * FROM posts WHERE tenantId = ?").all(tenantId) as any[];
  const comments = db.prepare("SELECT * FROM comments WHERE postId IN (SELECT id FROM posts WHERE tenantId = ?)").all(tenantId) as any[];
  const tasks = db.prepare("SELECT * FROM tasks WHERE postId IN (SELECT id FROM posts WHERE tenantId = ?)").all(tenantId) as any[];
  return posts.map((p) => ({
    ...p,
    mediaUrls: JSON.parse(p.mediaUrls || "[]"),
    hashtags: JSON.parse(p.hashtags || "[]"),
    isBlocked: p.isBlocked === 1,
    revisionCount: p.revisionCount || 0,
    clientComments: comments.filter((c) => c.postId === p.id).map((c) => ({ ...c, isInternalOnly: c.isInternalOnly === 1 })),
    internalTasks: tasks.filter((t) => t.postId === p.id).map((t) => ({ ...t, completed: t.completed === 1 })),
  }));
}

function mapFullPostToClientStrip(p: any) {
  return {
    id: p.id,
    tenantId: p.tenantId,
    title: p.title,
    format: p.format,
    mediaUrls: p.mediaUrls,
    caption: p.caption,
    hashtags: p.hashtags,
    date: p.date,
    time: p.time,
    clientStatus: p.clientStatus,
    internalStatus: "",
    thumbnailUrl: p.thumbnailUrl,
    isBlocked: p.isBlocked,
    clientComments: p.clientComments.filter((c: any) => !c.isInternalOnly),
    internalTasks: [],
    internalNotes: "",
    assetLineage: "",
    campaignCode: "",
    contentPillar: "",
    assignee: "",
    revisionCount: 0,
    blockedReason: p.isBlocked ? p.blockedReason : undefined,
  };
}

function getClientPosts(tenantId: string) {
  return getPosts(tenantId).filter((p) => isPostVisibleOnClientLink(p)).map(mapFullPostToClientStrip);
}

/** One post for a magic-link share (not filtered by main client-board visibility). */
function getPostStripForShare(tenantId: string, postId: string) {
  const p = getPosts(tenantId).find((x) => x.id === postId);
  return p ? mapFullPostToClientStrip(p) : null;
}

function getActiveShareTokensForPost(postId: string): string[] {
  const now = new Date().toISOString();
  const rows = db.prepare(
    "SELECT token FROM post_client_shares WHERE postId = ? AND revoked = 0 AND (expiresAt IS NULL OR expiresAt > ?)"
  ).all(postId, now) as { token: string }[];
  return rows.map((r) => r.token);
}

function emitToPostShareRooms(io: Server, postId: string, event: string, payload: any) {
  for (const token of getActiveShareTokensForPost(postId)) {
    io.to(`share:${token}`).emit(event, payload);
  }
}

const deriveClientStatus = (
  internalStatus: string,
  requestedClientStatus?: string,
  previousClientStatus?: string
): string => {
  // Explicit agency choice: pull post off the client link (must win over internal=Approved / Changes Requested).
  if (requestedClientStatus === "Not Ready for Client") {
    return "Not Ready for Client";
  }

  if (internalStatus === "Ready for Client") {
    return "Needs Your Review";
  }
  if (internalStatus === "Approved") {
    return "Approved";
  }
  if (internalStatus === "Changes Requested") {
    return "Changes Requested";
  }

  // Keep non-review statuses away from "Needs Your Review".
  const carry = previousClientStatus || requestedClientStatus;
  if (carry && carry !== "Needs Your Review") return carry;
  return "Not Ready for Client";
};

function logActivity(tenantId: string, action: string, subject: string, detail: string, user: string = "system") {
  try {
    db.prepare("INSERT INTO activity_log (id, tenantId, action, subject, detail, user, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), tenantId, action, subject, detail, user, new Date().toISOString());
  } catch (err) {
    console.error("[ERROR] Failed to log activity:", err);
  }
}

const deleteAssetByUrl = (url: string) => {
  if (!url || !url.startsWith("/uploads/")) return;
  const filename = path.basename(url);
  // Ensure the file is strictly inside UPLOADS_DIR to prevent path traversal
  const filepath = path.join(UPLOADS_DIR, filename);
  const relative = path.relative(UPLOADS_DIR, filepath);
  if (relative.includes("..") || path.isAbsolute(relative)) {
    console.error(`[SECURITY] Blocked suspicious file deletion attempt: ${url}`);
    return;
  }
  
  try {
    if (existsSync(filepath)) unlinkSync(filepath);
  } catch (err) {
    console.error(`Failed to delete asset ${filepath}:`, err);
  }
};

const MAX_IMPORT_URL_BYTES = 1024 * 1024 * 1024; // 1GB

/** Turn Google Drive / Dropbox share links into direct-download URLs where possible */
function normalizeExternalMediaUrl(raw: string): string {
  const u = raw.trim();
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.toLowerCase();
    const driveFile = u.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveFile) {
      return `https://drive.google.com/uc?export=download&id=${driveFile[1]}`;
    }
    if (host.includes("drive.google.com")) {
      const id = parsed.searchParams.get("id");
      if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
    }
    if (host.includes("dropbox.com")) {
      parsed.searchParams.set("dl", "1");
      return parsed.toString();
    }
    return u;
  } catch {
    return u;
  }
}

function extFromContentType(ct: string): string | null {
  const m = (ct || "").split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/x-msvideo": ".avi",
    "video/x-matroska": ".mkv",
  };
  return map[m] || null;
}

function extFromUrl(u: string): string | null {
  try {
    const ext = path.extname(new URL(u).pathname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".webm", ".avi", ".mkv", ".heic"].includes(ext)) return ext;
  } catch { /* ignore */ }
  return null;
}

// ── Server ───────────────────────────────────────────────────
type AgencyRole = "super-admin" | "graphic-designer" | "marketing-team" | "reviewer";
interface Session { userId: string; username: string; role: AgencyRole; expiresAt: number; }
const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const getToken = (req: any) => req.cookies?.osiris_session || (req.headers.authorization || "").replace("Bearer ", "");
const getSession = (token: string): Session | null => {
  const s = sessions.get(token);
  if (!s || s.expiresAt < Date.now()) {
    if (s) sessions.delete(token);
    return null;
  }
  return s;
};

const requireAuth = (req: any, res: any): { user: Session } | null => {
  const token = getToken(req);
  const user = getSession(token);
  if (!user) {
    res.status(401).json({ error: "Unauthorized: Please log in" });
    return null;
  }
  return { user };
};

const requireRole = (req: any, res: any, allowedRoles: AgencyRole[]): { user: Session } | null => {
  const auth = requireAuth(req, res);
  if (!auth) return null;
  if (auth.user.role === "super-admin" || allowedRoles.includes(auth.user.role)) return auth;
  res.status(403).json({ error: "Forbidden: Insufficient permissions" });
  return null;
};

const requireSuperAdmin = (req: any, res: any): { user: Session } | null =>
  requireRole(req, res, ["super-admin"]);

/**
 * Validates that the request has either:
 * 1. A valid Agency Session (any role)
 * 2. A valid Tenant Token (Client)
 */
const requireTenantAuth = (req: any, res: any, tenantId: string): boolean => {
  if (getSession(getToken(req))) return true;
  const passedToken = req.headers["x-tenant-token"] || req.query.token;
  if (!passedToken) {
    res.status(401).json({ error: "Unauthorized: Missing access token" });
    return false;
  }
  const tenant = db.prepare("SELECT settings FROM tenants WHERE id = ?").get(tenantId) as any;
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return false;
  }
  const settings = JSON.parse(tenant.settings || "{}");
  if (passedToken === settings.clientToken || passedToken === settings.internalToken) return true;
  res.status(403).json({ error: "Forbidden: Invalid token for this tenant" });
  return false;
};

/** Agency session or tenant internal token (not client token). */
const requireAgencyOrInternalStaff = (req: any, res: any, tenantId: string): boolean => {
  if (getSession(getToken(req))) return true;
  const passedToken = req.headers["x-tenant-token"] || req.query.token;
  const tenant = db.prepare("SELECT settings FROM tenants WHERE id = ?").get(tenantId) as any;
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return false;
  }
  const settings = JSON.parse(tenant.settings || "{}");
  if (passedToken === settings.internalToken) return true;
  res.status(403).json({ error: "Forbidden: Agency login or internal workspace token required" });
  return false;
};

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);
  
  // Security headers and basic cookie parsing
  app.use(cookieParser());

  // Serve uploaded files
  app.use("/uploads", express.static(UPLOADS_DIR));

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000,
    transports: ["websocket", "polling"]
  });

  // ── Health Check ──────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.status(200).send("OK");
  });

  // ── Upload (NO GLOBAL BODY PARSERS BEFORE THIS) ─────────────
  app.post("/api/upload", (req, res) => {
    req.setTimeout(1800000);
    res.setTimeout(1800000);
    const contentLength = req.headers["content-length"];
    console.log(`[UPLOAD] Incoming request: ${contentLength} bytes from ${req.ip}`);
    
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        console.error(`[UPLOAD] Multer Error [${err.code}]: ${err.message}`);
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        console.error(`[UPLOAD] General Error: ${err.message}`);
        return res.status(400).json({ error: err.message });
      }
      if (!req.file) {
        console.warn("[UPLOAD] No file received in request headers:", req.headers);
        return res.status(400).json({ error: "No file uploaded" });
      }
      console.log(`[UPLOAD] Success: ${req.file.filename} (${req.file.size} bytes)`);
      res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.filename, size: req.file.size });
    });
  });

  // ── Chunked upload (bypasses Cloudflare 100MB limit) ─────────
  app.post("/api/upload-chunk", (req, res) => {
    req.setTimeout(300000); // 5 min per chunk
    res.setTimeout(300000);
    uploadChunk.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        console.error(`[UPLOAD-CHUNK] Multer Error [${err.code}]: ${err.message}`);
        return res.status(400).json({ error: `Chunk error: ${err.message}` });
      } else if (err) {
        console.error(`[UPLOAD-CHUNK] Error: ${err.message}`);
        return res.status(400).json({ error: err.message });
      }
      if (!req.file) return res.status(400).json({ error: "No chunk received" });
      const uploadId = req.body?.uploadId as string;
      const chunkIndex = req.body?.chunkIndex as string;
      const totalChunks = parseInt(req.body?.totalChunks as string, 10);
      console.log(`[UPLOAD-CHUNK] ${uploadId} chunk ${chunkIndex}/${totalChunks} (${req.file.size} bytes)`);
      res.json({ ok: true, chunkIndex: parseInt(chunkIndex, 10), totalChunks });
    });
  });

  app.post("/api/upload-complete", express.json({ limit: "1mb" }), async (req, res) => {
    const { uploadId, totalChunks, originalFilename } = req.body || {};
    if (!uploadId || totalChunks == null || !originalFilename) {
      return res.status(400).json({ error: "Missing uploadId, totalChunks, or originalFilename" });
    }
    const chunkDir = path.join(CHUNKS_DIR, uploadId);
    if (!existsSync(chunkDir)) {
      return res.status(400).json({ error: "No chunks found for this upload" });
    }
    const ext = path.extname(originalFilename).toLowerCase();
    const finalFilename = `${Date.now()}-${randomUUID()}${ext}`;
    const finalPath = path.join(UPLOADS_DIR, finalFilename);
    try {
      const out = createWriteStream(finalPath);
      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(chunkDir, `chunk-${String(i).padStart(5, "0")}`);
        if (!existsSync(chunkPath)) {
          out.destroy();
          if (existsSync(finalPath)) unlinkSync(finalPath);
          return res.status(400).json({ error: `Missing chunk ${i}` });
        }
        await pipeline(createReadStream(chunkPath), out, { end: i === totalChunks - 1 });
      }
      rmSync(chunkDir, { recursive: true });
      console.log(`[UPLOAD-COMPLETE] ${uploadId} → ${finalFilename}`);
      res.json({ url: `/uploads/${finalFilename}`, filename: finalFilename });
    } catch (e: any) {
      console.error(`[UPLOAD-COMPLETE] Error:`, e);
      if (existsSync(finalPath)) unlinkSync(finalPath);
      res.status(500).json({ error: e?.message || "Reassembly failed" });
    }
  });

  // ── Global Body Parsers (Applied AFTER the upload route) ─────
  app.use(express.json({ limit: "500mb" }));
  app.use(express.urlencoded({ limit: "500mb", extended: true }));

  // ── Rate Limiting (Simple) ────────────────────────────────
  const rateLimits = new Map<string, { count: number, reset: number }>();
  const isRateLimited = (key: string, limit: number, windowMs: number): boolean => {
    const now = Date.now();
    const state = rateLimits.get(key) || { count: 0, reset: now + windowMs };
    if (now > state.reset) {
      state.count = 1;
      state.reset = now + windowMs;
    } else {
      state.count++;
    }
    rateLimits.set(key, state);
    return state.count > limit;
  };

  // ── Authentication ──────────────────────────────────────────
  app.post("/api/auth/login", (req, res) => {
    const ip = req.ip || "unknown";
    if (isRateLimited(`login:${ip}`, 5, 60000)) {
      return res.status(429).json({ error: "Too many login attempts. Try again in a minute." });
    }
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }
    const user = db.prepare("SELECT id, username, passwordHash, role FROM agency_users WHERE username = ?").get(username) as any;
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    const token = randomUUID();
    sessions.set(token, {
      userId: user.id,
      username: user.username,
      role: user.role as AgencyRole,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    res.cookie("osiris_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_TTL_MS,
    });
    res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } });
  });

  app.post("/api/auth/logout", (req, res) => {
    const token = getToken(req);
    if (token) sessions.delete(token);
    res.clearCookie("osiris_session", { path: "/" });
    res.json({ success: true });
  });

  app.get("/api/auth/me", (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    res.json({ user: { id: auth.user.userId, username: auth.user.username, role: auth.user.role } });
  });

  // Import media from external URL (Google Drive, Dropbox, direct links) — server fetches and stores locally
  app.post("/api/import-url", async (req, res) => {
    if (!requireAuth(req, res)) return;
    const rawUrl = (req.body?.url as string)?.trim();
    if (!rawUrl || !rawUrl.startsWith("http")) {
      return res.status(400).json({ error: "A valid http(s) URL is required" });
    }
    const fetchUrl = normalizeExternalMediaUrl(rawUrl);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30 * 60 * 1000);
    let outPath = "";
    try {
      const response = await fetch(fetchUrl, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; OsirisReviewRoom/1.0)",
          Accept: "*/*",
        },
      });
      if (!response.ok) {
        return res.status(400).json({ error: `Could not download (${response.status}). Check the link and sharing settings.` });
      }
      const ct = response.headers.get("content-type") || "";
      if (ct.includes("text/html") && !ct.includes("image") && !ct.includes("video")) {
        return res.status(400).json({
          error:
            "That URL points to a web page, not a media file. For Google Drive: File → Share → Anyone with the link, then paste the link here. Or upload the file from your computer.",
        });
      }
      const body = response.body;
      if (!body) return res.status(400).json({ error: "Empty response from URL" });

      let ext = extFromContentType(ct) || extFromUrl(fetchUrl) || extFromUrl(rawUrl) || ".mp4";
      const filename = `${Date.now()}-${randomUUID()}${ext}`;
      outPath = path.join(UPLOADS_DIR, filename);
      const write = createWriteStream(outPath);

      let total = 0;
      let sniffed = false;
      const sniffTransform = new Transform({
        transform(chunk: Buffer | string | Uint8Array, _enc, cb) {
          try {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
            total += buf.length;
            if (total > MAX_IMPORT_URL_BYTES) {
              cb(new Error("File exceeds maximum import size"));
              return;
            }
            if (!sniffed) {
              sniffed = true;
              const head = buf.slice(0, Math.min(512, buf.length)).toString("utf8").trimStart().toLowerCase();
              if (head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<head") || head.startsWith("<script")) {
                cb(new Error("HTML_PAGE"));
                return;
              }
            }
            cb(null, buf);
          } catch (e: any) {
            cb(e);
          }
        },
      });

      const nodeReadable = Readable.fromWeb(body as any);
      await pipeline(nodeReadable, sniffTransform, write);
      console.log(`[IMPORT-URL] ${rawUrl.slice(0, 80)}… → ${filename} (${total} bytes)`);
      res.json({ url: `/uploads/${filename}`, filename, size: total });
    } catch (e: any) {
      if (outPath && existsSync(outPath)) {
        try { unlinkSync(outPath); } catch { /* ignore */ }
      }
      const msg = e?.message === "HTML_PAGE"
        ? "That URL returned a web page instead of a media file. For Google Drive use Share → Anyone with the link, or upload the file directly."
        : e?.name === "AbortError"
          ? "Import timed out"
          : e?.message || "Failed to import from URL";
      console.error("[IMPORT-URL]", msg, e);
      res.status(400).json({ error: msg });
    } finally {
      clearTimeout(t);
    }
  });

  // ── Tenants REST ──────────────────────────────────────────
  app.get("/api/tenants", (req, res) => {
    if (!requireAuth(req, res)) return;
    const tenants = db.prepare("SELECT * FROM tenants").all();
    res.json(tenants.map((t: any) => ({ ...t, settings: JSON.parse(t.settings || "{}") })));
  });

  app.delete("/api/tenants/:id", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    const { id } = req.params;
    const allPosts = db.prepare("SELECT mediaUrls, thumbnailUrl FROM posts WHERE tenantId = ?").all(id) as any[];
    db.transaction(() => {
      const posts = db.prepare("SELECT id FROM posts WHERE tenantId = ?").all(id) as { id: string }[];
      for (const p of posts) {
        db.prepare("DELETE FROM comments WHERE postId = ?").run(p.id);
        db.prepare("DELETE FROM tasks WHERE postId = ?").run(p.id);
      }
      db.prepare("DELETE FROM posts WHERE tenantId = ?").run(id);
      db.prepare("DELETE FROM campaigns WHERE tenantId = ?").run(id);
      db.prepare("DELETE FROM content_pillars WHERE tenantId = ?").run(id);
      db.prepare("DELETE FROM activity_log WHERE tenantId = ?").run(id);
      db.prepare("DELETE FROM tenants WHERE id = ?").run(id);
    })();
    allPosts.forEach((post) => {
      if (post.thumbnailUrl) deleteAssetByUrl(post.thumbnailUrl);
      try {
        const urls = JSON.parse(post.mediaUrls || "[]");
        urls.forEach(deleteAssetByUrl);
      } catch { }
    });
    io.emit("tenant-deleted", id);
    res.json({ success: true });
  });

  // ── Token Rotation ─────────────────────────────────────────
  app.post("/api/tenants/:id/rotate-token", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    const { id } = req.params;
    const { tokenType } = req.body as { tokenType: "client" | "internal" | "both" };
    const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(id) as any;
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    const settings = JSON.parse(tenant.settings || "{}");
    if (tokenType === "client" || tokenType === "both") settings.clientToken = randomUUID();
    if (tokenType === "internal" || tokenType === "both") settings.internalToken = randomUUID();
    db.prepare("UPDATE tenants SET settings = ? WHERE id = ?").run(JSON.stringify(settings), id);
    const updated = { ...tenant, settings };
    io.emit("tenant-updated", updated);
    res.json({ success: true, settings });
  });

  // ── Global Stats ──────────────────────────────────────────
  app.get("/api/stats", (req, res) => {
    if (!requireAuth(req, res)) return;
    const tenants = db.prepare("SELECT * FROM tenants").all() as any[];
    const allPosts = db.prepare("SELECT * FROM posts").all() as any[];
    const perTenant = tenants.map((t: any) => {
      const tp = allPosts.filter((p: any) => p.tenantId === t.id);
      return {
        tenantId: t.id,
        name: t.name,
        total: tp.length,
        approved: tp.filter((p: any) => p.clientStatus === "Approved").length,
        blocked: tp.filter((p: any) => p.isBlocked).length,
        needsReview: tp.filter((p: any) => p.clientStatus === "Needs Your Review").length,
        scheduled: tp.filter((p: any) => p.internalStatus === "Scheduled").length,
        changesRequested: tp.filter((p: any) => p.clientStatus === "Changes Requested").length,
      };
    });
    res.json({
      totalPosts: allPosts.length,
      totalApproved: allPosts.filter((p: any) => p.clientStatus === "Approved").length,
      totalBlocked: allPosts.filter((p: any) => p.isBlocked).length,
      totalNeedsReview: allPosts.filter((p: any) => p.clientStatus === "Needs Your Review").length,
      totalScheduled: allPosts.filter((p: any) => p.internalStatus === "Scheduled").length,
      perTenant,
    });
  });

  // ── Analytics ─────────────────────────────────────────────
  app.get("/api/analytics", (req, res) => {
    if (!requireAuth(req, res)) return;
    const { tenantId, from, to } = req.query as { tenantId: string; from?: string; to?: string };
    let query = "SELECT * FROM posts WHERE tenantId = ?";
    const params: any[] = [tenantId];
    if (from) { query += " AND date >= ?"; params.push(from); }
    if (to) { query += " AND date <= ?"; params.push(to); }
    const posts = db.prepare(query).all(...params) as any[];

    // Status pipeline funnel
    const statusCounts: Record<string, number> = {};
    const statuses = ["Concept", "Draft", "Internal QA", "Ready for Client", "Changes Requested", "Approved", "Scheduled", "Posted"];
    statuses.forEach(s => statusCounts[s] = posts.filter((p: any) => p.internalStatus === s).length);

    // Content pillar mix
    const pillarCounts: Record<string, number> = {};
    posts.forEach((p: any) => { if (p.contentPillar) pillarCounts[p.contentPillar] = (pillarCounts[p.contentPillar] || 0) + 1; });

    // Format distribution
    const formatCounts = { image: 0, carousel: 0, reel: 0 };
    posts.forEach((p: any) => { if (p.format in formatCounts) (formatCounts as any)[p.format]++; });

    // Approval by week (last 8 weeks)
    const weeklyApproval: Record<string, number> = {};
    posts.filter((p: any) => p.clientStatus === "Approved").forEach((p: any) => {
      const d = new Date(p.date);
      const week = `${d.getFullYear()}-W${String(Math.ceil(d.getDate() / 7)).padStart(2, "0")}`;
      weeklyApproval[week] = (weeklyApproval[week] || 0) + 1;
    });

    // Client status breakdown
    const clientStatusCounts = {
      approved: posts.filter((p: any) => p.clientStatus === "Approved").length,
      needsReview: posts.filter((p: any) => p.clientStatus === "Needs Your Review").length,
      changesRequested: posts.filter((p: any) => p.clientStatus === "Changes Requested").length,
    };

    res.json({
      totalPosts: posts.length,
      statusPipeline: statuses.map(s => ({ status: s, count: statusCounts[s] })),
      pillarMix: Object.entries(pillarCounts).map(([name, count]) => ({ name, count })),
      formatDistribution: Object.entries(formatCounts).map(([name, count]) => ({ name, count })),
      weeklyApproval: Object.entries(weeklyApproval).sort().map(([week, count]) => ({ week, count })),
      clientStatus: clientStatusCounts,
      approvalRate: posts.length > 0 ? Math.round((clientStatusCounts.approved / posts.length) * 100) : 0,
    });
  });

  // ── CSV Export ────────────────────────────────────────────
  app.get("/api/export/posts", (req, res) => {
    if (!requireAuth(req, res)) return;
    const { tenantId } = req.query as { tenantId: string };
    const posts = db.prepare("SELECT * FROM posts WHERE tenantId = ?").all(tenantId) as any[];
    const headers = ["id", "title", "format", "date", "time", "clientStatus", "internalStatus",
      "assignee", "campaignCode", "contentPillar", "isBlocked", "blockedReason", "revisionCount"];
    const csv = [
      headers.join(","),
      ...posts.map(p => headers.map(h => `"${String((p as any)[h] ?? "").replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${tenantId}-posts.csv"`);
    res.send(csv);
  });

  // ── Posts REST ───────────────────────────────────────────
  app.get("/api/posts", (req, res) => {
    const tenantId = (req.query.tenantId as string) || "acmecorp";
    if (!requireTenantAuth(req, res, tenantId)) return;
    if (getSession(getToken(req))) {
      res.json(getPosts(tenantId));
      return;
    }
    const passedToken = (req.headers["x-tenant-token"] || req.query.token) as string;
    const tenant = db.prepare("SELECT settings FROM tenants WHERE id = ?").get(tenantId) as any;
    const settings = JSON.parse(tenant?.settings || "{}");
    if (passedToken === settings.clientToken) {
      res.json(getClientPosts(tenantId));
      return;
    }
    res.json(getPosts(tenantId));
  });

  // Single-post client review link (scoped token; does not expose full client workspace)
  app.post("/api/tenants/:tenantId/posts/:postId/client-share", (req, res) => {
    const { tenantId, postId } = req.params;
    if (!requireAgencyOrInternalStaff(req, res, tenantId)) return;
    const post = db.prepare("SELECT id FROM posts WHERE id = ? AND tenantId = ?").get(postId, tenantId);
    if (!post) return res.status(404).json({ error: "Post not found" });
    const rawDays = parseInt(String(req.body?.expiresInDays ?? "90"), 10);
    const expiresInDays = Number.isFinite(rawDays) ? Math.min(365, Math.max(1, rawDays)) : 90;
    const shareRowId = randomUUID();
    const token = randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();
    db.prepare(
      "INSERT INTO post_client_shares (id, tenantId, postId, token, createdAt, expiresAt, revoked) VALUES (?,?,?,?,?,?,0)"
    ).run(shareRowId, tenantId, postId, token, createdAt, expiresAt);
    const sharePath = `/review/${token}`;
    const host = req.get("x-forwarded-host") || req.get("host") || `localhost:${PORT}`;
    const proto = (req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim();
    res.json({ shareToken: token, sharePath, shareUrl: `${proto}://${host}${sharePath}`, expiresAt });
  });

  app.delete("/api/tenants/:tenantId/posts/:postId/client-share", (req, res) => {
    const { tenantId, postId } = req.params;
    if (!requireAgencyOrInternalStaff(req, res, tenantId)) return;
    const tokens = db.prepare("SELECT token FROM post_client_shares WHERE postId = ? AND tenantId = ? AND revoked = 0").all(postId, tenantId) as { token: string }[];
    db.prepare("UPDATE post_client_shares SET revoked = 1 WHERE postId = ? AND tenantId = ?").run(postId, tenantId);
    for (const { token } of tokens) {
      io.to(`share:${token}`).emit("post-deleted", postId);
    }
    res.json({ success: true, revoked: tokens.length });
  });

  app.get("/api/posts/schedule", (req, res) => {
    if (!requireAuth(req, res)) return;
    const { tenantId } = req.query as { tenantId?: string };
    let posts;
    if (tenantId) {
      posts = db.prepare("SELECT * FROM posts WHERE tenantId = ? AND (internalStatus = 'Scheduled' OR scheduledAt IS NOT NULL)").all(tenantId) as any[];
    } else {
      posts = db.prepare("SELECT * FROM posts WHERE internalStatus = 'Scheduled' OR scheduledAt IS NOT NULL").all() as any[];
    }
    res.json(posts.map(p => ({ ...p, mediaUrls: JSON.parse((p as any).mediaUrls || "[]") })));
  });

  app.delete("/api/posts/:id", (req, res) => {
    const { id } = req.params;
    const tenantId = (req.query.tenantId as string) || "acmecorp";
    if (!requireTenantAuth(req, res, tenantId)) return;
    
    const shareTokens = getActiveShareTokensForPost(id);
    const post = db.prepare("SELECT mediaUrls, thumbnailUrl FROM posts WHERE id = ? AND tenantId = ?").get(id, tenantId) as any;
    db.prepare("UPDATE post_client_shares SET revoked = 1 WHERE postId = ?").run(id);
    for (const tkn of shareTokens) {
      io.to(`share:${tkn}`).emit("post-deleted", id);
    }
    db.prepare("DELETE FROM posts WHERE id = ? AND tenantId = ?").run(id, tenantId);
    db.prepare("DELETE FROM comments WHERE postId = ?").run(id);
    db.prepare("DELETE FROM tasks WHERE postId = ?").run(id);
    if (post) {
      if (post.thumbnailUrl) deleteAssetByUrl(post.thumbnailUrl);
      try {
        const urls = JSON.parse(post.mediaUrls || "[]");
        urls.forEach(deleteAssetByUrl);
      } catch { }
    }
    io.to(tenantId).emit("post-deleted", id);
    res.json({ success: true });
  });

  // ── Comments REST ────────────────────────────────────────
  app.delete("/api/comments/:id", (req, res) => {
    const { id } = req.params;
    const tenantId = (req.query.tenantId as string) || "acmecorp";
    const postId = req.query.postId as string;
    if (!requireTenantAuth(req, res, tenantId)) return;

    db.prepare("DELETE FROM comments WHERE id = ?").run(id);
    if (postId) broadcastPostUpdated(tenantId, postId);
    res.json({ success: true });
  });

  // ── Tasks REST ───────────────────────────────────────────
  app.delete("/api/tasks/:id", (req, res) => {
    const { id } = req.params;
    const tenantId = (req.query.tenantId as string) || "acmecorp";
    const postId = req.query.postId as string;
    if (!requireTenantAuth(req, res, tenantId)) return;

    db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    if (postId) broadcastPostUpdated(tenantId, postId);
    res.json({ success: true });
  });

  // ── Team Members REST (assignees) ─────────────────────────
  app.get("/api/users", (req, res) => {
    if (!requireAuth(req, res)) return;
    res.json(db.prepare("SELECT id, name, email, role, createdAt FROM team_members").all());
  });

  app.post("/api/users", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    const { name, email, role } = req.body;
    if (!name || !email) return res.status(400).json({ error: "name and email required" });
    const id = randomUUID();
    db.prepare("INSERT INTO team_members (id, name, email, role, createdAt) VALUES (?,?,?,?,?)")
      .run(id, name, email, role || "editor", new Date().toISOString());
    const member = db.prepare("SELECT id, name, email, role, createdAt FROM team_members WHERE id = ?").get(id);
    io.emit("team-updated", { action: "added", member });
    res.json(member);
  });

  app.patch("/api/users/:id", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    const { name, email, role } = req.body;
    db.prepare("UPDATE team_members SET name=COALESCE(?,name), email=COALESCE(?,email), role=COALESCE(?,role) WHERE id=?")
      .run(name || null, email || null, role || null, req.params.id);
    const member = db.prepare("SELECT id, name, email, role, createdAt FROM team_members WHERE id = ?").get(req.params.id);
    io.emit("team-updated", { action: "updated", member });
    res.json(member);
  });

  app.delete("/api/users/:id", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    db.prepare("DELETE FROM team_members WHERE id = ?").run(req.params.id);
    io.emit("team-updated", { action: "removed", memberId: req.params.id });
    res.json({ success: true });
  });

  // ── Agency Users REST (login accounts, super-admin only) ────
  app.get("/api/agency-users", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    res.json(db.prepare("SELECT id, username, role, createdAt FROM agency_users").all());
  });

  app.post("/api/agency-users", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: "username and password required" });
    const allowedRoles: AgencyRole[] = ["super-admin", "graphic-designer", "marketing-team", "reviewer"];
    const r = (role && allowedRoles.includes(role)) ? role : "graphic-designer";
    const existing = db.prepare("SELECT id FROM agency_users WHERE username = ?").get(username);
    if (existing) return res.status(400).json({ error: "Username already exists" });
    const id = randomUUID();
    db.prepare("INSERT INTO agency_users (id, username, passwordHash, role, createdAt) VALUES (?,?,?,?,?)")
      .run(id, username, hashPassword(password), r, new Date().toISOString());
    const u = db.prepare("SELECT id, username, role, createdAt FROM agency_users WHERE id = ?").get(id);
    res.json(u);
  });

  app.patch("/api/agency-users/:id", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    const { username, password, role } = req.body;
    const allowedRoles: AgencyRole[] = ["super-admin", "graphic-designer", "marketing-team", "reviewer"];
    const updates: string[] = [];
    const params: any[] = [];
    if (username) { updates.push("username = ?"); params.push(username); }
    if (password) { updates.push("passwordHash = ?"); params.push(hashPassword(password)); }
    if (role && allowedRoles.includes(role)) { updates.push("role = ?"); params.push(role); }
    if (updates.length === 0) return res.status(400).json({ error: "No valid fields to update" });
    params.push(req.params.id);
    db.prepare(`UPDATE agency_users SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    const u = db.prepare("SELECT id, username, role, createdAt FROM agency_users WHERE id = ?").get(req.params.id);
    res.json(u);
  });

  app.delete("/api/agency-users/:id", (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    db.prepare("DELETE FROM agency_users WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // ── Campaigns REST ─────────────────────────────────────────
  app.get("/api/campaigns", (req, res) => {
    if (!requireAuth(req, res)) return;
    const { tenantId } = req.query as { tenantId: string };
    res.json(db.prepare("SELECT * FROM campaigns WHERE tenantId = ? ORDER BY startDate").all(tenantId));
  });

  // ── Content Pillars REST ───────────────────────────────────
  app.get("/api/pillars", (req, res) => {
    if (!requireAuth(req, res)) return;
    const { tenantId } = req.query as { tenantId: string };
    res.json(db.prepare("SELECT * FROM content_pillars WHERE tenantId = ?").all(tenantId));
  });

  // ── Audit Log REST ─────────────────────────────────────────
  app.get("/api/audit", (req, res) => {
    if (!requireAuth(req, res)) return;
    const { tenantId, limit = "50" } = req.query as { tenantId?: string; limit?: string };
    let rows;
    if (tenantId) {
      rows = db.prepare("SELECT * FROM activity_log WHERE tenantId = ? ORDER BY timestamp DESC LIMIT ?")
        .all(tenantId, parseInt(limit));
    } else {
      rows = db.prepare("SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT ?").all(parseInt(limit));
    }
    res.json(rows);
  });

  // ── Broadcast helpers ─────────────────────────────────────
  const broadcastPostUpdated = (tenantId: string, postId: string) => {
    const full = getPosts(tenantId).find((p) => p.id === postId);
    const stripped = getClientPosts(tenantId).find((p) => p.id === postId);
    if (full) io.to(`${tenantId}:internal`).emit("post-updated", full);
    if (stripped) {
      io.to(`${tenantId}:client`).emit("post-updated", stripped);
    } else if (full && !isPostVisibleOnClientLink(full)) {
      // Internal users also join the client room; use a client-only event (not post-deleted).
      io.to(`${tenantId}:client`).emit("client-post-removed", postId);
    }
    const shareStrip = getPostStripForShare(tenantId, postId);
    if (shareStrip) emitToPostShareRooms(io, postId, "post-updated", shareStrip);
  };

  const broadcastPostCreated = (tenantId: string, postId: string) => {
    const full = getPosts(tenantId).find((p) => p.id === postId);
    const stripped = getClientPosts(tenantId).find((p) => p.id === postId);
    if (full) io.to(`${tenantId}:internal`).emit("post-created", full);
    if (stripped) io.to(`${tenantId}:client`).emit("post-created", stripped);
  };

  const broadcastInitialData = (tenantId: string) => {
    const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(tenantId) as any;
    const parsedTenant = tenant ? { ...tenant, settings: JSON.parse(tenant.settings || "{}") } : null;
    io.to(`${tenantId}:internal`).emit("initial-data", { posts: getPosts(tenantId), tenant: parsedTenant });
    io.to(`${tenantId}:client`).emit("initial-data", { posts: getClientPosts(tenantId), tenant: parsedTenant });
  };

  // ── Socket.io ────────────────────────────────────────────
  io.on("connection", (socket) => {
    
    // Global Event Authorization Middleware
    socket.use(([event, ...args], next) => {
      // Allow connection and admin-level events to bypass tenant check
      if (["join-tenant", "join-post-share", "upsert-tenant", "delete-tenant", "disconnect"].includes(event)) {
        return next();
      }

      const data = args[0];
      const shareScope = (socket as any).shareScope as { tenantId: string; postId: string } | undefined;
      // If the event payload contains a tenantId, verify the socket actually belongs to that tenant's room
      if (data && data.tenantId && !socket.rooms.has(data.tenantId)) {
        if (!shareScope || shareScope.tenantId !== data.tenantId) {
          console.warn(`[SECURITY] Blocked unauthorized socket event: ${event} for tenant ${data.tenantId}`);
          socket.emit("error", "Unauthorized: You do not have access to this tenant.");
          return next(new Error("Unauthorized"));
        }
        const postIdInPayload = data.post?.id ?? data.postId;
        if (!postIdInPayload || postIdInPayload !== shareScope.postId) {
          console.warn(`[SECURITY] Blocked share-scoped socket event: ${event} for wrong post`);
          socket.emit("error", "Unauthorized: This action is not allowed from a single-post review link.");
          return next(new Error("Unauthorized"));
        }
        return next();
      }
      next();
    });

    socket.on("join-tenant", (payload: string | { tenantId: string; mode?: string; token?: string }) => {
      const tenantId = typeof payload === "string" ? payload : payload.tenantId;
      const mode = typeof payload === "string" ? "internal" : (payload.mode ?? "internal");
      const passedToken = typeof payload === "string" ? "" : (payload.token || "");
      const internalRoom = `${tenantId}:internal`;
      const clientRoom = `${tenantId}:client`;

      let tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(tenantId) as any;
      if (tenant) {
        let settings = JSON.parse(tenant.settings || "{}");
        if (!settings.clientToken || !settings.internalToken) {
          settings.clientToken = settings.clientToken || randomUUID();
          settings.internalToken = settings.internalToken || randomUUID();
          db.prepare("UPDATE tenants SET settings = ? WHERE id = ?").run(JSON.stringify(settings), tenantId);
          tenant.settings = JSON.stringify(settings);
          console.log(`[AUTH] Generated new tokens for tenant '${tenantId}'`);
        }
      }

      const parsedTenant = tenant ? { ...tenant, settings: JSON.parse(tenant.settings || "{}") } : null;

      if (mode === "client") {
        if (parsedTenant && passedToken !== parsedTenant.settings.clientToken) {
          socket.emit("error", "Invalid or missing secure Client Token.");
          return;
        }
        // Update lastActive
        const now = new Date().toISOString();
        db.prepare("UPDATE tenants SET lastActive = ? WHERE id = ?").run(now, tenantId);
        io.emit("tenant-updated", { ...parsedTenant, lastActive: now });

        socket.join(tenantId);
        socket.join(clientRoom);
        socket.emit("initial-data", { posts: getClientPosts(tenantId), tenant: { ...parsedTenant, lastActive: now } });
      } else {
        if (parsedTenant && passedToken !== parsedTenant.settings.internalToken) {
          socket.emit("error", "Invalid or missing secure Internal Token.");
          return;
        }
        // Update lastActive for internal join too
        const now = new Date().toISOString();
        db.prepare("UPDATE tenants SET lastActive = ? WHERE id = ?").run(now, tenantId);
        io.emit("tenant-updated", { ...parsedTenant, lastActive: now });

        socket.join(tenantId);
        socket.join(clientRoom); // Join both so we get all updates
        socket.join(internalRoom);
        socket.emit("initial-data", { posts: getPosts(tenantId), tenant: { ...parsedTenant, lastActive: now } });
      }
    });

    socket.on("join-post-share", (payload: { shareToken?: string }) => {
      const shareToken = (payload?.shareToken || "").trim();
      if (!shareToken) {
        socket.emit("error", "Missing review link token.");
        return;
      }
      const now = new Date().toISOString();
      const row = db.prepare(`
        SELECT s.tenantId, s.postId, s.token
        FROM post_client_shares s
        JOIN posts p ON p.id = s.postId AND p.tenantId = s.tenantId
        WHERE s.token = ? AND s.revoked = 0 AND (s.expiresAt IS NULL OR s.expiresAt > ?)
      `).get(shareToken, now) as { tenantId: string; postId: string; token: string } | undefined;
      if (!row) {
        socket.emit("error", "Invalid or expired review link.");
        return;
      }
      const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(row.tenantId) as any;
      if (!tenant) {
        socket.emit("error", "Workspace not found.");
        return;
      }
      const parsed = JSON.parse(tenant.settings || "{}");
      const tenantForClient = {
        ...tenant,
        settings: {
          theme: parsed.theme,
          // Never send workspace tokens to a single-post share viewer
        },
      };
      (socket as any).shareScope = { tenantId: row.tenantId, postId: row.postId, shareToken: row.token };
      socket.join(`share:${row.token}`);
      const strip = getPostStripForShare(row.tenantId, row.postId);
      const posts = strip ? [strip] : [];
      socket.emit("initial-data", { posts, tenant: tenantForClient, sharePostId: row.postId });
    });

    socket.on("create-post", (data: { tenantId: string; post: any }) => {
      const { tenantId, post } = data;
      const id = post.id || randomUUID();
      const internalStatus = post.internalStatus || "Draft";
      const clientStatus = deriveClientStatus(internalStatus, post.clientStatus);
      db.prepare(`INSERT INTO posts (id, tenantId, title, format, mediaUrls, caption, hashtags,
        date, time, clientStatus, internalStatus, assignee, campaignCode, contentPillar,
        internalNotes, assetLineage, isBlocked, blockedReason, thumbnailUrl, revisionCount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, tenantId, post.title, post.format, JSON.stringify(post.mediaUrls || []),
          post.caption || "", JSON.stringify(post.hashtags || []), post.date, post.time,
          clientStatus, internalStatus,
          post.assignee || "Unassigned", post.campaignCode || "", post.contentPillar || "",
          post.internalNotes || "", post.assetLineage || "", post.isBlocked ? 1 : 0, post.blockedReason || null,
          post.thumbnailUrl || null, 0);
      logActivity(tenantId, "post-created", post.title, `New post created in ${post.internalStatus} status`);
      io.to(tenantId).emit("activity", { action: "post-created", subject: post.title, tenantId, timestamp: new Date().toISOString() });
      broadcastPostCreated(tenantId, id);
    });

    socket.on("create-posts-bulk", (data: { tenantId: string; posts: any[] }) => {
      const { tenantId, posts } = data;
      db.transaction(() => {
        for (const post of posts) {
          const id = post.id || randomUUID();
          const internalStatus = post.internalStatus || "Draft";
          const clientStatus = deriveClientStatus(internalStatus, post.clientStatus);
          db.prepare(`INSERT INTO posts (id, tenantId, title, format, mediaUrls, caption, hashtags,
            date, time, clientStatus, internalStatus, assignee, campaignCode, contentPillar,
            internalNotes, assetLineage, isBlocked, blockedReason, thumbnailUrl, revisionCount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(id, tenantId, post.title, post.format, JSON.stringify(post.mediaUrls || []),
              post.caption || "", JSON.stringify(post.hashtags || []), post.date, post.time,
              clientStatus, internalStatus,
              post.assignee || "Unassigned", post.campaignCode || "", post.contentPillar || "",
              post.internalNotes || "", post.assetLineage || "", post.isBlocked ? 1 : 0, post.blockedReason || null,
              post.thumbnailUrl || null, 0);
        }
      })();
      logActivity(tenantId, "bulk-upload", `${posts.length} posts`, `Bulk upload of ${posts.length} posts`);
      io.to(tenantId).emit("activity", { action: "bulk-upload", subject: `${posts.length} posts`, tenantId, timestamp: new Date().toISOString() });
      broadcastInitialData(tenantId);
    });

    socket.on("update-post", (data: { tenantId: string; post: any }, ack?: (post: any) => void) => {
      const { tenantId, post } = data;
      if (!post.id) return;

      try {
        db.transaction(() => {
          // Increment revisionCount if status moves to Changes Requested
          const existing = db.prepare("SELECT internalStatus, clientStatus, revisionCount FROM posts WHERE id = ? AND tenantId = ?").get(post.id, tenantId) as any;
          if (!existing) return;

          const internalStatus = post.internalStatus || existing.internalStatus || "Draft";
          const clientStatus = deriveClientStatus(internalStatus, post.clientStatus, existing.clientStatus);
          let revisionCount = existing.revisionCount || 0;
          if (existing.internalStatus !== "Changes Requested" && internalStatus === "Changes Requested") {
            revisionCount++;
          }

          db.prepare(`UPDATE posts SET title=?, format=?, mediaUrls=?, caption=?, hashtags=?, date=?,
            time=?, clientStatus=?, internalStatus=?, assignee=?, campaignCode=?, contentPillar=?,
            internalNotes=?, assetLineage=?, isBlocked=?, blockedReason=?, thumbnailUrl=?,
            scheduledAt=?, revisionCount=? WHERE id=? AND tenantId=?`)
            .run(
              post.title || "Untitled", 
              post.format || "image", 
              JSON.stringify(post.mediaUrls || []), 
              post.caption || "",
              JSON.stringify(post.hashtags || []), 
              post.date || new Date().toISOString().split("T")[0], 
              post.time || "00:00", 
              clientStatus,
              internalStatus, 
              post.assignee || "Unassigned", 
              post.campaignCode || "", 
              post.contentPillar || "",
              post.internalNotes || "", 
              post.assetLineage || "", 
              post.isBlocked ? 1 : 0, 
              post.blockedReason || null,
              post.thumbnailUrl || null, 
              post.scheduledAt || null, 
              revisionCount, 
              post.id, 
              tenantId
            );

          // Emit activity and client notification when moved to Ready for Client
          if (existing.internalStatus !== "Ready for Client" && internalStatus === "Ready for Client") {
            logActivity(tenantId, "ready-for-client", post.title, `Post sent to client for review`);
            io.to(`${tenantId}:client`).emit("client-notification", { type: "new-post-ready", postId: post.id, title: post.title });
          }
          if (internalStatus !== existing.internalStatus) {
            logActivity(tenantId, "status-changed", post.title, `Status: ${existing.internalStatus} → ${internalStatus}`);
            io.to(tenantId).emit("activity", { action: "status-changed", subject: post.title, detail: `→ ${internalStatus}`, tenantId, timestamp: new Date().toISOString() });
          }
        })();
        broadcastPostUpdated(tenantId, post.id);
        const updated = getPosts(tenantId).find((p: any) => p.id === post.id);
        if (ack && updated) ack(updated);
      } catch (err) {
        console.error("[CRITICAL] Update Post Failed:", err);
        socket.emit("error", "Failed to update post. Database is temporarily busy or readonly.");
        if (ack) ack(null);
      }
    });

    socket.on("delete-post", (data: { tenantId: string; postId: string }) => {
      const { tenantId, postId } = data;
      try {
        const shareTokens = getActiveShareTokensForPost(postId);
        const p = db.prepare("SELECT title, mediaUrls, thumbnailUrl FROM posts WHERE id = ?").get(postId) as any;
        if (p) {
          // Clean up orphaned files from disk
          try {
            const urls = JSON.parse(p.mediaUrls || "[]");
            urls.forEach(deleteAssetByUrl);
            if (p.thumbnailUrl) deleteAssetByUrl(p.thumbnailUrl);
          } catch (e) {
            console.error("Error cleaning up assets:", e);
          }
          logActivity(tenantId, "post-deleted", p.title, "Post permanently deleted");
        }
        db.prepare("UPDATE post_client_shares SET revoked = 1 WHERE postId = ?").run(postId);
        for (const tkn of shareTokens) {
          io.to(`share:${tkn}`).emit("post-deleted", postId);
        }
        db.prepare("DELETE FROM posts WHERE id = ? AND tenantId = ?").run(postId, tenantId);
        db.prepare("DELETE FROM comments WHERE postId = ?").run(postId);
        db.prepare("DELETE FROM tasks WHERE postId = ?").run(postId);
        io.to(tenantId).emit("post-deleted", postId);
      } catch (err) {
        console.error("[CRITICAL] Delete Post Failed:", err);
        socket.emit("error", "Database error: Failed to delete post.");
      }
    });

    socket.on("add-comment", (data: { tenantId: string; postId: string; comment: any }) => {
      const { tenantId, postId, comment } = data;
      try {
        const id = comment.id || randomUUID();
        db.prepare("INSERT INTO comments (id, postId, author, text, timestamp, isInternalOnly, changeType, priority, slideIndex) VALUES (?,?,?,?,?,?,?,?,?)")
          .run(id, postId, comment.author, comment.text, comment.timestamp || new Date().toISOString(),
            comment.isInternalOnly ? 1 : 0, comment.changeType || null, comment.priority || null, comment.slideIndex ?? null);
        const post = db.prepare("SELECT title FROM posts WHERE id = ?").get(postId) as any;
        logActivity(tenantId, "comment-added", post?.title || postId, `${comment.author} ${comment.isInternalOnly ? "(internal)" : "(client)"}: ${comment.text.substring(0, 60)}`);
        io.to(tenantId).emit("activity", { action: "comment-added", subject: post?.title, detail: comment.text.substring(0, 60), tenantId, timestamp: new Date().toISOString() });
        broadcastPostUpdated(tenantId, postId);
      } catch (err) {
        console.error("[CRITICAL] Add Comment Failed:", err);
        socket.emit("error", "Database error: Failed to add comment.");
      }
    });

    socket.on("delete-comment", (data: { tenantId: string; postId: string; commentId: string }) => {
      const { tenantId, postId, commentId } = data;
      try {
        db.prepare("DELETE FROM comments WHERE id = ?").run(commentId);
        broadcastPostUpdated(tenantId, postId);
      } catch (err) {
        console.error("[CRITICAL] Delete Comment Failed:", err);
        socket.emit("error", "Database error: Failed to delete comment.");
      }
    });

    socket.on("add-task", (data: { tenantId: string; postId: string; task: { text: string; completed?: boolean } }) => {
      const { tenantId, postId, task } = data;
      const id = randomUUID();
      db.prepare("INSERT INTO tasks (id, postId, text, completed) VALUES (?,?,?,?)")
        .run(id, postId, task.text, task.completed ? 1 : 0);
      io.to(tenantId).emit("post-updated", getPosts(tenantId).find((p) => p.id === postId));
    });

    socket.on("delete-task", (data: { tenantId: string; postId: string; taskId: string }) => {
      const { tenantId, postId, taskId } = data;
      db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
      broadcastPostUpdated(tenantId, postId);
    });

    socket.on("toggle-task", (data: { tenantId: string; postId: string; taskId: string; completed: boolean }) => {
      const { tenantId, postId, taskId, completed } = data;
      db.prepare("UPDATE tasks SET completed = ? WHERE id = ?").run(completed ? 1 : 0, taskId);
      broadcastPostUpdated(tenantId, postId);
    });

    socket.on("upsert-tenant", (data: { tenant: any, adminToken: string }, callback?: (res: { success: boolean, error?: string }) => void) => {
      const session = getSession(data.adminToken);
      if (!session || session.role !== "super-admin") {
        callback?.({ success: false, error: "Unauthorized: Super-admin access required." });
        return;
      }
      const tenant = data.tenant;
      try {
        const exists = db.prepare("SELECT id FROM tenants WHERE id = ?").get(tenant.id);
        if (exists) {
          db.prepare("UPDATE tenants SET name=?, logoUrl=?, bio=?, settings=? WHERE id=?")
            .run(tenant.name, tenant.logoUrl, tenant.bio || "", JSON.stringify(tenant.settings || {}), tenant.id);
        } else {
          db.prepare("INSERT INTO tenants (id, name, logoUrl, bio, settings) VALUES (?, ?, ?, ?, ?)")
            .run(tenant.id, tenant.name, tenant.logoUrl, tenant.bio || "", JSON.stringify(tenant.settings || {}));
        }
        io.emit("tenant-updated", { ...tenant, settings: tenant.settings || {} });
        callback?.({ success: true });
      } catch (err: any) {
        console.error(`[ERROR] upsert-tenant failed: ${err.message}`);
        callback?.({ success: false, error: err.message });
      }
    });

    // ── Campaign CRUD ─────────────────────────────────────
    socket.on("create-campaign", (data: { tenantId: string; campaign: any; adminToken: string }) => {
      if (!getSession(data.adminToken)) return;
      const { tenantId, campaign } = data;
      const id = randomUUID();
      db.prepare("INSERT INTO campaigns (id, tenantId, name, code, color, startDate, endDate, description, createdAt) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(id, tenantId, campaign.name, campaign.code, campaign.color || "#6366f1",
          campaign.startDate, campaign.endDate, campaign.description || "", new Date().toISOString());
      const created = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(id);
      io.emit("campaign-updated", { action: "created", campaign: created, tenantId });
    });

    socket.on("update-campaign", (data: { tenantId: string; campaign: any; adminToken: string }) => {
      if (!getSession(data.adminToken)) return;
      const { campaign } = data;
      db.prepare("UPDATE campaigns SET name=?, code=?, color=?, startDate=?, endDate=?, description=? WHERE id=?")
        .run(campaign.name, campaign.code, campaign.color, campaign.startDate, campaign.endDate, campaign.description, campaign.id);
      io.emit("campaign-updated", { action: "updated", campaign, tenantId: data.tenantId });
    });

    socket.on("delete-campaign", (data: { tenantId: string; campaignId: string; adminToken: string }) => {
      if (!getSession(data.adminToken)) return;
      db.prepare("DELETE FROM campaigns WHERE id = ? AND tenantId = ?").run(data.campaignId, data.tenantId);
      io.emit("campaign-updated", { action: "deleted", campaignId: data.campaignId, tenantId: data.tenantId });
    });

    // ── Content Pillar CRUD ───────────────────────────────
    socket.on("create-pillar", (data: { tenantId: string; pillar: any; adminToken: string }) => {
      if (!getSession(data.adminToken)) return;
      const id = randomUUID();
      db.prepare("INSERT INTO content_pillars (id, tenantId, name, color) VALUES (?,?,?,?)")
        .run(id, data.tenantId, data.pillar.name, data.pillar.color || "#6366f1");
      const created = db.prepare("SELECT * FROM content_pillars WHERE id = ?").get(id);
      io.emit("pillar-updated", { action: "created", pillar: created, tenantId: data.tenantId });
    });

    socket.on("delete-pillar", (data: { tenantId: string; pillarId: string; adminToken: string }) => {
      if (!getSession(data.adminToken)) return;
      db.prepare("DELETE FROM content_pillars WHERE id = ? AND tenantId = ?").run(data.pillarId, data.tenantId);
      io.emit("pillar-updated", { action: "deleted", pillarId: data.pillarId, tenantId: data.tenantId });
    });

    socket.on("disconnect", () => console.log("Client disconnected:", socket.id));
  });

  // ── Vite dev or prod static ──────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  // ── Background Workers ─────────────────────────────────────
  setInterval(() => {
    const now = new Date().toISOString();
    const toPost = db.prepare("SELECT id, tenantId, title FROM posts WHERE internalStatus = 'Scheduled' AND scheduledAt <= ?").all(now) as any[];
    
    if (toPost.length > 0) {
      db.transaction(() => {
        for (const p of toPost) {
          db.prepare("UPDATE posts SET internalStatus = 'Posted', publishedAt = ? WHERE id = ?").run(now, p.id);
          logActivity(p.tenantId, "status-changed", p.title, "Status: Scheduled → Posted (Auto)");
          io.to(p.tenantId).emit("activity", { action: "status-changed", subject: p.title, detail: "→ Posted (Auto)", tenantId: p.tenantId, timestamp: now });
          broadcastPostUpdated(p.tenantId, p.id);
        }
      })();
      console.log(`[WORKER] Auto-posted ${toPost.length} scheduled items.`);
    }
  }, 60000); // Check every minute

  httpServer.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();
