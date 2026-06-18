---
name: run-project
description: >
  Start and verify the HB monorepo locally so it's ready for manual testing.
  Use this skill whenever the user says "get the project running", "start the
  app", "spin up the servers", "I want to test", "can you run the project",
  or anything implying they want a live local environment. It checks Postgres
  (Docker), the NestJS API (port 3000), and the Angular web app (port 4200),
  starting whichever pieces aren't already running, then gives a clear status
  report including whether Google OAuth is correctly configured.
---

# run-project

Get the HB monorepo running locally for testing. The stack has three pieces:
Postgres (Docker), the NestJS API on port 3000, and the Angular web app on
port 4200. Check each one in order — skip anything that's already up.

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

## Step 2 — API (port 3000)

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

---

## Step 3 — Web app (port 4200)

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

## Step 4 — Google OAuth check

```bash
redirect=$(curl -s -o /dev/null -w "%{redirect_url}" http://localhost:3000/api/auth/google)
echo "$redirect" | grep -q "google-client-id-not-set" \
  && echo "⚠ Google creds NOT set — /auth/google will not complete real sign-in" \
  || echo "✓ Google OAuth credentials look configured"
```

---

## Step 5 — Report

Print a clear summary:

```
=== HB monorepo status ===
Postgres:  ✓ healthy
API:       ✓ http://localhost:3000  (NestJS / auth guard active)
Web:       ✓ http://localhost:4200  (Angular dev server)
Google:    ✓ OAuth credentials set   (or ⚠ with instructions)

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
