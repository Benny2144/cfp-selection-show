# CFP Selection Show

A cinematic College Football Playoff event studio for a CFB 27 online dynasty.
The commissioner sets the twelve in private, rolls a 15-second Selection Night
film, and reveals the field through chapter cards, suspense beats, team-color
impacts, matchup lockups, live bracket placement, the bubble, and a full-field
finale.

Works on phones. Records the whole show to a video file.

---

## Put it online

The repo is already initialized and committed. `docs/` holds the normal web
assets, while show films are served from a private Cloudflare R2 bucket through
the Worker.

### Cloudflare Workers + R2

Live site: <https://cfp-selection-show.benarp2144.workers.dev>

The production setup is checked into this repository:

- `wrangler.jsonc` defines the Worker, static assets, and private R2 binding.
- `worker.js` exposes only allow-listed show films at `/media/` and supports
  browser byte-range requests.
- `tools/make_site.py` builds `docs/` without copying R2-hosted films.

After authenticating Wrangler, deploy with:

```bash
python tools/make_site.py
npx wrangler deploy
```

See `CLOUDFLARE.md` for the bucket and media replacement commands.

### GitHub Pages

Log in once, in your own terminal — this opens a browser and I deliberately stay
out of it:

```bash
gh auth login
```

Then publish:

```bash
gh repo create cfp-selection-show --public --source=. --push
```

Turn Pages on:

```bash
gh api -X POST repos/{owner}/cfp-selection-show/pages -f "source[branch]=main" -f "source[path]=/docs"
```

Your URL is `https://<your-username>.github.io/cfp-selection-show/`. It takes a
minute or two to go live the first time.

To push changes later:

```bash
python tools/make_site.py
git add -A && git commit -m "update" && git push
```

### Netlify instead

Drag the `docs` folder onto <https://app.netlify.com/drop>. Live URL in about a
minute, no repo needed.

### Testing locally

```bash
python -m http.server 8777
```

Then <http://localhost:8777>. Recording and clipboard need `http://localhost` or
`https://` — they don't work from a double-clicked file.

Once it's live, **Copy Share Link** produces a URL that works for anyone.

---

## Letting your brother make the picks

Send him the site URL. He opens it, hits **Build the field**, and picks his own
twelve — the board lives in his browser, not yours, so you can both have separate
brackets going at the same time without stepping on each other.

When he's done he hits **Copy Share Link** and sends it back. That link carries
the whole field — seeds, records, team colors, show settings. Whoever opens it
lands on the play button with his bracket loaded, and the show runs exactly as he
set it up.

---

## On a phone

The whole site works on a phone.

- The committee room splits into **Teams** and **The Field** tabs, so each gets
  the full screen. The tab shows your progress (`7/12`).
- Reorder seeds with the **▲▼** buttons — dragging doesn't work on touch.
- In the show, use the visible **Previous / Pause / Next** control dock; tapping
  the stage brings the controls back without accidentally skipping a reveal.
- The final screen becomes a readable stacked list: byes, then each first-round
  game, then the bowl path. **Full Bracket** switches to the wide 16:9 version
  with horizontal scroll.
- Turn the phone sideways for the show. On iPhone there's no fullscreen button
  for web pages, so landscape is as big as it gets.

---

## Recording the show

Tick **Record this show to a video file** on the play screen before you hit play.
The browser asks you to pick what to capture — **choose this tab and tick "share
tab audio"**, or you'll get a silent video. The file downloads on its own when
the show ends, named something like
`sunday-night-dynasty-2027-selection-show.webm`.

Requirements: a desktop browser (Chrome, Edge or Firefox) and the site on
`https://` or `localhost`. The checkbox is disabled with an explanation if either
isn't true. Phones can't do this — screen-record with the phone's own recorder
instead.

If you cancel the capture prompt the show plays normally, just without recording.

> Heads up: I couldn't run a real capture end-to-end from here — the preview
> browser blocks screen capture. The code path and the cancel/failure handling
> are tested; the actual recording is worth a dry run before show night.

---

## How a show night runs

**Home** → **Build the field**, or **I have a link** to paste a shared bracket.

### 1. Committee Room

- Search or filter the 136 FBS teams; **click a team** to drop it into the next
  open seed.
- Reorder with **▲▼**, or drag the rows on a computer. Seeds 1–4 carry a gold bar
  — first-round byes.
- Type each record in the small box (e.g. `12-1`).
- **League Setup** — league name, season, show title/subtitle, extra ticker lines
  (separate with `|`).
