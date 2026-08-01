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

FILES = ['index.html', 'netlify.toml', '.nojekyll', 'music.mp3',
         'patmac.mp3', 'coachboone.mp3', 'intro-video.mp4', 'committee.mp4']
DIRS = ['css', 'js', 'assets', 'logos', 'voice', 'seedcall']

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


def main():
    missing = [f for f in FILES if not os.path.exists(os.path.join(ROOT, f))]
    if 'music.mp3' in missing or 'intro.mp3' in missing:
        sys.exit('Run tools/trim_music.py first — music.mp3 / intro.mp3 are missing.')

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
        if not os.path.exists(src):
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
    print('Built %s' % OUT)
    print('%.1f MB, ready to publish.' % (total / 1e6))
    print('\nGitHub Pages: commit and push, then Settings -> Pages -> main -> /docs')
    print('Netlify:      drag the "docs" folder onto https://app.netlify.com/drop')


if __name__ == '__main__':
    main()
