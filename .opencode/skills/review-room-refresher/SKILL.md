---
name: review-room-refresher
description: Use when refreshing, mapping, maintaining, deploying, or syncing the Osiris Review Room project; trigger on Review Room, review-room, client-review, production deploy, GitHub sync, architecture map, or stale handoff.
---

# Review Room Refresher

Rebuild an accurate project map before changing Review Room, then carry the change through verification, deployment, and repository sync. Handoff notes and this skill are context, not truth: verify against the live checkout, the canonical repository, and the running container before acting.

Detail lives in two companions:

- `references/runbook.md` — copy-pasteable command sequences for refresh, gates, deploy, verify, rollback.
- `references/known-traps.md` — the failures that have actually cost time, with detection and fixes.

## Source-of-truth order

1. Canonical GitHub repository and fetched `origin/main`.
2. Live production checkout on the host.
3. Running container, image, health endpoint, recent logs.
4. Local working copy as a *candidate* only; never deploy it blind.
5. Reconcile contradictions out loud and record the resolved state in the report.

If two sources disagree, the runtime wins for behavior, the repository wins for intent.

## Two classes of knowledge

**Stable invariants** — treat as architecture, not as trivia. Re-confirm only if something breaks:

- Canonical repository `theosirislabs/review-room`, branch `main`.
- Compose service `review-room` produces container `review-room-app` from image `osiris-review-room:latest`.
- Production checkout `/root/review-room-project`; data is a bind mount `./data:/app/data` (SQLite `data/osiris.db` + `data/uploads`), so it survives image swaps and is never in Git.
- Backups live under `/root/osiris/osiris_backups`.
- Theme architecture: agency shell is `.rr-agency` driven by `data-theme`; the client surface is `.rr-client` driven by `data-client-theme`, and the client surface renders *inside* the agency shell during staff preview.

**Environment values** — re-verify, never trust from memory:

- Host, local checkout path, dev/preview port, image tags, deployed digests. Discover them with the discovery block in `references/runbook.md` and echo the resolved values in your report.

## Architecture map

- `src/App.tsx`: route extraction, auth bootstrap, token consumption, lazy surface selection, client preview routing, realtime connection flag.
- `src/components/DashboardView.tsx`: agency-wide client cards, access-link actions, client profile entry point, staff navigation.
- `src/components/InternalView.tsx`: agency rail/nav, workflow board, post detail, share-set actions, internal/client preview controls, embeds `CalendarView`.
- `src/components/CalendarView.tsx`: month grid, agenda, filters, schedule health, responsive dated-item list.
- `src/components/ClientView.tsx`: client-facing profile grid, post viewer, reviewer decisions, feedback, named-reviewer display, client theme toggle.
- `src/components/ShareClientLinkModal.tsx`: named client-link creation and per-browser reviewer remembering.
- `src/reviewerProfile.ts`: reviewer-name normalization, local preference keys, URL-fragment helpers.
- `src/clientPostShare.ts` and `src/shareSet.ts`: one-post and multi-post share-link APIs plus clipboard handling.
- `src/components/TenantManagerModal.tsx`: client profile create/edit UI.
- `server.ts`: Express REST, Socket.IO events, authentication, tenant/share APIs, media, SQLite access.
- `src/types.ts`, `src/utils.ts`: shared contracts, client-safe transformations, aspect-ratio helpers.
- `src/mediaUpload.ts`, `src/staticDelivery.ts`, `src/mcp/`, and `scripts/`: media, delivery, MCP, and verification surfaces.
- `Dockerfile`, `docker-compose.yml`, `.dockerignore`: runtime packaging and build-context boundaries.

Important route families:

- `/client/:tenantId?token=...`: stable client workspace link.
- `/review/:token`: single-post share.
- `/review/set/:token`: multi-post share set.
- `/agency/:tenantId`: internal workspace.
- `?preview=client`: staff-only client preview.

Reviewer names belong in the URL fragment (`#reviewer=...`) and local browser preference storage. Fragments never reach the server. Do not add reviewer PII to the tenant schema unless a product decision explicitly requires durable server-side attribution.

## Workflow

1. **Refresh** — run the read-only discovery block. Record the production commit, divergence, image, and health.
2. **Implement locally** — narrow diffs; keep frontend UX, server behavior, and security-token changes separable. Read neighbouring code before writing.
3. **Gates** — in the local checkout, with dependencies installed:
   - `npm run lint`
   - `npm test -- --no-cache`
   - `npm run build`
   - `npm run test:bundles` when present
   - `git diff --check`
4. **Visual pass** — verify the surfaces the change touches at mobile and desktop widths, in every theme the change affects. Client surfaces are auth/token gated in production, so do visual verification on the local build (see `known-traps.md`).
5. **Commit and push** — fetch first, stage only source/tests/config, never secrets or data. Fast-forward only; no force-push, no branch reset.
6. **Deploy** — follow the runbook exactly: backup, rollback tag, production-derived build, `docker compose up -d review-room`, then the verification battery. Never swap the runtime before the image builds.
7. **Prove it shipped** — compare served asset filenames with the image's `dist`, and grep the built assets for a marker string unique to the change.
8. **Rollback if verification fails** — retag the rollback image to `latest`, `docker compose up -d review-room`, re-verify, then read logs before retrying.
9. **Report** in the format below.

## Non-negotiables

- Never print tokens, passwords, cookies, or environment values; report presence, length, or equality only.
- Never copy or tar the whole `data/` tree to back up a code deploy; it is ~15G of uploads. Back up source and SQLite only.
- Never `docker compose down -v`, delete `data/`, or run `git reset --hard` on the production checkout.
- Never fetch a share token to make a test pass; use the local build for gated surfaces.
- Never leave a deploy half-finished: backup, rollback tag, and verification results are part of "done".

## Refresh report format

- Verified source commit and branch divergence (local, production, `origin/main`).
- Files and product behavior changed.
- Gate results, plus any pre-existing failures you did not introduce.
- Backup path and rollback tag.
- Deployed image digest, container status, health, restart count.
- Public route checks and mutation-safety probe results.
- Proof the change is in the served bundle.
- GitHub commit and push result.
- Follow-up risks, especially raw share-token security, server-side decision attribution, and leftover containers or stale images.

## Keeping this skill honest

When a change alters an anchor, route family, service name, theme attribute, or deploy step, update this skill and `references/` in the same change. If a command here fails, fix the skill first, then retry the operation.
