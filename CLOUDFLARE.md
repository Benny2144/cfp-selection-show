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

Complete fields can also be published as permanent Selection Night events.
Each event receives a non-sequential ten-character `/watch/CODE` URL. The
commissioner can update that same URL, inspect publish/update activity and
aggregate unique-browser opens, or revoke it. Public event payloads contain
only broadcast configuration—not the owner's email, account id, private
workspace history, predictions, or unpublished boards.

League Rooms are authenticated collaborative workspaces with permanent invite
codes. D1 stores owner/admin/member roles, the official versioned board, member
roster, and member-visible activity. Only owners and admins can publish the
board. Every update includes its base version, so a stale client receives `409`
instead of overwriting a newer commissioner edit. Active rooms poll their small
version summary once per minute and alert the commissioner when a newer board is
ready to load.

Live League Room presence and instant board-publish notifications are isolated
one Durable Object per room through the `LEAGUE_LIVE` binding. WebSockets use
the Hibernation API, so idle rooms can sleep without disconnecting members.
The main Worker authenticates the session and D1 membership before forwarding
the upgrade; a browser cannot connect directly to a room coordinator.

Three native Workers Rate Limiting bindings protect Google sign-in, routine
cloud writes, and sensitive actions such as invite guesses, role changes,
publishing, session revocation, exports, and account deletion. Rate-limit state
is maintained by Cloudflare and is not written to D1.

Production resources:

- Worker: `cfp-selection-show`
- D1: `cfp-selection-show-data`
- R2: `cfp-selection-show-media`
- Durable Object: `LeagueLiveRoom` through the `LEAGUE_LIVE` binding
- Google OAuth client: configured as the public `GOOGLE_CLIENT_ID` Worker var
- Scheduled maintenance: expired sessions and security events older than 90
  days are pruned daily

## Rebuild and deploy

```powershell
pnpm install --frozen-lockfile
pnpm run verify
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

The first response must report `database: ready`. Each film must report
`Content-Type: video/mp4`, byte ranges, and the expected content length. Test
the lightweight room loop too:

```powershell
Invoke-WebRequest -Headers @{ Range = 'bytes=0-1023' } `
  https://cfp-selection-show.benarp2144.workers.dev/media/committee.mp4
```

## Google sign-in

The Google Cloud OAuth app is external and in production. Keep both of these
authorized JavaScript origins configured:

- `https://cfp-selection-show.benarp2144.workers.dev`
- `http://localhost:8787`

The app requests identity only; it does not request Gmail, Drive, Contacts, or
other Google data. Never commit an OAuth client secret. This browser flow does
not require one.

## Data ownership and recovery

- D1 holds user identity, hashed sessions, versioned JSON snapshots, published
  events, event activity, aggregate view counts, league rooms, memberships,
  shared board versions, and league activity.
- R2 holds the three public show films plus private per-account custom logos.
- A local recovery copy remains on the device if cloud saving is interrupted.
- Conflicting edits from two devices stop and require an explicit keep-local or
  use-cloud decision; neither copy is silently discarded.
- Account Control produces a portable JSON export without session secrets or
  Google provider identifiers and can revoke all sessions except the current one.
- Deleting an account removes its D1 rows, published events, sessions, and R2
  logos. Revoking one event invalidates its public URL immediately.

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

The room/gate loop uses the same private path and must also live in R2:

```powershell
pnpm exec wrangler r2 object put cfp-selection-show-media/committee.mp4 `
  --file committee.mp4 `
  --content-type video/mp4 `
  --cache-control "public, max-age=31536000, immutable" `
  --remote
```
