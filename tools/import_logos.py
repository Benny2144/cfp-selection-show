"""
Unpack a logo library into logos/<team-id>.png so the site ships with them.

Matches each file to a team by name, the same forgiving way the announcer
audio is matched, and reports anything it could not place so you can rename
the handful that need it.

    python tools/import_logos.py                      # finds the zip itself
    python tools/import_logos.py --src some/folder
    python tools/import_logos.py --dry
"""
import os, re, sys, glob, shutil, zipfile, argparse, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'logos')

# names in the library that are not schools
NOT_TEAMS = re.compile(
    r'(conference|independent|ncaa|playoff|division'
    r'|pac[-_ ]?12[-_ ]?logo|sun[-_ ]belt|mid[-_ ]american|big[-_ ](12|ten))',
    re.I)

# where the library's wording differs from ours
ALIAS = {
    'alabamabirminghamblazers': 'uab',
    'centralfloridaknights': 'ucf',
    'connecticuthuskies': 'uconn',
    'floridainternationalpanthers': 'fiu',
    'floridaatlanticowls': 'fau',
    'louisianalafayetteraginCajuns': 'louisiana',
    'louisianaraginajuns': 'louisiana',
    'louisianamonroewarhawks': 'ulmonroe',
    'massachusettsminutemen': 'umass',
    'miamiohredhawks': 'miamioh',
    'miamihurricanes': 'miami',
    'mississippirebels': 'olemiss',
    'olemissrebels': 'olemiss',
    'nevadalasvegasrebels': 'unlv',
    'nevadawolfpack': 'nevada',
    'texaselpasominers': 'utep',
    'texassanantonioroadrunners': 'utsa',
    'southernmississippigoldeneagles': 'southernmiss',
    'southerncaliforniatrojans': 'usc',
    'northcarolinastatewolfpack': 'ncstate',
    'pittsburghpanthers': 'pittsburgh',
    'armywestpointblackknights': 'army',
    'sanjosestatespartans': 'sanjosestate',
    'hawaiirainbowwarriors': 'hawaii',
    'samhoustonbearkats': 'samhouston',
    'samhoustonstatebearkats': 'samhouston',
    'fiupanthers': 'fiu',
    'pittpanthers': 'pittsburgh',
    'smumustang': 'smu',
    'smumustangs': 'smu',
    'northcarolinastatewolfpack': 'ncstate',
    'connecticuthuskies': 'uconn',
    'louisianamonroewarhawks': 'ulmonroe',
}


def norm(s):
    s = unicodedata.normalize('NFKD', s)
    s = re.sub(r'[_\-]+', ' ', s)          # _ is a word char, so \b never fires
    s = re.sub(r'\s*\d+x\d+', ' ', s)      # drop the 300x300 suffix
    s = re.sub(r'\b(logo|logos|university|univ)\b', ' ', s, flags=re.I)
    return re.sub(r'[^a-z0-9]', '', s.lower())


def load_teams():
    src = open(os.path.join(ROOT, 'js', 'teams.js'), encoding='utf-8').read()
    raw = re.search(r'const TEAM_RAW = `(.*?)`;', src, re.S).group(1)
    out = []
    for line in raw.strip().splitlines():
        p = line.strip().split('|')
        if len(p) >= 7:
            out.append({'id': p[0], 'school': p[1], 'mascot': p[2], 'abbr': p[3]})
    return out


def build_index(teams):
    idx = {}
    def add(k, v):
        k = norm(k)
        if k and k not in idx:
            idx[k] = v
    for t in teams:
        add(t['school'] + t['mascot'], t['id'])
        add(t['school'], t['id'])
        add(t['id'], t['id'])
        add(t['school'].replace('State', 'St'), t['id'])
    return idx


def match(fname, idx, teams):
    key = norm(os.path.splitext(os.path.basename(fname))[0])
    if key in ALIAS:
        return ALIAS[key]
    if key in idx:
        return idx[key]
    # longest school name that the filename starts with
    best, blen = None, 0
    for t in teams:
        s = norm(t['school'])
        if len(s) >= 4 and key.startswith(s) and len(s) > blen:
            best, blen = t['id'], len(s)
    if best:
        return best
    for k, v in idx.items():
        if len(k) >= 8 and (key.startswith(k) or k.startswith(key)):
            return v
    return None


def sources(args):
    if args.src:
        base = args.src if os.path.isabs(args.src) else os.path.join(ROOT, args.src)
        if os.path.isdir(base):
            return [(p, open(p, 'rb').read()) for p in
                    glob.glob(os.path.join(base, '**', '*.*'), recursive=True)
                    if p.lower().endswith(('.png', '.svg', '.webp', '.jpg', '.jpeg'))]
        zips = [base]
    else:
        zips = sorted(glob.glob(os.path.join(ROOT, '*ogo*ibrary*.zip'))) or \
               sorted(glob.glob(os.path.join(ROOT, '*.zip')))
    out = []
    for z in zips:
        with zipfile.ZipFile(z) as zf:
            for n in zf.namelist():
                if n.endswith('/'):
                    continue
                if n.lower().endswith(('.png', '.svg', '.webp', '.jpg', '.jpeg')):
                    out.append((n, zf.read(n)))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=None, help='zip or folder of logos')
    ap.add_argument('--dry', action='store_true')
    args = ap.parse_args()

    teams = load_teams()
    idx = build_index(teams)
    files = sources(args)
    if not files:
        sys.exit('No logo files found.')

    os.makedirs(OUT, exist_ok=True)
    placed, skipped, unmatched = {}, [], []

    for name, data in files:
        base = os.path.basename(name)
        if NOT_TEAMS.search(base):
            skipped.append(base)
            continue
        tid = match(base, idx, teams)
        if not tid:
            unmatched.append(base)
            continue
        if tid in placed:
            continue
        ext = os.path.splitext(base)[1].lower()
        if not args.dry:
            open(os.path.join(OUT, tid + ext), 'wb').write(data)
        placed[tid] = base

    have = set(placed)
    missing = [t for t in teams if t['id'] not in have]

    print('%d of %d teams now have a logo' % (len(placed), len(teams)))
    if skipped:
        print('\nnot schools, ignored: %d (conference marks and the like)' % len(skipped))
    if unmatched:
        print('\ncould not place %d file(s):' % len(unmatched))
        for u in unmatched:
            print('   ', u)
    if missing:
        print('\nno logo for %d team(s):' % len(missing))
        for t in missing:
            print('    %-22s (wants logos/%s.png)' % (t['school'], t['id']))
    if args.dry:
        print('\n(dry run — nothing written)')


if __name__ == '__main__':
    main()
