import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { ensureShareTokenStorage, hashShareToken } from "./shareTokens.js";

describe("share token storage", () => {
  let db: Database.Database;

  afterEach(() => db.close());

  it("hashes and clears legacy review-link tokens", () => {
    db = new Database(":memory:");
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
      CREATE TABLE share_sets (
        id TEXT PRIMARY KEY,
        tenantId TEXT NOT NULL,
        name TEXT,
        token TEXT NOT NULL UNIQUE,
        createdAt TEXT NOT NULL,
        expiresAt TEXT,
        revoked INTEGER DEFAULT 0
      );
      INSERT INTO post_client_shares VALUES ('post-share', 'tenant-a', 'post-a', 'raw-post-token', '2026-01-01', NULL, 0);
      INSERT INTO share_sets VALUES ('share-set', 'tenant-a', 'Set', 'raw-set-token', '2026-01-01', NULL, 0);
    `);

    expect(ensureShareTokenStorage(db)).toBe(true);
    expect(ensureShareTokenStorage(db)).toBe(false);

    const postShare = db.prepare("SELECT token, tokenHash FROM post_client_shares WHERE id = ?").get("post-share") as { token: string | null; tokenHash: string };
    const shareSet = db.prepare("SELECT token, tokenHash FROM share_sets WHERE id = ?").get("share-set") as { token: string | null; tokenHash: string };
    expect(postShare.token).toBeNull();
    expect(shareSet.token).toBeNull();
    expect(postShare.tokenHash).toBe(hashShareToken("raw-post-token"));
    expect(shareSet.tokenHash).toBe(hashShareToken("raw-set-token"));
  });
});
