import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { applyTenantMembershipsMigration } from "../security/authorization.js";
import { authenticateMcp, generateMcpToken } from "./auth.js";

describe("MCP tenant identity", () => {
  let db: Database.Database;

  afterEach(() => db.close());

  it("derives actor tenant IDs from memberships and current role", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE agency_users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, role TEXT NOT NULL, createdAt TEXT);
      CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE mcp_tokens (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        name TEXT NOT NULL,
        tokenHash TEXT NOT NULL UNIQUE,
        prefix TEXT NOT NULL,
        role TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        lastUsedAt TEXT,
        revoked INTEGER NOT NULL DEFAULT 0,
        expiresAt TEXT
      );
    `);
    db.prepare("INSERT INTO agency_users (id, username, role, createdAt) VALUES (?, ?, ?, ?)").run("member", "member@example.com", "graphic-designer", "now");
    db.prepare("INSERT INTO agency_users (id, username, role, createdAt) VALUES (?, ?, ?, ?)").run("admin", "admin@example.com", "super-admin", "now");
    db.prepare("INSERT INTO tenants (id, name) VALUES (?, ?)").run("tenant-a", "A");
    db.prepare("INSERT INTO tenants (id, name) VALUES (?, ?)").run("tenant-b", "B");
    applyTenantMembershipsMigration(db);
    db.prepare("DELETE FROM tenant_memberships WHERE userId = ?").run("member");

    const memberToken = generateMcpToken();
    db.prepare("INSERT INTO mcp_tokens (id, userId, name, tokenHash, prefix, role, createdAt, revoked) VALUES (?, ?, ?, ?, ?, ?, ?, 0)")
      .run("member-token", "member", "member key", memberToken.tokenHash, memberToken.prefix, "super-admin", "now");
    const memberActor = authenticateMcp(db, { headers: { authorization: `Bearer ${memberToken.token}` } });
    expect(memberActor?.role).toBe("graphic-designer");
    expect(memberActor?.tenantIds).toEqual([]);

    const adminToken = generateMcpToken();
    db.prepare("INSERT INTO mcp_tokens (id, userId, name, tokenHash, prefix, role, createdAt, revoked) VALUES (?, ?, ?, ?, ?, ?, ?, 0)")
      .run("admin-token", "admin", "admin key", adminToken.tokenHash, adminToken.prefix, "super-admin", "now");
    const adminActor = authenticateMcp(db, { headers: { authorization: `Bearer ${adminToken.token}` } });
    expect(adminActor?.tenantIds).toEqual(["tenant-a", "tenant-b"]);
  });
});
