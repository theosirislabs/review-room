import { createHash } from "crypto";
import type Database from "better-sqlite3";

type SqliteDatabase = Database.Database;

export const SHARE_TOKEN_MIGRATION_VERSION = 2;

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tableExists(db: SqliteDatabase, table: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
}

function columnsFor(db: SqliteDatabase, table: string): Set<string> {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name));
}

function migratePostShares(db: SqliteDatabase): void {
  if (!tableExists(db, "post_client_shares")) return;
  const columns = columnsFor(db, "post_client_shares");
  if (columns.has("tokenHash")) {
    const legacy = db.prepare("SELECT id, token FROM post_client_shares WHERE tokenHash IS NULL AND token IS NOT NULL").all() as { id: string; token: string }[];
    const update = db.prepare("UPDATE post_client_shares SET tokenHash = ?, token = NULL WHERE id = ?");
    for (const row of legacy) update.run(hashShareToken(row.token), row.id);
    return;
  }
  db.exec(`
    CREATE TABLE post_client_shares_hashed (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      postId TEXT NOT NULL,
      token TEXT,
      tokenHash TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      expiresAt TEXT,
      revoked INTEGER NOT NULL DEFAULT 0
    );
  `);
  const rows = db.prepare("SELECT id, tenantId, postId, token, createdAt, expiresAt, revoked FROM post_client_shares").all() as any[];
  const insert = db.prepare("INSERT INTO post_client_shares_hashed (id, tenantId, postId, token, tokenHash, createdAt, expiresAt, revoked) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)");
  for (const row of rows) {
    const rawToken = String(row.token || "");
    if (!rawToken) throw new Error("Legacy review-link token is missing");
    insert.run(row.id, row.tenantId, row.postId, hashShareToken(rawToken), row.createdAt, row.expiresAt, row.revoked);
  }
  db.exec("DROP TABLE post_client_shares");
  db.exec("ALTER TABLE post_client_shares_hashed RENAME TO post_client_shares");
  db.exec("CREATE INDEX idx_post_client_shares_tokenHash ON post_client_shares(tokenHash)");
  db.exec("CREATE INDEX idx_post_client_shares_post ON post_client_shares(postId)");
  db.exec("CREATE INDEX idx_post_client_shares_tenant ON post_client_shares(tenantId)");
}

function migrateShareSets(db: SqliteDatabase): void {
  if (!tableExists(db, "share_sets")) return;
  const columns = columnsFor(db, "share_sets");
  if (columns.has("tokenHash")) {
    const legacy = db.prepare("SELECT id, token FROM share_sets WHERE tokenHash IS NULL AND token IS NOT NULL").all() as { id: string; token: string }[];
    const update = db.prepare("UPDATE share_sets SET tokenHash = ?, token = NULL WHERE id = ?");
    for (const row of legacy) update.run(hashShareToken(row.token), row.id);
    return;
  }
  db.exec(`
    CREATE TABLE share_sets_hashed (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      name TEXT,
      token TEXT,
      tokenHash TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      expiresAt TEXT,
      revoked INTEGER DEFAULT 0
    );
  `);
  const rows = db.prepare("SELECT id, tenantId, name, token, createdAt, expiresAt, revoked FROM share_sets").all() as any[];
  const insert = db.prepare("INSERT INTO share_sets_hashed (id, tenantId, name, token, tokenHash, createdAt, expiresAt, revoked) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)");
  for (const row of rows) {
    const rawToken = String(row.token || "");
    if (!rawToken) throw new Error("Legacy share-set token is missing");
    insert.run(row.id, row.tenantId, row.name, hashShareToken(rawToken), row.createdAt, row.expiresAt, row.revoked);
  }
  db.exec("DROP TABLE share_sets");
  db.exec("ALTER TABLE share_sets_hashed RENAME TO share_sets");
  db.exec("CREATE INDEX idx_share_sets_tokenHash ON share_sets(tokenHash)");
  db.exec("CREATE INDEX idx_share_sets_tenant ON share_sets(tenantId)");
}

export function ensureShareTokenStorage(db: SqliteDatabase): boolean {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL)`);
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(SHARE_TOKEN_MIGRATION_VERSION);
  if (applied) return false;
  const migrate = db.transaction(() => {
    migratePostShares(db);
    migrateShareSets(db);
    db.prepare("INSERT OR REPLACE INTO schema_migrations (version, appliedAt) VALUES (?, ?)").run(SHARE_TOKEN_MIGRATION_VERSION, new Date().toISOString());
  });
  migrate();
  return true;
}
