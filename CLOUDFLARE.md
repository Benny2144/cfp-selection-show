# Cloudflare deployment

The site runs as the `cfp-selection-show` Worker. Normal site files come from
the generated `docs/` static asset bundle. The oversized intro film is private
in the `cfp-selection-show-media` R2 bucket and is exposed read-only by
`worker.js` at `/media/intro-video.mp4`.

## Rebuild and deploy

```bash
python tools/make_site.py
npx wrangler deploy
```

`wrangler.jsonc` is the source of truth for the Worker name, static directory,
and R2 binding.

## Replace the intro film

```bash
npx wrangler r2 object put cfp-selection-show-media/intro-video.mp4 \
  --file intro-video.mp4 \
  --content-type video/mp4 \
  --cache-control "public, max-age=31536000, immutable" \
  --remote
npx wrangler deploy
```

The bucket itself remains private. Only `GET` and `HEAD` for the allow-listed
file are exposed by the Worker; uploads and deletes are not public routes.
