import type { Express, Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { authenticateMcp, type McpActor } from "./auth.js";
import { createReviewRoomMcp } from "./createServer.js";
import type Database from "better-sqlite3";

const ALLOWED_HOSTS = new Set([
  "review-room.theosirislabs.com",
  "localhost",
  "127.0.0.1",
  "localhost:3000",
  "127.0.0.1:3000",
]);

type Deps = {
  db: Database.Database;
  getPosts: (tenantId: string, includeArchived?: boolean) => any[];
  getPostById: (tenantId: string, postId: string) => any;
  tenantPublic: (row: any) => any;
  deriveClientStatus: (internalStatus: string, requested?: string, previous?: string) => string;
  nextSortOrder: (tenantId: string) => number;
  logActivity: (tenantId: string, action: string, subject: string, detail?: string) => void;
  broadcastPostUpdated: (tenantId: string, postId: string) => void;
  broadcastPostCreated: (tenantId: string, postId: string) => void;
};

function hostOk(req: Request): boolean {
  const raw = [
    String(req.headers.host || ""),
    String(req.headers["x-forwarded-host"] || ""),
  ].join(",");
  const hosts = raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (hosts.length === 0) return true;
  return hosts.some((h) => ALLOWED_HOSTS.has(h) || /^localhost:\d{1,5}$/.test(h) || /^127\.0\.0\.1:\d{1,5}$/.test(h));
}

function setCors(res: Response) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export function mountReviewRoomMcp(app: Express, deps: Deps) {
  app.all("/mcp", async (req: Request, res: Response) => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    if (!hostOk(req)) {
      res.status(403).json({ error: "Forbidden host" });
      return;
    }
    if (req.method === "DELETE") {
      res.status(204).end();
      return;
    }
    const actor: McpActor | null = authenticateMcp(deps.db, req);
    if (!actor) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="review-room-mcp"');
      res.status(401).json({ error: "Unauthorized: MCP token required" });
      return;
    }
    const server = createReviewRoomMcp({ ...deps, actor });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[MCP] handleRequest failed:", err);
      if (!res.headersSent) res.status(500).json({ error: "MCP handler failed" });
    }
  });
}
