# Runbook

Copy-paste sequences. Every block is safe to re-run. Replace `TS` and `SHA` as noted; never hardcode a timestamp or digest from memory.

## 0. Environment variables used below

```sh
HOST=root@<host>            # discover: see block 1
PROD=/root/review-room-project
REPO=https://github.com/theosirislabs/review-room.git
SVC=review-room             # compose service (container is review-room-app)
IMG=osiris-review-room
BACKUPS=/root/osiris/osiris_backups
URL=https://review-room.theosirislabs.com
```

## 1. Discovery (read-only, run first)

```sh
git -C "$PROD" status --short
git -C "$PROD" remote -v
git -C "$PROD" fetch origin main
git -C "$PROD" log --oneline --left-right main...origin/main
git -C "$PROD" log --oneline -3
ssh "$HOST" 'docker ps --format "{{.Names}}\t{{.Image}}\t{{.Status}}" | grep review-room'
ssh "$HOST" 'docker inspect review-room-app --format "{{.Image}} {{.State.Status}} {{.State.Health.Status}} {{.RestartCount}}"'
ssh "$HOST" 'docker inspect review-room-app --format "{{range .Mounts}}{{.Source}} -> {{.Destination}}{{end}}"'
curl -fsS "$URL/api/health"
```

Resolve the host and local checkout instead of trusting notes:

```sh
grep -m1 -o 'Host(`[^`]*`)' <<<"$(ssh "$HOST" 'cat /root/review-room-project/docker-compose.yml')"
ls -d ~/*review-room* ~/**/review-room 2>/dev/null
ssh "$HOST" 'cd /root/review-room-project && sed -n "1,25p" docker-compose.yml'   # service, image, volume, healthcheck
```

Contract to expect in that compose file: service `review-room`, `container_name: review-room-app`, image `osiris-review-room:latest`, volume `./data:/app/data`, healthcheck against `http://127.0.0.1:3000/api/health`, `restart: always`, traefik router on the live hostname.

If `git status --short` on production is non-empty, stop and reconcile: production-only edits must be preserved, not overwritten by a pull.

## 2. Local gates

```sh
cd <local-checkout>
git fetch origin main
git log --oneline --left-right main...origin/main   # must be empty before staging
npm run lint
npm test -- --no-cache
npm run build
npm run test:bundles        # when the script exists
git diff --check
```

## 3. Local visual verification

```sh
npm run dev -- --port 3100    # or the project's documented dev port
```

Check the touched surface at mobile (~390x844) and desktop (~1280x900). Toggle every theme the change affects and check persisted theme values in `localStorage`. Assert geometry numerically when a change is about ratios:

```js
(() => { const t = document.querySelector('.rr-client [class*="aspect-[3/4]"]'); const r = t.getBoundingClientRect(); return r.height / r.width; })()
```

## 4. Commit and push

```sh
git add <explicit paths>          # never `git add -A` in this repo
git status --short                # confirm no data/.env/uploads staged
git diff --cached
git commit -F - <<'MSG'
<imperative subject>

<why, not a file list>
MSG
git push origin main              # fast-forward only
SHA=$(git rev-parse --short HEAD)
```

## 5. Backup and rollback tag (before any live change)

```sh
ssh "$HOST" "set -e
TS=\$(date -u +%Y%m%dT%H%M%SZ)
D=$BACKUPS/review-room-\$TS
mkdir -p \$D
docker tag $IMG:latest $IMG:rollback-\$TS
cd $PROD
git bundle create \$D/source.bundle --all
sqlite3 data/osiris.db \".backup '\$D/osiris.db'\"
echo BACKUP=\$D
echo ROLLBACK=$IMG:rollback-\$TS"
```

Do not tar `data/` — it is roughly 15G of uploads and the copy is not needed for a code deploy. Add a media backup only when the change touches upload/storage code, and say so in the report.

## 6. Build and swap

```sh
ssh "$HOST" "set -e
cd $PROD
git pull --ff-only origin main
git log --oneline -1
git status --short | head
docker build -t $IMG:latest .
docker tag $IMG:latest $IMG:\$(git rev-parse --short HEAD)
docker compose up -d $SVC
sleep 15
docker inspect review-room-app --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}} {{.RestartCount}}'
docker logs --since 3m review-room-app 2>&1 | tail -15
docker logs --since 3m review-room-app 2>&1 | grep -ciE 'error|exception|fatal' || true"
```

The runtime is only replaced after the build succeeds. The container name stays `review-room-app`; the compose service you invoke is `review-room`.

## 7. Verification battery

```sh
curl -fsS -o /dev/null -w "health=%{http_code}\n" "$URL/api/health"
curl -fsS -o /dev/null -w "home=%{http_code}\n" "$URL/"
curl -fsS -o /dev/null -w "client=%{http_code}\n" "$URL/client/<tenant>"
```

Mutation-safety probes (expect 401/403, never 2xx). Pick routes that exist; a 404 means the path was wrong, not that auth worked.

```sh
for req in "POST /api/upload" "POST /api/import-url" "DELETE /api/posts/probe-id" "POST /api/tenants/<tenant>/rotate-token" "PATCH /api/users/probe"; do
  m=${req%% *}; p=${req#* }
  printf '%s %s -> %s\n' "$m" "$p" "$(curl -s -o /dev/null -w '%{http_code}' -X "$m" "$URL$p" -H 'Content-Type: application/json' -d '{}')"
done
```

Prove the change is in the served bundle:

```sh
curl -fsS "$URL/" | grep -o 'assets/[^"]*' | sort -u
ssh "$HOST" "docker exec review-room-app sh -lc 'ls /app/dist/assets/*.css /app/dist/assets/*.js | head'"

# marker string unique to the change, e.g.:
ssh "$HOST" 'docker exec review-room-app sh -lc "grep -rl \"Jump to earliest dated item\" /app/dist/assets | head -3"'
```

Minified CSS drops quotes around attribute values, so match both forms:

```sh
grep -o 'data-client-theme=light\]' /app/dist/assets/index-*.css | wc -l
grep -o 'data-client-theme="light"\]' /app/dist/assets/index-*.css | wc -l
```

Also check media Range behavior and the Socket.IO path if the change touches delivery or realtime.

## 8. Rollback

```sh
ssh "$HOST" "set -e
cd $PROD
docker tag $IMG:rollback-<TS> $IMG:latest
docker compose up -d $SVC
sleep 15
docker inspect review-room-app --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}} {{.RestartCount}}'
docker logs --since 3m review-room-app 2>&1 | tail -20"
curl -fsS -o /dev/null -w "health=%{http_code}\n" "$URL/api/health"
```

Read logs before retrying a failed deploy; do not rebuild on top of an unexplained failure.

## 9. Housekeeping

```sh
ssh "$HOST" 'docker ps -a --format "{{.Names}}\t{{.Status}}" | grep -vE "^(CONTAINER|review-room-app)"'
ssh "$HOST" "docker images $IMG --format '{{.Repository}}:{{.Tag}}\t{{.CreatedSince}}'"
```

Remove abandoned preflight/scratch containers and prune old `:rollback-*` tags only after confirming the newest tag covers the live digest.
