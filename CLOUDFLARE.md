# Cloudflare production runbook

The site runs as the `cfp-selection-show` Worker. Normal site files come from
the generated `docs/` static asset bundle. Show films are private in the
`cfp-selection-show-media` R2 bucket and exposed read-only by `worker.js` at
their allow-listed `/media/` routes.

Signed-in accounts use Google Identity Services. The Worker verifies Google's
signed credential, stores only a hash of the session token, and keeps each
member's versioned studio snapshot in D1. Imported team logos are private R2
objects under that account. Anonymous visitors continue to work locally in the
browser and can opt into cloud saving at any time.

Production resources:

- Worker: `cfp-selection-show`
- D1: `cfp-selection-show-data`
- R2: `cfp-selection-show-media`
- Google OAuth client: configured as the public `GOOGLE_CLIENT_ID` Worker var
- Scheduled maintenance: expired sessions and security events older than 90
  days are pruned daily

## Rebuild and deploy

```powershell
pnpm install --frozen-lockfile
pnpm run check
pnpm run deploy:check
pnpm run deploy
```

`wrangler.jsonc` is the source of truth for the Worker name, static directory,
and R2/D1 bindings. `pnpm run deploy` always generates and minifies `docs/`
before publishing.

## First-time database setup

```powershell
pnpm exec wrangler d1 migrations apply cfp-selection-show-data --remote
```

The migration is idempotently tracked by D1. Check it before a release with:

```powershell
pnpm exec wrangler d1 migrations list cfp-selection-show-data --remote
```

## Release verification

```powershell
Invoke-RestMethod https://cfp-selection-show.benarp2144.workers.dev/api/health
Invoke-WebRequest -Method Head https://cfp-selection-show.benarp2144.workers.dev/media/selection-night-open.mp4
```

The first response must report `database: ready`. The film must report
`Content-Type: video/mp4`, byte ranges, and the expected content length.

## Google sign-in

The Google Cloud OAuth app is external and in production. Keep both of these
authorized JavaScript origins configured:

- `https://cfp-selection-show.benarp2144.workers.dev`
- `http://localhost:8787`

The app requests identity only; it does not request Gmail, Drive, Contacts, or
other Google data. Never commit an OAuth client secret. This browser flow does
not require one.

## Data ownership and recovery

- D1 holds user identity, hashed sessions, and versioned JSON snapshots.
- R2 holds the two public show films plus private per-account custom logos.
- A local recovery copy remains on the device if cloud saving is interrupted.
- Conflicting edits from two devices stop and require an explicit keep-local or
  use-cloud decision; neither copy is silently discarded.
- Deleting an account removes its D1 rows, sessions, and R2 logos.

## Replace the Selection Night opening film

```powershell
pnpm exec wrangler r2 object put cfp-selection-show-media/selection-night-open.mp4 `
  --file selection-night-open.mp4 `
  --content-type video/mp4 `
  --cache-control "public, max-age=31536000, immutable" `
  --remote
pnpm run deploy
```

The bucket itself remains private. Only `GET` and `HEAD` for the allow-listed
file are exposed by the Worker; uploads and deletes are not public routes.
