---
name: review-room-refresher
description: Use when refreshing, mapping, maintaining, deploying, or syncing the Osiris Review Room project; trigger on Review Room, review-room, client-review, production deploy, GitHub sync, architecture map, or stale handoff.
---

# Review Room Refresher

Use this skill to rebuild an accurate project map before changing Review Room, then carry the change through verification, deployment, and repository sync. Treat handoff notes as historical context, not as the source of truth.

## Source-of-truth order

1. Inspect the live checkout and runtime before relying on notes.
2. Inspect the canonical GitHub repository and fetched `origin/main` before committing or pushing.
3. Inspect the running container, image, health endpoint, and recent logs.
4. Use local working copies only as candidate implementations; never deploy one blindly.
5. Reconcile contradictions explicitly and record the resolved state.

## Known project anchors

- Canonical repository: `theosirislabs/review-room`, branch `main`.
- Production checkout: `/root/review-room-project`.
- Live URL: `https://review-room.theosirislabs.com`.
- Runtime container: `review-room-app`.
- Backups: `/root/osiris/osiris_backups`.
- The local candidate path is environment-specific; discover it before using it.
- Production data and uploads are runtime state and are ignored by Git.

## Refresh checklist

Run read-only checks first:

```sh
git -C /root/review-room-project status --short
git -C /root/review-room-project remote -v
git -C /root/review-room-project fetch origin main
git -C /root/review-room-project log --oneline --left-right main...origin/main
git -C /root/review-room-project diff --stat
ssh root@161.97.81.21 'docker ps --format "{{.Names}}\t{{.Image}}\t{{.Status}}" | grep review-room'
ssh root@161.97.81.21 'docker inspect review-room-app --format "{{.Image}} {{.State.Status}} {{.State.Health.Status}} {{.RestartCount}}"'
curl -fsS https://review-room.theosirislabs.com/api/health
```

Do not print tokens, passwords, cookies, or environment values. Report only token presence, lengths, hashes, or equality.

## Architecture map

- `src/App.tsx`: route extraction, auth bootstrap, token consumption, lazy surface selection, and client preview routing.
- `src/components/DashboardView.tsx`: agency-wide client cards, access-link actions, client profile entry point, and staff navigation.
- `src/components/InternalView.tsx`: agency workflow board, post detail, share-set actions, and internal/client preview controls.
- `src/components/ClientView.tsx`: client-facing grid/schedule, reviewer decisions, feedback, and named-reviewer display.
- `src/components/ShareClientLinkModal.tsx`: named client-link creation and per-browser reviewer remembering.
- `src/reviewerProfile.ts`: reviewer-name normalization, local preference keys, and URL-fragment helpers.
- `src/clientPostShare.ts` and `src/shareSet.ts`: one-post and multi-post share-link APIs plus clipboard handling.
- `src/components/TenantManagerModal.tsx`: client profile create/edit UI.
- `server.ts`: Express REST, Socket.IO events, authentication, tenant/share APIs, media, and SQLite access.
- `src/types.ts`, `src/utils.ts`: shared contracts and client-safe transformations.
- `src/mediaUpload.ts`, `src/staticDelivery.ts`, `src/mcp/`, and `scripts/`: supporting media, delivery, MCP, and verification surfaces.
- `Dockerfile`, `docker-compose.yml`, `.dockerignore`: runtime packaging and build-context boundaries.

Important route families:

- `/client/:tenantId?token=...`: stable client workspace link.
- `/review/:token`: single-post share.
- `/review/set/:token`: multi-post share set.
- `/agency/:tenantId`: internal workspace.
- `?preview=client`: staff-only client preview.

Reviewer names belong in the URL fragment (`#reviewer=...`) and local browser preference storage. Fragments are not sent to the server. Do not add reviewer PII to the tenant schema unless a later product decision explicitly requires durable server-side attribution.

## Safe implementation and deployment

1. Read the relevant files and inspect the current diff before editing.
2. Keep changes narrow; separate frontend UX, server behavior, and security-token changes.
3. Run the project gates from a clean, dependency-complete workspace:
   - `npm test -- --no-cache`
   - `npm run lint`
   - `npm run build`
   - `npm run test:bundles` when that script exists.
4. If the production host has production-only dependencies or known unrelated type errors, use a disposable copy with dependencies installed and record the limitation; do not “fix” unrelated MCP errors as part of a feature.
5. Before a live change, create a source/data backup and tag the current image as a rollback image.
6. Build a Docker image from the production-derived source, not from an unrelated local candidate.
7. Replace the runtime only after the image build succeeds; verify container health, `/api/health`, public routes, media Range behavior, and read-only behavior.
8. For client mutations, verify that preview/read-only checks make zero write requests.
9. If verification fails, restore the tagged image and inspect logs before retrying.

## GitHub synchronization

1. Fetch `origin/main` and inspect `main...origin/main` before staging.
2. Preserve intentional live application changes and preserve remote documentation/security files unless the product decision explicitly removes them.
3. Stage only source, tests, configuration, and intentional project skills; never stage `.env`, databases, uploads, logs, or credentials.
4. Review `git diff`, `git diff --check`, status, and recent history before committing.
5. Use a normal merge or fast-forward push. Never force-push, reset a shared branch, or discard remote-only commits.
6. After pushing, record the pushed commit, deployed image digest, rollback tag, and verification results.

## Refresh report format

At the end of a refresh, report:

- Verified source commit and branch divergence.
- Files and product behavior changed.
- Tests/build/typecheck results and any pre-existing failures.
- Backup and rollback tag.
- Deployed image digest and container health.
- Public and mutation-safety checks.
- GitHub commit/push result.
- Follow-up risks, especially raw share-token security and server-side decision attribution.
