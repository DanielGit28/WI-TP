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
cd apps/api
cp .env.example .env      # then fill in your real DATABASE_URL and a webhook secret
npm install
npm run start:dev
```

The app listens on `http://localhost:8080`.

## Testing the webhook locally

GitHub can't reach `localhost` directly, so to test signature verification
end-to-end before deploying, either:

1. **Simulate it with curl** (fastest way to check the guard/transform/load logic):

   ```bash
   BODY='{"action":"opened","repository":{"full_name":"me/test-repo"},"sender":{"login":"me"}}'
   SECRET="whatever-you-put-in-.env"
   SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')"

   curl -X POST http://localhost:8080/webhooks/github \
     -H "Content-Type: application/json" \
     -H "X-GitHub-Event: pull_request" \
     -H "X-GitHub-Delivery: $(uuidgen)" \
     -H "X-Hub-Signature-256: $SIG" \
     -d "$BODY"
   ```

   Run it twice with the same `X-GitHub-Delivery` value to see the
   idempotency check kick in (`"status":"duplicate"` on the second call).

2. **Use a real GitHub repo**: Settings → Webhooks → Add webhook, point
   it at a tunnel to your machine (e.g. `ngrok http 8080`), set the same
   secret as your `.env`, and trigger a real push/PR.

## Deploying

1. Push this repo to GitHub.
2. Add repo secrets (Settings → Secrets and variables → Actions):
   - `GCP_SA_KEY` — a GCP service account JSON key with Cloud Run Admin +
     Service Account User roles (see note in `deploy.yml` about using
     Workload Identity Federation instead, for anything beyond a demo)
   - `DATABASE_URL` — your Neon pooled connection string
   - `WEBHOOK_SECRET_GITHUB` — the same secret you configure on the
     GitHub webhook itself
3. Push to `main` — `.github/workflows/deploy.yml` builds and deploys to
   Cloud Run automatically.
4. Once live, point your GitHub webhook at
   `https://<your-cloud-run-url>/webhooks/github`.

## Repo structure

```
apps/api/src/
├── webhooks/          # Extract: controller, guard (HMAC verification), DTO
├── events/            # Transform + Load: service, TypeORM entity
├── common/             # Global exception filter, logging interceptor
├── app.module.ts       # Wires TypeORM (Neon) + feature modules
└── main.ts             # Bootstrap — enables raw body capture for signatures
```

## Notes / known trade-offs

- `synchronize: true` in `app.module.ts` is convenient for a demo (no
  migrations to manage) but unsafe for a real production database —
  it can alter/drop columns based on entity changes. Would switch to
  TypeORM migrations for anything real.
- Secrets are passed to Cloud Run as plain env vars via the deploy
  workflow. For production, these would go through Google Secret
  Manager instead.
- Idempotency here relies on a DB unique constraint rather than a
  dedicated idempotency-key cache — simpler, and sufficient at this
  scale, since Postgres already gives us the atomic guarantee for free.
