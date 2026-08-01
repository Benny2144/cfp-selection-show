"""
Apply a team_colors.R palette to js/teams.js.

The file is an R list of school name -> vector of hex colours. The first is
the primary, the second the secondary. Where a school lists a third and the
second is white, black or grey, the third is preferred as the secondary —
those read fine on a jersey and dead on a broadcast plate.

    python tools/import_colors.py            # writes the changes
    python tools/import_colors.py --dry
"""
import os, re, sys, argparse, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'team_colors.R')
TEAMS_JS = os.path.join(ROOT, 'js', 'teams.js')

ALIAS = {
    'olemiss': ['ole miss', 'mississippi'],
    'texasam': ['texas a&m', 'texas am'],
    'missstate': ['mississippi state'],
    'ncstate': ['nc state', 'north carolina state'],
    'miamioh': ['miami (oh)', 'miami oh', 'miami ohio'],
    'uconn': ['connecticut', 'uconn'],
    'umass': ['massachusetts', 'umass'],
    'ulmonroe': ['ul monroe', 'louisiana monroe', 'louisiana-monroe'],
    'louisiana': ['louisiana', 'louisiana lafayette', "louisiana-lafayette"],
    'southernmiss': ['southern miss', 'southern mississippi'],
    'appstate': ['appalachian state', 'app state'],
    'fau': ['florida atlantic'],
    'fiu': ['florida international', 'fiu'],
    'utsa': ['utsa', 'texas-san antonio'],
    'utep': ['utep', 'texas-el paso'],
    'uab': ['uab', 'alabama-birmingham'],
    'unlv': ['unlv', 'nevada-las vegas'],
    'usc': ['usc', 'southern california'],
    'pittsburgh': ['pittsburgh', 'pitt'],
    'hawaii': ['hawaii', "hawai'i"],
    'samhouston': ['sam houston', 'sam houston state'],
}


def norm(s):
    s = unicodedata.normalize('NFKD', str(s))
    return re.sub(r'[^a-z0-9]', '', s.lower())


def parse_palette(path):
    txt = open(path, encoding='utf-8', errors='ignore').read()
    out = {}
    for m in re.finditer(r'"([^"]+)"\s*=\s*c\(([^)]*)\)', txt):
        name = m.group(1)
        cols = re.findall(r'#[0-9A-Fa-f]{6}', m.group(2))
        if cols:
            out[norm(name)] = cols
    return out


def lightness(h):
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return (max(r, g, b) + min(r, g, b)) / 2


def sat(h):
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
    mx, mn = max(r, g, b), min(r, g, b)
    if mx == mn:
        return 0.0
    l = (mx + mn) / 2
    return (mx - mn) / (2 - mx - mn) if l > .5 else (mx - mn) / (mx + mn)


def pick(cols):
    """primary, secondary — preferring a lively second colour when offered."""
    primary = cols[0]
    rest = cols[1:]
    if not rest:
        return primary, '#FFFFFF'
    second = rest[0]
    if sat(second) < .15 and len(rest) > 1:
        better = max(rest[1:], key=sat)
        if sat(better) > sat(second) + .2:
            second = better

    # The abbreviation panel is always black, so a black crest beside it is
    # one featureless slab. Schools that list black first (Missouri, Vandy,
    # South Carolina) give up the panel to their livelier colour and keep
    # black as the ink.
    #
    # Only genuine black qualifies: a dark green or navy is a perfectly good
    # panel next to a black tag, and must keep it. And the replacement has to
    # be a different colour, or a team ends up with its primary twice.
    if lightness(primary) < .14 and sat(primary) < .35:
        cands = [c for c in cols[1:]
                 if c.upper() != primary.upper()
                 and .18 < lightness(c) < .93 and sat(c) > .2]
        if cands:
            return max(cands, key=sat), primary

    if second.upper() == primary.upper():
        second = '#FFFFFF' if lightness(primary) < .5 else '#000000'
    return primary, second


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true')
    args = ap.parse_args()

    if not os.path.exists(SRC):
        sys.exit('No team_colors.R in ' + ROOT)
    pal = parse_palette(SRC)
    print('palette has %d schools' % len(pal))

    js = open(TEAMS_JS, encoding='utf-8').read()
    raw = re.search(r'const TEAM_RAW = `(.*?)`;', js, re.S).group(1)

    changed, missed, lines = [], [], []
    for line in raw.split('\n'):
        st = line.strip()
        if not st or st.count('|') < 6:
            lines.append(line)
            continue
        p = st.split('|')
        tid, school = p[0], p[1]

        keys = [norm(school)] + [norm(a) for a in ALIAS.get(tid, [])] + [norm(tid)]
        cols = next((pal[k] for k in keys if k in pal), None)
        if not cols:
            missed.append(school)
            lines.append(line)
            continue

        pri, sec = pick(cols)
        if (pri.upper(), sec.upper()) != (p[5].upper(), p[6].upper()):
            changed.append('%-22s %s/%s -> %s/%s' % (school, p[5], p[6], pri, sec))
        p[5], p[6] = pri.upper(), sec.upper()
        lines.append('|'.join(p))

    print('updated %d, unchanged %d, no palette entry %d'
          % (len(changed), len(lines) - len(changed) - len(missed), len(missed)))
    if missed:
        print('\nkept existing colours for:')
        for m in missed:
            print('   ', m)
    print('\nfirst 15 changes:')
    for c in changed[:15]:
        print('   ', c)

    if not args.dry:
        js = js.replace(raw, '\n'.join(lines))
        open(TEAMS_JS, 'w', encoding='utf-8').write(js)
        print('\njs/teams.js written')
    else:
        print('\n(dry run)')


if __name__ == '__main__':
    main()
