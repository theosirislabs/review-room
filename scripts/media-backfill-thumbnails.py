#!/usr/bin/env python3
"""Backfill video poster thumbnails for Review Room posts.

Additive + reversible: writes new /uploads/thumb-*.jpg files and sets
posts.thumbnailUrl only where it is currently empty.
Usage: python3 backfill_video_thumbs.py [--dry-run] [--tenant X]
"""
import argparse, json, os, shutil, sqlite3, subprocess, sys, time

ROOT = "/root/review-room-project"
DB = os.path.join(ROOT, "data/osiris.db")
UP = os.path.join(ROOT, "data/uploads")
VIDEO_EXT = (".mp4", ".mov", ".webm", ".avi", ".m4v", ".mkv")

ap = argparse.ArgumentParser()
ap.add_argument("--dry-run", action="store_true")
ap.add_argument("--tenant")
args = ap.parse_args()

def is_video(u: str) -> bool:
    u = (u or "").lower()
    return any(e in u for e in VIDEO_EXT)

con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
q = "SELECT id, tenantId, title, format, mediaUrls, thumbnailUrl FROM posts"
params = ()
if args.tenant:
    q += " WHERE tenantId = ?"
    params = (args.tenant,)
rows = con.execute(q, params).fetchall()

candidates = []
for r in rows:
    if r["thumbnailUrl"]:
        continue
    try:
        urls = json.loads(r["mediaUrls"] or "[]")
    except Exception:
        urls = []
    if not isinstance(urls, list) or not urls:
        continue
    first = urls[0] if isinstance(urls[0], str) else None
    if not first:
        continue
    video_like = is_video(first) or (r["format"] in ("reel", "story") and is_video(first))
    if not video_like:
        continue
    candidates.append((r["id"], r["tenantId"], first, r["format"], (r["title"] or "")[:40]))

print(f"video posts missing thumbnailUrl: {len(candidates)}")
for c in candidates[:8]:
    print("   ", c[1], c[0][:8], c[2][-40:], c[3])

if args.dry_run or not candidates:
    sys.exit(0)

# DB backup before touching anything
ts = time.strftime("%Y%m%d_%H%M%S")
bak = f"{DB}.bak-thumb-{ts}"
shutil.copy2(DB, bak)
print("DB backup:", bak)

made = 0
failed = []
for pid, tenant, url, fmt, title in candidates:
    src = os.path.join(UP, url.replace("/uploads/", ""))
    if not os.path.isfile(src):
        failed.append((pid, url, "source missing"))
        continue
    stem = os.path.splitext(os.path.basename(src))[0]
    out_name = f"thumb-{stem}.jpg"
    out_path = os.path.join(UP, out_name)
    if not os.path.isfile(out_path):
        ok = False
        for ss in ("1", "0"):
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-ss", ss, "-i", src,
                   "-frames:v", "1", "-vf", "scale='min(720,iw)':-2", "-q:v", "4", out_path]
            try:
                subprocess.run(cmd, check=True, timeout=120, capture_output=True)
                ok = os.path.isfile(out_path) and os.path.getsize(out_path) > 1000
            except Exception as e:
                ok = False
            if ok:
                break
        if not ok:
            failed.append((pid, url, "ffmpeg failed"))
            continue
    con.execute("UPDATE posts SET thumbnailUrl = ? WHERE id = ? AND (thumbnailUrl IS NULL OR thumbnailUrl = '')",
                (f"/uploads/{out_name}", pid))
    made += 1

con.commit()
print(f"thumbnails generated + linked: {made}")
print(f"failures: {len(failed)}")
for f in failed[:10]:
    print("   FAIL", f)
