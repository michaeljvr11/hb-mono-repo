---
name: run-project
description: >
  Start and verify the HB monorepo locally so it's ready for manual testing.
  Use this skill whenever the user says "get the project running", "start the
  app", "spin up the servers", "I want to test", "can you run the project",
  or anything implying they want a live local environment. It checks Postgres
  (Docker), Meilisearch (Docker), the NestJS API (port 3000), and the Angular
  web app (port 4200), starting whichever pieces aren't already running, then
  gives a clear status report including whether Google OAuth is correctly
  configured.
---

# run-project

Get the HB monorepo running locally for testing. The stack has four pieces:
Postgres (Docker), Meilisearch (Docker), the NestJS API on port 3000, and the
Angular web app on port 4200. Check each one in order — skip anything that's
already up. Meilisearch must come up before the API: `SearchHealthService`
throws and refuses to boot the API in dev if Meilisearch isn't reachable at
startup (see `apps/api/src/search/search-health.service.ts`).

All commands run from the **repo root** (`C:\Users\michael.jvanrensburg\vscode\hb-mono-repo`).

---

## Step 1 — Postgres

```bash
docker compose ps db 2>/dev/null | grep -q "healthy\|running" \
  && echo "DB already up" \
  || npm run db:up
```

Wait up to 15 s for the `healthy` status if it was just started:

```bash
for i in $(seq 1 15); do
  docker compose ps db | grep -q healthy && break
  sleep 1
done
docker compose ps db | grep healthy && echo "DB ready" || echo "DB may still be starting"
```

---

## Step 2 — Meilisearch

`MEILI_MASTER_KEY` has no default anywhere on purpose (compose and the API both fail
loud without it) — see `apps/api/.env.example`. **Never `cat`/`grep` `apps/api/.env` or
any other `.env` file to check or export its contents; that's a project non-negotiable.**
docker-compose already reads a root-level `.env` (or the shell environment) on its own —
just try to start the service and let compose's own error message (which never prints
the key itself) surface a missing var:

```bash
docker compose ps meilisearch 2>/dev/null | grep -q "healthy\|running" \
  && echo "Meilisearch already up" \
  || npm run search:up
```

- Fails with `MEILI_MASTER_KEY is required` → tell the user to set `MEILI_MASTER_KEY`
  (any non-empty string works for local dev, e.g. `openssl rand -hex 16`) in a root-level
  `.env` file (docker-compose reads that, not `apps/api/.env`) **and** in `apps/api/.env`
  with the *same* value (the Nest app needs to authenticate with the key it starts).
  Point them at `apps/api/.env.example` for the expected format, then stop — don't try to
  set it yourself, and don't read either file to verify.
- Succeeds → continue.

Wait up to 15 s for `healthy`:

```bash
for i in $(seq 1 15); do
  docker compose ps meilisearch | grep -q healthy && break
  sleep 1
done
docker compose ps meilisearch | grep healthy && echo "Meilisearch ready" || echo "Meilisearch may still be starting"
```

---

## Step 3 — API (port 3000)

Check if the port is already listening:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/test
```

- `401` → already running and healthy (auth guard is active — that's correct)
- `000` or connection refused → not running, start it:

```bash
nohup npm run dev:api > /tmp/hb-api.log 2>&1 &
echo "API PID: $!"
```

The API build (`shared` → `api`) takes ~15–30 s. Poll until healthy:

```bash
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/test 2>/dev/null)
  [ "$code" = "401" ] && echo "API ready (${i}s)" && break
  sleep 1
done
[ "$code" != "401" ] && echo "API did not start in time — check /tmp/hb-api.log"
```

If it never reaches `401`, check whether it actually crashed rather than being slow —
a healthy Meilisearch *container* doesn't guarantee the API has `MEILI_HOST` /
`MEILI_MASTER_KEY` configured; that's a separate, app-level env check that fails before
the app even finishes booting:

```bash
grep -q "MEILI_HOST is not set\|MEILI_MASTER_KEY is not set\|Meilisearch is unreachable" /tmp/hb-api.log \
  && echo "API crashed on the Meilisearch config/health check — see /tmp/hb-api.log" \
  || tail -n 20 /tmp/hb-api.log
