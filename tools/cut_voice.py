"""
Turn the per-conference announcer files into one short mp3 per team.

Each source file has an announcer reading every team in that conference.
This transcribes it with word-level timestamps, finds where each school's
name is spoken, and cuts that span out on MP3 frame boundaries — no
re-encoding, so no quality loss and no encoder needed.

    python tools/cut_voice.py                 # everything, small.en model
    python tools/cut_voice.py --model medium.en
    python tools/cut_voice.py --only sec.mp3

Output: voice/<team-id>.mp3  plus voice/manifest.json
A transcript of each file is written to voice/_transcripts/ so you can see
exactly what it heard and fix anything by hand.
"""
import os, re, sys, json, argparse, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'voice')
TRANS = os.path.join(OUT, '_transcripts')

# which source file holds which conference (as named in js/teams.js)
FILE_CONF = {
    'sec.mp3':            'SEC',
    'big 10.mp3':         'Big Ten',
    'big 12.mp3':         'Big 12',
    'ACC.mp3':            'ACC',
    'PAC12.mp3':          'Pac-12',
    'MAC.mp3':            'MAC',
    'mountain west.mp3':  'Mountain West',
    'conference USA.mp3': 'C-USA',
    'sunbelt.mp3':        'Sun Belt',
    'independents.mp3':   'Independent',
    'american.mp3':       'American',
    'AAC.mp3':            'American',
}

# things an announcer says that the school name alone won't catch
ALIASES = {
    'olemiss':        ['ole miss', 'mississippi'],
    'texasam':        ['texas a m', 'texas a and m', 'texas am', 'texas a&m'],
    'missstate':      ['mississippi state'],
    'southcarolina':  ['south carolina'],
    'usc':            ['usc', 'southern cal', 'southern california'],
    'ucla':           ['ucla'],
    'byu':            ['byu', 'brigham young'],
    'tcu':            ['tcu'],
    'smu':            ['smu', 'southern methodist'],
    'lsu':            ['lsu'],
    'ucf':            ['ucf', 'central florida'],
    'uab':            ['uab'],
    'utsa':           ['utsa'],
    'utep':           ['utep'],
    'unlv':           ['unlv'],
    'fiu':            ['fiu', 'florida international'],
    'fau':            ['fau', 'florida atlantic'],
    'ecu':            ['ecu'],
    'eastcarolina':   ['east carolina', 'ecu'],
    'northcarolina':  ['north carolina', 'unc'],
    'ncstate':        ['nc state', 'north carolina state', 'n c state'],
    'pittsburgh':     ['pitt', 'pittsburgh'],
    'notredame':      ['notre dame'],
    'uconn':          ['uconn', 'yukon', 'connecticut'],   # heard as "Yukon"
    'umass':          ['umass', 'massachusetts'],
    'miamioh':        ['miami ohio', 'miami of ohio', 'miami oh'],
    'appstate':       ['appalachian state', 'app state'],
    'louisiana':      ['louisiana', 'louisiana lafayette', 'ragin cajuns'],
    'ulmonroe':       ['ulm', 'ul monroe', 'louisiana monroe', 'monroe'],
    'southernmiss':   ['southern miss', 'southern mississippi'],
    'westernkentucky': ['western kentucky', 'wku'],
    'middletennessee': ['middle tennessee', 'mtsu', 'middle tennessee state'],
    'olddominion':    ['old dominion', 'odu'],
    'jamesmadison':   ['james madison', 'jmu'],
    'floridastate':   ['florida state', 'fsu'],
    'washingtonstate': ['washington state', 'wazzu'],
    'westvirginia':   ['west virginia', 'wvu'],
    'kansasstate':    ['kansas state', 'k state'],
    'northernillinois': ['northern illinois', 'niu'],
    'sanjosestate':   ['san jose state'],
    'sandiegostate':  ['san diego state'],
    'hawaii':         ['hawaii', "hawai'i"],
    'southflorida':   ['south florida', 'usf'],
    'northtexas':     ['north texas', 'unt'],
    'samhouston':     ['sam houston', 'sam houston state'],
    'jacksonvillestate': ['jacksonville state'],
    'kennesawstate':  ['kennesaw state'],
    'newmexicostate': ['new mexico state'],
    'missouristate':  ['missouri state'],
    'louisianatech':  ['louisiana tech'],
    # things the announcer actually said that don't look like the school name
    'missouri':       ['mizzou'],
    'samhouston':     ['sam houston', 'sam euston', 'sam houston state'],
    'marshall':       ['marshall'],
}


