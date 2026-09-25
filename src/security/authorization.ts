import type Database from "better-sqlite3";

export const TENANT_MEMBERSHIPS_MIGRATION_VERSION = 1;

export type TenantAction =
  | "read"
  | "view"
  | "write"
  | "mutate"
  | "manage"
  | "create"
  | "delete"
  | "admin";

type SqliteDatabase = Database.Database;

function tableExists(db: SqliteDatabase, table: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
}

function columnsFor(db: SqliteDatabase, table: string): Set<string> {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name));
}

export function ensureTenantMembershipsSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      appliedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tenant_memberships (
      userId TEXT NOT NULL,
      tenantId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      PRIMARY KEY (userId, tenantId)
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user ON tenant_memberships(userId);
    CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant ON tenant_memberships(tenantId);
  `);
}

function activeAgencyUserQuery(db: SqliteDatabase): string {
  const columns = columnsFor(db, "agency_users");
  const predicates: string[] = [];
  if (columns.has("deletedAt")) predicates.push("(deletedAt IS NULL OR deletedAt = '')");
  if (columns.has("deleted")) predicates.push("(deleted IS NULL OR deleted = 0)");
  return `SELECT id FROM agency_users${predicates.length ? ` WHERE ${predicates.join(" AND ")}` : ""}`;
}

export function applyTenantMembershipsMigration(db: SqliteDatabase): boolean {
  ensureTenantMembershipsSchema(db);
  if (!tableExists(db, "agency_users") || !tableExists(db, "tenants")) return false;

  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(TENANT_MEMBERSHIPS_MIGRATION_VERSION);
  if (applied) return false;

  const users = db.prepare(activeAgencyUserQuery(db)).all() as { id: string }[];
  const tenants = db.prepare("SELECT id FROM tenants").all() as { id: string }[];
  const createdAt = new Date().toISOString();
  const insertMembership = db.prepare(
    "INSERT OR IGNORE INTO tenant_memberships (userId, tenantId, createdAt) VALUES (?, ?, ?)"
  );
  const apply = db.transaction(() => {
    for (const user of users) {
      for (const tenant of tenants) insertMembership.run(user.id, tenant.id, createdAt);
    }
    db.prepare("INSERT OR IGNORE INTO schema_migrations (version, appliedAt) VALUES (?, ?)").run(
      TENANT_MEMBERSHIPS_MIGRATION_VERSION,
      createdAt
    );
  });
  apply();
  return true;
}

export function listAllowedTenantIds(db: SqliteDatabase, userId: string, role: string): string[] {
  ensureTenantMembershipsSchema(db);
  if (role === "super-admin") {
    return (db.prepare("SELECT id FROM tenants ORDER BY id").all() as { id: string }[]).map((row) => row.id);
  }
  if (!userId || !tableExists(db, "tenants")) return [];
  const rows = db.prepare(`
    SELECT t.id
    FROM tenant_memberships m
    JOIN tenants t ON t.id = m.tenantId
    WHERE m.userId = ?
    ORDER BY t.id
  `).all(userId) as { id: string }[];
  return rows.map((row) => row.id);
}

export function canAccessTenant(db: SqliteDatabase, userId: string, role: string, tenantId: string): boolean {
  if (!tenantId) return false;
  ensureTenantMembershipsSchema(db);
  if (role === "super-admin") {
    return !!db.prepare("SELECT id FROM tenants WHERE id = ?").get(tenantId);
  }
  if (!userId) return false;
  return !!db.prepare(`
    SELECT 1
    FROM tenant_memberships m
    JOIN tenants t ON t.id = m.tenantId
    WHERE m.userId = ? AND m.tenantId = ?
  `).get(userId, tenantId);
}

export function canPerformTenantAction(
  db: SqliteDatabase,
  userId: string,
  role: string,
  tenantId: string,
  action: TenantAction | string
): boolean {
  if (!canAccessTenant(db, userId, role, tenantId)) return false;
  if (action === "read" || action === "view") return true;
  if (action === "write" || action === "mutate" || action === "manage") return role !== "user";
  if (action === "create" || action === "delete") return role === "super-admin" || role === "graphic-designer";
  if (action === "admin") return role === "super-admin";
  return false;
}

export function getTenantMemberships(db: SqliteDatabase, userId: string): string[] {
  ensureTenantMembershipsSchema(db);
  return (db.prepare("SELECT tenantId FROM tenant_memberships WHERE userId = ? ORDER BY tenantId").all(userId) as { tenantId: string }[])
    .map((row) => row.tenantId);
}

export function setTenantMemberships(db: SqliteDatabase, userId: string, tenantIds: string[]): void {
  ensureTenantMembershipsSchema(db);
  if (!db.prepare("SELECT id FROM agency_users WHERE id = ?").get(userId)) {
    throw new Error(`User not found: ${userId}`);
  }
  const uniqueIds = [...new Set(tenantIds.filter((tenantId): tenantId is string => typeof tenantId === "string" && tenantId.length > 0))];
  for (const tenantId of uniqueIds) {
    if (!db.prepare("SELECT id FROM tenants WHERE id = ?").get(tenantId)) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }
  }
  const createdAt = new Date().toISOString();
  const insert = db.prepare("INSERT INTO tenant_memberships (userId, tenantId, createdAt) VALUES (?, ?, ?)");
  const replace = db.transaction(() => {
    db.prepare("DELETE FROM tenant_memberships WHERE userId = ?").run(userId);
    for (const tenantId of uniqueIds) insert.run(userId, tenantId, createdAt);
  });
  replace();
}
