# Webhook Ingestion & Transformation Pipeline

A NestJS service that receives GitHub webhooks, verifies their signature,
normalizes the payload, and loads it into Postgres — an Extract →
Transform → Load pattern applied to webhook ingestion.

```
GitHub → [Guard: verify signature] → [Pipe: validate DTO] → [Service: transform] → [Postgres: load]
```

## Stack

- **NestJS** — API framework (modules, guards, pipes, DTOs)
- **TypeORM + Postgres (Neon)** — persistence
- **Google Cloud Run** — deployment target
- **GitHub Actions** — CI + deploy pipeline

## Local setup

```bash
cp .env.example .env      # then fill in DATABASE_URL, GitHub OAuth app credentials, JWT_SECRET
npm install
npm run start:dev
```

The app listens on `http://localhost:8080`. Swagger UI (interactive API
explorer) is served at `/`.

You'll also need a GitHub OAuth App (Settings → Developer settings → OAuth
Apps → New OAuth App) with its **Authorization callback URL** set to
`{APP_BASE_URL}/auth/github/callback`. Since GitHub can't reach `localhost`
directly, `APP_BASE_URL` needs to point at a tunnel to your machine (e.g.
`ngrok http 8080`) for both the OAuth callback and any webhook you register
while developing locally.

## Connecting a repo

Each repo you want events from is registered individually — there's no
single global webhook secret anymore; each registered repo gets its own,
generated at registration time.

1. `GET /auth/github` in a browser — completes the OAuth flow and returns a
   JWT (as JSON if `FRONTEND_URL` isn't set, otherwise redirects there with
   the token in the URL fragment).
2. `POST /repositories` with `Authorization: Bearer <token>` and
   `{ "repoUrl": "owner/repo" }` — requires you to have admin access on
   that repo. This calls GitHub's API to install a webhook automatically;
   no manual "Settings → Webhooks" step. Repos you don't administer can't
   be registered this way (see `Notes / known trade-offs` below).
3. Trigger an event on that repo (push, open a PR, etc.) and check
   `GET /events` — public repos' events are visible to anyone; private
   repos' events only to the registering user (send the same bearer
   token).
4. `DELETE /repositories/:id` removes the webhook from GitHub and stops
   tracking that repo.

## Deploying

1. Push this repo to GitHub.
2. Add repo secrets (Settings → Secrets and variables → Actions) —
   `DATABASE_URL`, `GH_OAUTH_CLIENT_ID`, `GH_OAUTH_CLIENT_SECRET`,
   `JWT_SECRET`, `APP_BASE_URL`, `FRONTEND_URL`, plus `WIF_PROVIDER` /
   `WIF_SERVICE_ACCOUNT` for the Workload Identity Federation deploy auth
   (see the comment in `deploy.yml` for how those get created — no GCP key
   file is used).
3. Push to `main` — `.github/workflows/deploy.yml` builds and deploys to
   Cloud Run automatically.
4. Update the OAuth App's callback URL to
   `https://<your-cloud-run-url>/auth/github/callback` once the real URL
   is known.

## Repo structure

```
src/
├── webhooks/          # Extract: controller, guard (per-repo HMAC verification), DTO
├── events/            # Transform + Load: service, TypeORM entity, filtering/stats API
├── auth/               # GitHub OAuth login, JWT issuance/verification, guards
├── users/              # User entity + upsert-on-login
├── repositories/       # Registering a repo: GitHub API calls to install/remove webhooks
├── github/              # Shared GitHub REST/OAuth API client
├── common/             # Global exception filter, logging interceptor
├── app.module.ts       # Wires TypeORM (Neon) + feature modules
└── main.ts             # Bootstrap — raw body capture, CORS, cookies, Swagger
```

## Notes / known trade-offs

- `synchronize: true` in `app.module.ts` is convenient for a demo (no
  migrations to manage) but unsafe for a real production database —
  it can alter/drop columns based on entity changes. Would switch to
  TypeORM migrations before this handles real user accounts beyond local
  testing.
- `User.accessToken` (the GitHub OAuth token) is stored in plaintext.
  Encrypting it at rest — e.g. `pgcrypto` or an application-level key —
  is the next thing to fix before this is more than a personal project.
- Only repos the authenticated user has **admin access to** can be
  registered — GitHub doesn't allow installing a webhook on a repo you
  don't administer. Watching an arbitrary public repo you don't own would
  need a different mechanism (polling GitHub's public Events API instead
  of a webhook) — deliberately not built yet.
- Secrets are passed to Cloud Run as plain env vars via the deploy
  workflow. For production, these would go through Google Secret
  Manager instead.
- Idempotency here relies on a DB unique constraint rather than a
  dedicated idempotency-key cache — simpler, and sufficient at this
  scale, since Postgres already gives us the atomic guarantee for free.