- **Logos** — see below.
- Nothing leaves your screen until you share it. The board saves as you go.

### 2. Set the show

| Option | What it does |
|---|---|
| Reveal order | `No. 1 → No. 12`, or `No. 12 → No. 1` for a countdown |
| Pace | Auto every 7/10/14/20s, or **Manual** — you advance every pick |
| Cold open | **Full** starts with the supplied 15s film, then the spoken open; **Short** keeps the film and uses a condensed title package; **Off** goes straight to the picks |
| Effects | **Maximum**, **Normal**, or **Calm** (no shake, flash or glitch) |
| Music | Volume of the background bed |

### 3. Go live

**Go To Show** lands on the play button. Nothing moves until you press it.
Fullscreen, then play.

1. The supplied committee film rolls full-screen in 1080p with its original
   audio, title treatment, timer, and broadcast grade.
2. The spoken open takes over with title slates and a countdown.
3. The picks are divided into three acts: **The Four Byes**, **Campus Lights**,
   and **The Cut Line**.
4. Every team gets a suspense lock, hero reveal, announcer call, bracket landing,
   and team-color impact.
5. Each completed opening-round pairing receives a full-screen matchup lockup.
6. The bubble comparison and first teams out lead into **The Twelve** hero wall,
   the closing card, and the finished bracket.

| Key | Action |
|---|---|
| `Space` | Play / next pick |
| `←` `→` | Step back / forward |
| `S` | Skip the intro |
| `P` | Pause |
| `F` | Fullscreen |
| `Esc` | Exit |

---

## No spoilers

Nothing about the field appears before you reveal it. The ticker runs generic
hype lines during the cold open and only adds a team the instant it lands. The
bracket rail stays dark until then. Even the matchup line is careful — reveal the
12 seed first and it says "plays the No. 5 seed" rather than naming a team you
haven't announced.

---

## Logos

Every team ships with a color plate carrying its wordmark, which reads correctly
on air. For real logos:

**Bulk import.** Committee Room → **Logos** → drag in a whole folder. Filenames
are matched automatically and it's forgiving: `Ohio_State_Buckeyes_logo.png`,
`ohiostate.png`, `Ohio State.svg` and `OSU.png` all land on the same team. It
reports anything it couldn't place. Stored on your device.

**The logos folder.** Files named `<team-id>.png` (or .svg/.webp/.jpg) in
`logos/` are found automatically — and these ship with the site, so your whole
league sees them. Team ids are the first column in `js/teams.js`.

**A hosted set.** Logos → **Logo URL** takes a pattern like
`https://your-host.com/logos/{id}.png`.

**One at a time.** Right-click a team card and drop an image in.

I didn't ship school logos and I'm not going to pull them down for you — they're
the schools' trademarks. Everything above makes whichever set you choose a single
drag-and-drop.

---

## Customizing

**Team colors, names, abbreviations** — right-click any team card. Changes save
and travel with the share link.

**Relocated or created schools** — **+ Custom Team** in the header.

**Audio** — `intro.mp3` and `music.mp3`, named at the top of `js/show.js`. They're
trimmed copies of your originals, made with:

```bash
python tools/trim_music.py 15
```

That cuts on MP3 frame boundaries, so there's no re-encoding and no quality loss.
The 83-minute original became 15 minutes / 14.5 MB. The originals are untouched.

The bed starts as soon as you touch the page — it plays under the committee room
while you pick, ducks to 22% while the intro talks, then comes back up. Ducking
levels are `DUCK_UNDER_VOICE` and `DUCK_UNDER_HIT` in the same file.

**Backgrounds** — `assets/trophy-cut.webp` (the standing trophy) and
`assets/trophy-bg.webp` (blurred backdrop).

**Colors** — `--accent` at the top of `css/broadcast.css` reskins everything.

---

## Files

```
index.html              home, committee room, show, bracket
css/broadcast.css       styling, animations, responsive layout
css/prime.css           cinematic design system and authored show moments
js/teams.js             136-team database
js/logos.js             logo storage, bulk import, filename matching
js/recorder.js          screen capture to a video file
js/app.js               home, room, banners, share links, bracket, field list
js/show.js              cold open, reveal engine, audio, effects
js/experience.js        route transitions, live status, and film lifecycle
assets/                 trophy background plates
logos/                  drop logo files here
tools/trim_music.py     shrink the audio without re-encoding
tools/make_site.py      build the publish folder
tools/import_assets.py  regenerate optimized art and both committee-film cuts
docs/                   the built site — this is what gets served
```