def merge_initials(words):
    """The announcer spells acronyms out — "U -C -L -A", "T .C .U.".
    Whisper gives those back as single letters, so glue runs of them into
    one token that spans the same slice of audio."""
    out, i = [], 0
    while i < len(words):
        j = i
        while j < len(words) and len(words[j]['w']) == 1 and words[j]['w'].isalpha():
            j += 1
        if j - i >= 2:
            out.append({'w': ''.join(w['w'] for w in words[i:j]),
                        's': words[i]['s'], 'e': words[j - 1]['e']})
            i = j
        else:
            out.append(words[i])
            i += 1
    return out

# ------------------------------------------------------------------ teams
def load_teams():
    src = open(os.path.join(ROOT, 'js', 'teams.js'), encoding='utf-8').read()
    raw = re.search(r'const TEAM_RAW = `(.*?)`;', src, re.S).group(1)
    teams = []
    for line in raw.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        p = line.split('|')
        if len(p) < 7:
            continue
        teams.append(dict(id=p[0], school=p[1], mascot=p[2], abbr=p[3], conf=p[4]))
    return teams


def norm_words(s):
    s = unicodedata.normalize('NFKD', s)
    s = s.replace('&', ' and ').replace('.', ' ').replace("'", '')
    s = re.sub(r'[^a-zA-Z0-9]+', ' ', s).lower()
    return [w for w in s.split() if w]


def candidates(team):
    """Every phrasing worth looking for, longest first."""
    out = []
    for extra in ALIASES.get(team['id'], []):
        out.append(norm_words(extra))
    out.append(norm_words(team['school']))
    if team['mascot']:
        out.append(norm_words(team['school'] + ' ' + team['mascot']))
    seen, uniq = set(), []
    for c in out:
        k = tuple(c)
        if c and k not in seen:
            seen.add(k)
            uniq.append(c)
    uniq.sort(key=len, reverse=True)
    return uniq


# ------------------------------------------------------- mp3 frame index
BITRATES = {
    1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    2: [0, 32, 48, 56,  64,  80,  96, 112, 128, 160, 192, 224, 256, 320, 384],
    3: [0, 32, 40, 48,  56,  64,  80,  96, 112, 128, 160, 192, 224, 256, 320],
    4: [0, 32, 48, 56,  64,  80,  96, 112, 128, 144, 160, 176, 192, 224, 256],
    5: [0,  8, 16, 24,  32,  40,  48,  56,  64,  80,  96, 112, 128, 144, 160],
}
RATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}


def id3_size(d):
    if d[:3] != b'ID3':
        return 0
    s = d[6:10]
    return 10 + ((s[0] & 0x7F) << 21 | (s[1] & 0x7F) << 14 |
                 (s[2] & 0x7F) << 7 | (s[3] & 0x7F))


