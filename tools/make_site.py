"""
Build a clean `docs/` folder containing only what needs to go on the web.

Leaves behind the 80 MB source mp3 and the .avif originals, so what you
publish is about 16 MB instead of 82 MB.

    python tools/make_site.py

The folder is called `docs` because GitHub Pages can serve a site straight
out of it (Settings -> Pages -> deploy from branch -> main -> /docs).
It works just as well dragged onto https://app.netlify.com/drop
"""
import os, re, shutil, sys, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs')

FILES = ['index.html', 'netlify.toml', '_headers', '.nojekyll', 'music.mp3',
         'patmac.mp3', 'coachboone.mp3', 'intro-video.mp4',
         'selection-night-open.mp4', 'committee.mp4']
DIRS = ['css', 'js', 'assets', 'logos', 'voice', 'seedcall']

# Anything Cloudflare's static asset layer will not take. Its hard cap is
# 25 MiB per asset and the intro film is 55 MB. When index.html names a media
# base these are left out of the build and served from R2 by worker.js;
# when it is blank they are copied as usual and the site is self-contained.
# Keep this in step with CDN_FILES in js/show.js.
CDN_FILES = {'intro-video.mp4', 'selection-night-open.mp4'}
PAGES_FILE_CAP = 25 * 1024 * 1024

# Subfolders worth following. Everything else (voice/_transcripts and the
# like) is working material and stays out of the build.
SUBDIRS = {'assets': ['pick']}

# never ship these
SKIP_EXT = {'.avif', '.py', '.md'}
SKIP_NAMES = {'README.txt'}

# The raw output of the image generator and the 4K film it came with. Those
# are the masters — tools/import_assets.py turns them into the WebPs and the
# 720p committee.mp4 that actually get used, and shipping both would put a
# third of a gigabyte on the site for no visible difference.
SKIP_PATTERNS = [
    re.compile(r'^ChatGPT Image .*\.png$', re.I),
    re.compile(r'^Generated image .*\.png$', re.I),
    re.compile(r'^kling_.*\.mp4$', re.I),
]


def keep(name):
    if name in SKIP_NAMES:
        return False
    if any(p.match(name) for p in SKIP_PATTERNS):
        return False
    return os.path.splitext(name)[1].lower() not in SKIP_EXT


def stamp_assets():
    """Append a content hash to the css/js URLs in the published index.html.

    Without this a browser that already has the old js keeps using it after
    an update, which is how you end up debugging a bug you already fixed.
    """
    idx = os.path.join(OUT, 'index.html')
    if not os.path.exists(idx):
        return
    html = open(idx, encoding='utf-8').read()

    def digest(rel):
        f = os.path.join(OUT, rel)
        if not os.path.exists(f):
            return None
        return hashlib.sha1(open(f, 'rb').read()).hexdigest()[:8]

    def sub(m):
        attr, rel = m.group(1), m.group(2)
        d = digest(rel)
        return m.group(0) if not d else '%s="%s?v=%s"' % (attr, rel, d)

    html = re.sub(r'(src|href)="((?:js|css)/[^"?]+)"', sub, html)
    open(idx, 'w', encoding='utf-8').write(html)


def media_base():
    """Read the media base out of index.html, so the build and the browser
    can never disagree about where the big files are coming from."""
    idx = os.path.join(ROOT, 'index.html')
    if not os.path.exists(idx):
        return ''
    html = open(idx, encoding='utf-8').read()
    # The tag is documented by an example inside a comment right above it,
    # and a plain search finds the example first — which silently builds for
    # a bucket that does not exist. The browser is not fooled by that (a
    # comment is not an element) so the two would disagree. Strip comments.
    html = re.sub(r'<!--.*?-->', '', html, flags=re.S)
    m = re.search(r'<meta\s+name=["\']media-base["\']\s+content=["\']([^"\']*)["\']',
                  html, re.I)
    return (m.group(1).strip().rstrip('/') if m else '')


def main():
    missing = [f for f in FILES if not os.path.exists(os.path.join(ROOT, f))]
    if 'music.mp3' in missing or 'intro.mp3' in missing:
        sys.exit('Run tools/trim_music.py first — music.mp3 / intro.mp3 are missing.')

    base = media_base()
    offsite = CDN_FILES if base else set()
    if base:
        print('Media base: %s' % base)
        print('  serving from there: %s\n' % ', '.join(sorted(CDN_FILES)))

    if os.path.exists(OUT):
        try:
            shutil.rmtree(OUT)
        except PermissionError:
            # something has a file open (a local server, usually) — just
            # overwrite in place rather than failing the build
            print('Note: could not clear site/ — overwriting in place.')
    os.makedirs(OUT, exist_ok=True)

    total = 0
    for f in FILES:
        src = os.path.join(ROOT, f)
        if not os.path.exists(src) or f in offsite:
            continue
        shutil.copy2(src, os.path.join(OUT, f))
        total += os.path.getsize(src)

    for d in DIRS:
        src = os.path.join(ROOT, d)
        if not os.path.isdir(src):
            continue
        dst = os.path.join(OUT, d)
        os.makedirs(dst, exist_ok=True)
        for name in os.listdir(src):
            p = os.path.join(src, name)
            if os.path.isfile(p) and keep(name):
                shutil.copy2(p, os.path.join(dst, name))
                total += os.path.getsize(p)

        # named subfolders only — voice/_transcripts and friends stay behind
        for sub in SUBDIRS.get(d, []):
            ssrc = os.path.join(src, sub)
            if not os.path.isdir(ssrc):
                continue
            sdst = os.path.join(dst, sub)
            os.makedirs(sdst, exist_ok=True)
            for name in os.listdir(ssrc):
                p = os.path.join(ssrc, name)
                if os.path.isfile(p) and keep(name):
                    shutil.copy2(p, os.path.join(sdst, name))
                    total += os.path.getsize(p)

    stamp_assets()

    # nothing in the build is allowed to surprise Cloudflare
    oversize = []
    count = 0
    for dirpath, _, names in os.walk(OUT):
        for n in names:
            p = os.path.join(dirpath, n)
            count += 1
            if os.path.getsize(p) > PAGES_FILE_CAP:
                oversize.append((os.path.relpath(p, OUT), os.path.getsize(p)))

    print('Built %s' % OUT)
    print('%.1f MB across %d files.' % (total / 1e6, count))

    if oversize:
        print('\n  !! Cloudflare static assets will reject this deploy.')
        print('     Its limit is 25 MiB per file, on every plan:')
        for name, size in oversize:
            print('       %-24s %6.1f MB' % (name, size / 1e6))
        print('     Add them to CDN_FILES and set <meta name="media-base">')
        print('     in index.html — see CLOUDFLARE.md.')
    elif base:
        print('Ready for Cloudflare Workers — nothing over 25 MiB.')
    print('\nGitHub Pages: commit and push, then Settings -> Pages -> main -> /docs')
    print('Cloudflare:   npx wrangler deploy')
    print('Netlify:      clear media-base, rebuild, then deploy docs/')


if __name__ == '__main__':
    main()
