# Review Room media pipeline — diagnosis, fix, verification (2026-09-22)

## Symptom

Agency and client portals showed empty video tiles, missing covers, and some videos
that never played. Carousels had no preview beyond the first slide.

## What was actually wrong (evidence)

| Finding | Evidence | Impact |
|---|---|---|
| Only **38 / 330** posts had `thumbnailUrl` | `SELECT count(*) FROM posts WHERE thumbnailUrl IS NOT NULL` on production DB | Video tiles render `<video preload="none">` with no poster → empty box until hover; grid looks broken |
| **46 / 324** MP4s had `moov` **after** `mdat` (no faststart) | top-level atom scan of `data/uploads` | Browser must download the entire file (up to 193 MB) before it can start; appears as "video never loads" |
| **8** MP4s were truncated uploads with **no `moov` at all** | `ffprobe` fails, atoms end at `mdat` | Permanently unplayable. 0 posts referenced them (orphans) |
| Media **serving** was fine | `curl -I` and `Range:` requests → `200 video/mp4`, `accept-ranges: bytes`, `206` partial | Range/CORS was *not* the root cause; `express.static` already supports ranges |
| Carousels show only `mediaUrls[0]` | `ClientView` tile code | Without a cover for a video-first carousel, the whole tile is blank |

## Fixes applied

### Data (production, 2026-09-22)

- **Posters**: generated `thumb-<stem>.jpg` (720px, `ffmpeg -ss 1`) for the **101** video
  posts missing a cover and linked them via `posts.thumbnailUrl` → 139 posts now have covers.
  DB backed up to `data/osiris.db.bak-thumb-<ts>` first. Verified over HTTP and in a browser
  (8/8 covers loaded, no bare `<video>` tiles left on the client board).
- **Faststart**: remuxed **37** MP4s in place (`-c copy -movflags +faststart`), each verified
  with `ffprobe` (duration match) before the swap. Originals kept in
  `data/uploads_backup_slowstart/`. The remaining 9 flagged files were the 8 truncated
  uploads (unfixable) plus one already-fragmented file.
- Scripts: `scripts/media-backfill-thumbnails.py`, `scripts/media-remux-faststart.py`
  (both idempotent, `--dry-run` supported).

### Code (this candidate)

- `server.ts`: background media queue (concurrency 1) that runs after `/api/upload` and
  `/api/upload-complete`:
  - `probeVideoDuration()` — flags uploads with no index/`moov` instead of silently serving them;
  - `ensureFaststart()` — atom-order check + in-place remux for `.mp4`;
  - `generateVideoPoster()` — poster frame at the deterministic path `/uploads/thumb-<stem>.jpg`;
  - `linkPosterToPosts()` — attaches a fresh poster to any post already referencing that video.
  All of it is non-blocking: the upload response is sent first, work continues in the queue.
- `Dockerfile`: `apk add --no-cache ffmpeg` in the runner stage (ffmpeg/ffprobe were missing in
  the container, so processing is skipped when the binary is absent).
- `MediaUploadZone.tsx`: adopts the deterministic poster path as the cover when a video upload
  finishes and no cover was chosen — new video posts and video-first carousels get a preview
  immediately.

## Verification gates (local)

| Gate | Result |
|---|---|
| `npm run lint` (`tsc --noEmit`) | pass |
| `npm test` | 7 files / 25 tests pass |
| `npm run build` | pass |
| `npm run test:bundles` | `agency_bundle_gate=ok internal_bytes=85703` |
| End-to-end upload test (local server, real non-faststart MP4) | atoms `ftyp,free,mdat,moov` → `ftyp,moov,free,mdat`; poster generated |
| Corrupt upload test (truncated MP4) | detected + logged `[MEDIA] unplayable upload kept for review`, no crash |

## Deployment note

Deployed **2026-09-22 15:03 CEST**: pre-upgrade full backup
(`/root/osiris/osiris_backups/review_room_full_20260922_144743.tar.gz`, 13.7 GB, 1471 entries
verified), rollback image tagged `osiris-review-room:rollback`, new image built with ffmpeg,
container recreated and healthy. Live checks: internal + public `/api/health` OK, `Range:`
request → `206` with `accept-ranges` + `access-control-allow-origin`, a real upload through the
public API came back remuxed (`ftyp,moov,free,mdat`) with a poster on disk, and the client
portal renders 8/8 covers with 0 bare video tiles.

The production source diverges from this workspace (seed data), so `server.ts` was patched in
place rather than copied — see `MEDIA-PIPELINE.md` history and the `review-room-media-pipeline`
skill for the exact procedure.
