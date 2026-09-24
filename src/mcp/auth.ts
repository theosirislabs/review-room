import { createHash, randomBytes } from "crypto";
import type Database from "better-sqlite3";

export const MCP_TOKEN_PREFIX = "rr_mcp_";
const LAST_USED_MIN_MS = 60_000;
const lastUsedWrite = new Map<string, number>();

export type McpActor = {
  tokenId: string;
  userId: string;
  username: string;
  role: string;
  tokenName: string;
  expiresAt: string | null;
};

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateMcpToken(): { token: string; prefix: string; tokenHash: string } {
  const token = MCP_TOKEN_PREFIX + randomBytes(32).toString("hex");
  return { token, prefix: token.slice(0, 12), tokenHash: hashMcpToken(token) };
}

export function parseBearer(req: { headers?: Record<string, unknown> }): string | null {
  const raw = String(req.headers?.authorization || req.headers?.Authorization || "");
  const m = /^Bearer\s+(\S+)/i.exec(raw);
  const token = (m?.[1] || "").trim();
  if (!token || token === "PLACEHOLDER" || token === "***") return null;
  return token;
}

export function authenticateMcp(db: Database.Database, req: { headers?: Record<string, unknown> }): McpActor | null {
  const token = parseBearer(req);
  if (!token || !token.startsWith(MCP_TOKEN_PREFIX)) return null;
  const tokenHash = hashMcpToken(token);
  const match = db.prepare(`
    SELECT t.id, t.userId, t.name, t.tokenHash, t.role, t.expiresAt, t.revoked, u.username
    FROM mcp_tokens t
    LEFT JOIN agency_users u ON u.id = t.userId
    WHERE t.tokenHash = ? AND t.revoked = 0
  `).get(tokenHash) as any;
  if (!match) return null;
  if (match.expiresAt && String(match.expiresAt) < new Date().toISOString()) return null;
  const now = Date.now();
  const prev = lastUsedWrite.get(match.id) || 0;
  if (now - prev > LAST_USED_MIN_MS) {
    lastUsedWrite.set(match.id, now);
    try {
      db.prepare("UPDATE mcp_tokens SET lastUsedAt = ? WHERE id = ?").run(new Date().toISOString(), match.id);
    } catch { /* ignore */ }
  }
  return {
    tokenId: match.id,
    userId: match.userId,
    username: match.username || "unknown",
    role: match.role,
    tokenName: match.name,
    expiresAt: match.expiresAt || null,
  };
}

export function canCreatePosts(role: string) {
  return role === "super-admin" || role === "graphic-designer";
}

export function canMutatePosts(role: string) {
  return role !== "user";
}