def frame_info(h):
    if h[0] != 0xFF or (h[1] & 0xE0) != 0xE0:
        return None
    ver, layer = (h[1] >> 3) & 3, (h[1] >> 1) & 3
    bri, sri, pad = (h[2] >> 4) & 15, (h[2] >> 2) & 3, (h[2] >> 1) & 1
    if ver == 1 or layer == 0 or bri in (0, 15) or sri == 3:
        return None
    table = {3: 1, 2: 2, 1: 3}[layer] if ver == 3 else (4 if layer == 3 else 5)
    bitrate = BITRATES[table][bri] * 1000
    rate = RATES[ver if ver in RATES else 0][sri]
    if not bitrate or not rate:
        return None
    if layer == 3:
        return (12 * bitrate // rate + pad) * 4, 384 / rate
    samples = 1152 if (layer == 1 and ver == 3) else (576 if layer == 1 else 1152)
    length = 144 * bitrate // rate + pad
    if ver != 3 and layer == 1:
        length = 72 * bitrate // rate + pad
    return length, samples / rate


# ------------------------------------------------- loudness envelope
HOP = 0.01                                    # 10 ms resolution


def envelope(path):
    """Mono RMS every 10 ms. Used to place cuts inside the pause between
    calls — Whisper's word timestamps drift enough to clip the next team's
    name onto the end of the previous one."""
    import av, math, array
    env = array.array('f')
    acc, n = 0.0, 0
    with av.open(path) as c:
        stream = c.streams.audio[0]
        rate = stream.rate or 44100
        per = max(1, int(rate * HOP))
        resampler = av.AudioResampler(format='s16', layout='mono', rate=rate)
        for frame in c.decode(stream):
            for rs in resampler.resample(frame):
                samples = rs.to_ndarray().reshape(-1)
                for s in samples:
                    acc += float(s) * float(s)
                    n += 1
                    if n >= per:
                        env.append(math.sqrt(acc / n) / 32768.0)
                        acc, n = 0.0, 0
    if n:
        env.append(math.sqrt(acc / max(1, n)) / 32768.0)
    return env


def quietest(env, lo, hi, win=0.10):
    """Time in [lo, hi] with the least energy over a `win`-second window."""
    a, b = max(0, int(lo / HOP)), min(len(env), int(hi / HOP))
    w = max(1, int(win / HOP))
    if b - a < w:
        return None
    best, best_i = None, a
    run = sum(env[a:a + w])
    best, best_i = run, a
    for i in range(a + 1, b - w):
        run += env[i + w - 1] - env[i - 1]
        if run < best:
            best, best_i = run, i
    return (best_i + w / 2) * HOP


def speech_floor(env, a, b):
    """Rough speech level for a stretch — the 70th percentile of its energy."""
    seg = sorted(env[max(0, a):min(len(env), b)])
    return seg[int(len(seg) * 0.7)] if seg else 0.0


def next_onset(env, after, ref, need=0.05):
    """First moment at/after `after` where speech starts again."""
    thresh = max(ref * 0.12, 0.004)
    n = max(1, int(need / HOP))
    i = max(0, int(after / HOP))
    while i + n < len(env):
        if all(env[k] >= thresh for k in range(i, i + n)):
            return i * HOP
        i += 1
    return None


def pause_after(env, t, ref, need=0.14):
    """Scan forward from `t` for the start of the next real pause."""
    thresh = max(ref * 0.12, 0.004)
    n = max(1, int(need / HOP))
    i = max(0, int(t / HOP))
    while i + n < len(env):
        if all(env[k] < thresh for k in range(i, i + n)):
            return i * HOP
        i += 1
    return None


def land_in_silence(env, ceiling, floor_t, ref, need=0.10):
    """Walk back from `ceiling` until the cut sits at the end of at least
    `need` seconds of quiet. That is what stops the next team's first
    syllable riding along on the end of this clip."""
    thresh = max(ref * 0.12, 0.004)
    n_need = max(1, int(need / HOP))
    lo = max(0, int(floor_t / HOP))
    i = min(len(env) - 1, int(ceiling / HOP))
    while i - n_need > lo:
        if all(env[k] < thresh for k in range(i - n_need, i)):
            return i * HOP
        i -= 1
    return None


def index_frames(path):
    """[(byte_offset, length, start_time)] for every frame in the file."""
    data = open(path, 'rb').read()
    pos, t = id3_size(data), 0.0
    frames = []
    while pos + 4 <= len(data):
        info = frame_info(data[pos:pos + 4])
        if not info:
            pos += 1
            continue
        length, dur = info
        if pos + length > len(data):
            break
        if not (frames == [] and any(tag in data[pos:pos + length][:64]
                                     for tag in (b'Xing', b'Info', b'VBRI'))):
            frames.append((pos, length, t))
            t += dur
        pos += length
    return data, frames


def cut(data, frames, t0, t1, lead=0.12):
    """Bytes for every whole frame inside [t0-lead, t1]."""
    t0 = max(0.0, t0 - lead)
    out = bytearray()
    for i, (off, ln, st) in enumerate(frames):
        if st >= t1:
            break
        # a frame runs until the next one starts; don't let it spill over
        nxt = frames[i + 1][2] if i + 1 < len(frames) else t1
        if st >= t0 and nxt <= t1 + 1e-6:
            out += data[off:off + ln]
    return bytes(out)


# ---------------------------------------------------------------- matching
# words that mean this is a shout-out, not the team being announced:
# "go Army, beat Navy" must not be mistaken for Navy's own call
ASIDE = {'beat', 'over', 'versus', 'vs', 'against'}


def find_span(words, cand, used, mascot=()):
    """Best window of `words` matching `cand`.

    Every school in these recordings is announced the same way — "<School>,
    the <Mascot> are in / punch their ticket" — so a match that is followed
    by the school's own mascot is almost certainly the real call, and one
    sitting after "beat" is almost certainly a rival mention in someone
    else's flavour line. Scoring both beats taking the first hit.
    """
    n = len(cand)
    best = None
    for i in range(len(words) - n + 1):
        if any(used[i + k] for k in range(n)):
            continue
        window = [words[i + k]['w'] for k in range(n)]
        if window == cand:
            score = 1.0
        else:
            hits = sum(1 for a, b in zip(window, cand) if a == b)
            score = hits / n
            if score < 0.75:
                continue
        j = i + n - 1

        after = [w['w'] for w in words[j + 1:j + 8]]
        if mascot and any(m in after for m in mascot):
            score += 0.60                       # "Navy, the midshipmen…"
        if after[:1] == ['the']:
            score += 0.25                       # the announcer's cadence
        if i > 0 and words[i - 1]['w'] in ASIDE:
            score -= 0.80                       # "…beat Navy"

        if best is None or score > best[2]:
            best = (i, j, score)
    return best


def listen(path, conf, teams, model):
    """Transcribe one file into timestamped words plus an mp3 frame index."""
    name = os.path.basename(path)
    print('\n=== %s  (%s) ===' % (name, conf))

    segments, _ = model.transcribe(
        path, language='en', word_timestamps=True, vad_filter=False,
        beam_size=5, condition_on_previous_text=False,
        initial_prompt='College football teams: ' +
                       ', '.join(t['school'] for t in teams
                                 if conf is None or t['conf'] == conf))

    words, plain = [], []
    for seg in segments:
        for w in (seg.words or []):
            toks = norm_words(w.word)
            if not toks:
                continue
            # a token like "A&M" can normalise to several words; share the span
            for tk in toks:
                words.append({'w': tk, 's': w.start, 'e': w.end})
            plain.append(w.word.strip())

    words = merge_initials(words)

    os.makedirs(TRANS, exist_ok=True)
    with open(os.path.join(TRANS, name + '.txt'), 'w', encoding='utf-8') as f:
        f.write(' '.join(plain))
    print('heard %d words' % len(words))

    data, frames = index_frames(path)
    total = frames[-1][2] if frames else 0
    env = envelope(path)
    print('%d frames, %.1fs, %d envelope points' % (len(frames), total, len(env)))

    return dict(name=name, conf=conf, words=words, data=data, env=env,
                frames=frames, total=total, used=[False] * len(words),
                results=[])


def sweep(src, pool, taken):
    """Match `pool` against one file's words. Longest names first, so
    "Michigan State" wins before "Michigan"."""
    words, used, found = src['words'], src['used'], []
    order = sorted(pool, key=lambda t: -max(len(c) for c in candidates(t)))
    for t in order:
        if t['id'] in taken:
            continue
        mascot = tuple(norm_words(t['mascot'])) if t['mascot'] else ()
        hit = None
        for cand in candidates(t):
            span = find_span(words, cand, used, mascot)
            if span and (hit is None or span[2] > hit[2]):
                hit = span
        if not hit:
            continue
        i, j, score = hit
        for k in range(i, j + 1):
            used[k] = True
        taken.add(t['id'])
        found.append(dict(team=t, start=words[i]['s'], end=words[j]['e'],
                          score=score,
                          said=' '.join(w['w'] for w in words[i:j + 1])))
    src['results'] += found
    return found


def write_clips(src, args):
    """The announcer gives each team a whole call — "Notre Dame, the Fighting
    Irish are in. Wake up the echoes." So a clip runs from the school's name
    to wherever the next school starts, not just to the end of the name."""
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    ordered = sorted(src['results'], key=lambda r: r['start'])
    env = src['env']
    print('\n--- %s ---' % src['name'])
    # Pass one: settle every start. A start gets nudged back into the pause
    # before the name so no syllable is lost — which means the clip before it
    # has to end earlier than the raw word timestamp suggested.
    for r in ordered:
        q = quietest(env, max(0, r['start'] - 0.55), r['start'] + 0.04)
        r['begin'] = q if q is not None else max(0, r['start'] - args.lead)

    for n, r in enumerate(ordered):
        t = r['team']
        nxt = ordered[n + 1]['begin'] if n + 1 < len(ordered) else None
        begin = r['begin']

        # end: cut inside the pause before the next call, not at the word
        # timestamp — that lands on top of the next team's first syllable
        if nxt is None:
            stop = src['total']
        else:
            # the last word the transcript places before the next call starts
            ends = [w['e'] for w in src['words']
                    if begin < w['e'] <= nxt - 0.02]
            last_word = max(ends) if ends else (nxt - args.gap)
            ref = speech_floor(env, int(begin / HOP), int(nxt / HOP))
            # where the announcer actually stops, then a beat of the pause
            p = pause_after(env, max(begin, last_word - 0.25), ref, args.quiet)
            if p is None or p > nxt:
                p = last_word
            stop = min(p + args.hold, nxt - 0.05)
        stop = max(stop, r['end'] + args.tail)
        if nxt is not None:
            stop = min(stop, nxt - 0.02)
        if args.max_len and stop > begin + args.max_len:
            ref = speech_floor(env, int(begin / HOP), int(stop / HOP))
            q = land_in_silence(env, begin + args.max_len, r['end'], ref, args.quiet)
            stop = q if q is not None else begin + args.max_len

        clip = cut(src['data'], src['frames'], begin, stop, lead=0)
        r['start'] = begin

        # how much clear air sits between this cut and the next voice
        if nxt is not None:
            ref = speech_floor(env, int(begin / HOP), int(nxt / HOP))
            on = next_onset(env, stop, ref)
            r['margin'] = (on - stop) if on is not None else None
        else:
            r['margin'] = None
        open(os.path.join(OUT, t['id'] + '.mp3'), 'wb').write(clip)
        manifest[t['id']] = round(stop - r['start'], 2)
        flag = ' ' if r['score'] == 1.0 else '~'
        note = '' if t['conf'] == src['conf'] else '  ' + t['conf']
        m = r.get('margin')
        gap = ('%4.0fms' % (m * 1000)) if m is not None else '  end'
        print('  %s %-22s %6.2f-%6.2f (%4.1fs) gap %s  "%s"%s'
              % (flag, t['school'], r['start'], stop, stop - r['start'],
                 gap, r['said'], note))
    return manifest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='small.en')
    ap.add_argument('--only', default=None)
    ap.add_argument('--out', default=None, help='output folder (default voice/)')
    ap.add_argument('--dir', default=None,
                    help='folder of recordings; names need not say the conference')
    ap.add_argument('--tail', type=float, default=0.35,
                    help='minimum seconds kept after the name')
    ap.add_argument('--hold', type=float, default=0.45,
                    help='seconds of the trailing pause kept on each clip')
    ap.add_argument('--quiet', type=float, default=0.14,
                    help='seconds of silence a cut must land after')
    ap.add_argument('--pad', type=float, default=0.10,
                    help='safety margin pulled off the end of every clip')
    ap.add_argument('--lead', type=float, default=0.12,
                    help='fallback lead-in when no pause is found')
    ap.add_argument('--gap', type=float, default=0.18,
                    help='silence left before the next team starts')
    ap.add_argument('--max-len', type=float, default=14.0,
                    help='hard cap on a clip, seconds (0 for none)')
    args = ap.parse_args()

    global OUT, TRANS
    if args.out:
        OUT = args.out if os.path.isabs(args.out) else os.path.join(ROOT, args.out)
        TRANS = os.path.join(OUT, '_transcripts')
    teams = load_teams()
    if args.dir:
        base = args.dir if os.path.isabs(args.dir) else os.path.join(ROOT, args.dir)
        files = [(os.path.join(base, f), FILE_CONF.get(f))
                 for f in sorted(os.listdir(base)) if f.lower().endswith('.mp3')]
    else:
        files = [(os.path.join(ROOT, f), FILE_CONF[f]) for f in sorted(FILE_CONF)
                 if os.path.exists(os.path.join(ROOT, f))]
        if args.only:
            files = [x for x in files
                     if os.path.basename(x[0]).lower() == args.only.lower()]
    if not files:
        sys.exit('No audio found')

    from faster_whisper import WhisperModel
    print('loading %s ...' % args.model)
    model = WhisperModel(args.model, device='cpu', compute_type='int8')

    srcs = [listen(path, conf, teams, model) for path, conf in files]

    # Pass 1: every file gets first refusal on its own conference, so a stray
    # "Georgia" in the ACC file can never steal the SEC's Georgia.
    taken = set()
    for src in srcs:
        if src['conf']:
            sweep(src, [t for t in teams if t['conf'] == src['conf']], taken)

    # Pass 2: realignment means a school can turn up in a file named after its
    # old league. Whatever is still unclaimed is fair game.
    for src in srcs:
        strays = sweep(src, [t for t in teams if t['conf'] != src['conf']], taken)
        if src['conf']:
            for r in strays:
                print('  + %s found in %s (listed as %s)'
                      % (r['team']['school'], src['name'], r['team']['conf']))

    manifest = {}
    for src in srcs:
        manifest.update(write_clips(src, args))

    covered = {t['conf'] for t in teams if t['id'] in manifest}
    missing = {}
    for t in teams:
        if t['id'] not in manifest and t['conf'] in covered:
            missing.setdefault(t['conf'], []).append(t['school'])
    no_audio = sorted({t['conf'] for t in teams if t['conf'] not in covered})

    os.makedirs(OUT, exist_ok=True)
    json.dump({'clips': manifest, 'missing': missing, 'noAudio': no_audio},
              open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)

    print('\n%d of %d teams have a call.' % (len(manifest), len(teams)))
    if missing:
        print('Not found in the audio:')
        for c, names in sorted(missing.items()):
            print('  %-16s %s' % (c, ', '.join(names)))
        print('Transcripts are in voice/_transcripts/ if you want to check.')
    if no_audio:
        print('No audio file supplied for: ' + ', '.join(no_audio))


if __name__ == '__main__':
    main()