```

If it's the config error: tell the user to add `MEILI_HOST` and `MEILI_MASTER_KEY` to
`apps/api/.env`, matching `apps/api/.env.example` and using the *same* master key value
they set for the compose service in Step 2. **Do not read or edit `apps/api/.env`
yourself** — the log line names only the missing variable, never its value, so relaying
it to the user doesn't require opening the file.

---

## Step 4 — Web app (port 4200)

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4200/
```

- `2xx` or `3xx` → already running
- `000` or connection refused → start it:

```bash
nohup npm run dev:web > /tmp/hb-web.log 2>&1 &
echo "Web PID: $!"
```

Angular's initial compile takes ~15–30 s. Poll until responsive:

```bash
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4200/ 2>/dev/null)
  [[ "$code" =~ ^[23] ]] && echo "Web ready (${i}s)" && break
  sleep 1
done
[[ ! "$code" =~ ^[23] ]] && echo "Web did not start — check /tmp/hb-web.log"
```

---

## Step 5 — Google OAuth check

```bash
redirect=$(curl -s -o /dev/null -w "%{redirect_url}" http://localhost:3000/api/auth/google)
echo "$redirect" | grep -q "google-client-id-not-set" \
  && echo "⚠ Google creds NOT set — /auth/google will not complete real sign-in" \
  || echo "✓ Google OAuth credentials look configured"
```

---

## Step 6 — Report

Print a clear summary:

```
=== HB monorepo status ===
Postgres:     ✓ healthy
Meilisearch:  ✓ healthy
API:          ✓ http://localhost:3000  (NestJS / auth guard active)
Web:          ✓ http://localhost:4200  (Angular dev server)
Google:       ✓ OAuth credentials set   (or ⚠ with instructions)

Logs:  /tmp/hb-api.log  /tmp/hb-web.log
```

If Google OAuth is not configured, add:

```
To enable Google sign-in:
  1. Create OAuth 2.0 credentials at https://console.cloud.google.com/
  2. Add authorised redirect URI: http://localhost:3000/api/auth/google/callback
  3. Set in apps/api/.env:
       GOOGLE_CLIENT_ID=<your-client-id>
       GOOGLE_CLIENT_SECRET=<your-secret>
       GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
  4. Restart the API (kill the process then re-run Step 2)
```

---

## Error handling

- **Port already in use when starting a server** — something else grabbed the port. Check with `netstat -ano | findstr :<port>` and kill the conflicting process, or note the conflict to the user.
- **Docker not running** — `docker compose` will fail. Tell the user to start Docker Desktop first.
- **API build fails** — tail `/tmp/hb-api.log` and show the relevant error lines to the user.
- **DB not healthy after 15 s** — the container may be starting; proceed and let the API try to connect. Show the db logs with `docker compose logs db --tail=20`.
- **`npm run search:up` fails with a `MEILI_MASTER_KEY is required` error** — no root-level `.env` (or shell env) has the var set for `docker compose` itself. Tell the user to set it in a root `.env` file; don't set it for them and don't read `apps/api/.env` to source it.
- **API crashes at boot with "MEILI_HOST is not set" / "MEILI_MASTER_KEY is not set"** — the *app-level* config (`apps/api/.env`) is missing these, independent of whether the container is healthy. See the note under Step 3. Never read or edit `apps/api/.env` — direct the user to `apps/api/.env.example`.
- **API fails to boot with "Meilisearch is unreachable at boot"** — `SearchHealthService` intentionally throws in dev when Meilisearch isn't reachable (see `apps/api/src/search/search-health.service.ts`). Confirm Step 2 actually reached `healthy` before starting the API; check `docker compose logs meilisearch --tail=20`.
