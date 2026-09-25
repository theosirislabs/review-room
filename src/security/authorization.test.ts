import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyTenantMembershipsMigration,
  canAccessTenant,
  canPerformTenantAction,
  getTenantMemberships,
  listAllowedTenantIds,
  setTenantMemberships,
} from "./authorization.js";
import { validateShareActor } from "./socketAuthorization.js";

describe("tenant authorization", () => {
  let db: Database.Database;

  afterEach(() => db.close());

  const createDb = () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE agency_users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, role TEXT NOT NULL, createdAt TEXT);
      CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT);
    `);
    return db;
  };

  it("backfills existing users once and does not grant future users implicitly", () => {
    createDb();
    db.prepare("INSERT INTO agency_users (id, username, role, createdAt) VALUES (?, ?, ?, ?)").run("u1", "one@example.com", "graphic-designer", "now");
    db.prepare("INSERT INTO agency_users (id, username, role, createdAt) VALUES (?, ?, ?, ?)").run("u2", "two@example.com", "user", "now");
    db.prepare("INSERT INTO tenants (id, name) VALUES (?, ?)").run("t1", "One");
    db.prepare("INSERT INTO tenants (id, name) VALUES (?, ?)").run("t2", "Two");

    expect(applyTenantMembershipsMigration(db)).toBe(true);
    expect(getTenantMemberships(db, "u1")).toEqual(["t1", "t2"]);
    expect(applyTenantMembershipsMigration(db)).toBe(false);

    db.prepare("INSERT INTO agency_users (id, username, role, createdAt) VALUES (?, ?, ?, ?)").run("u3", "three@example.com", "graphic-designer", "now");
    db.prepare("INSERT INTO tenants (id, name) VALUES (?, ?)").run("t3", "Three");
    expect(applyTenantMembershipsMigration(db)).toBe(false);
    expect(getTenantMemberships(db, "u3")).toEqual([]);
  });

  it("uses explicit memberships and gives super-admin a global bypass", () => {
    createDb();
    db.prepare("INSERT INTO agency_users (id, username, role, createdAt) VALUES (?, ?, ?, ?)").run("u1", "one@example.com", "graphic-designer", "now");
    db.prepare("INSERT INTO agency_users (id, username, role, createdAt) VALUES (?, ?, ?, ?)").run("admin", "admin@example.com", "super-admin", "now");
    db.prepare("INSERT INTO tenants (id, name) VALUES (?, ?)").run("t1", "One");
    db.prepare("INSERT INTO tenants (id, name) VALUES (?, ?)").run("t2", "Two");
    applyTenantMembershipsMigration(db);
    setTenantMemberships(db, "u1", ["t1"]);

    expect(listAllowedTenantIds(db, "u1", "graphic-designer")).toEqual(["t1"]);
    expect(canAccessTenant(db, "u1", "graphic-designer", "t2")).toBe(false);
    expect(canAccessTenant(db, "admin", "super-admin", "t2")).toBe(true);
    expect(canPerformTenantAction(db, "u1", "graphic-designer", "t1", "create")).toBe(true);
    expect(canPerformTenantAction(db, "u1", "graphic-designer", "t1", "delete")).toBe(true);
    expect(canPerformTenantAction(db, "u1", "user", "t1", "write")).toBe(false);
  });
});

describe("share actor validation", () => {
  const actor = {
    kind: "share" as const,
    tenantId: "tenant-a",
    postIds: ["post-a"],
    shareToken: "share-token",
  };
  const record = {
    token: "share-token",
    tenantId: "tenant-a",
    postIds: ["post-a"],
    expiresAt: "2099-01-01T00:00:00.000Z",
  };

  it("accepts an active matching record and requested post", () => {
    expect(validateShareActor(actor, record, "post-a", Date.parse("2028-01-01T00:00:00.000Z"))).toEqual({ valid: true });
  });

  it("rejects revoked, expired, and mismatched share scopes", () => {
    expect(validateShareActor(actor, { ...record, revoked: true }, "post-a").valid).toBe(false);
    expect(validateShareActor(actor, { ...record, expiresAt: "2020-01-01T00:00:00.000Z" }, "post-a").valid).toBe(false);
    expect(validateShareActor(actor, { ...record, token: "other" }, "post-a").valid).toBe(false);
    expect(validateShareActor(actor, { ...record, tenantId: "tenant-b" }, "post-a").valid).toBe(false);
    expect(validateShareActor(actor, record, "post-b").valid).toBe(false);
  });
});
