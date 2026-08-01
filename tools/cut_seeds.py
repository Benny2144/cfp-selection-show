"""
Cut the per-seed commentary into a lead-in and a reaction for each seed.

The recordings run through the seeds in order. Every seed has two halves:
the build-up before the name is revealed ("your number one overall seed
is...") and the reaction after it lands ("there it is, wire to wire baby").
The show plays the first half, reveals the team, then plays the second.

Splitting on the pause between them is the whole job — that pause is the
beat where the graphic hits on a real broadcast.

    python tools/cut_seeds.py
    python tools/cut_seeds.py --model medium.en

Output: seedcall/s01-before.mp3, seedcall/s01-after.mp3, ... plus a
transcript of each half in seedcall/_transcripts/ so you can check them.
"""
import os, re, sys, json, argparse, math, array

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'seedcall')
TRANS = os.path.join(OUT, '_transcripts')
HOP = 0.01

WORD_NUM = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'sick': 6,
    'seven': 7, 'eight': 8, 'ate': 8, 'nine': 9, 'ten': 10, 'eleven': 11,
    'twelve': 12,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, '11': 11, '12': 12,
}

# mp3 frame tables, same as the other cutters
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


def index_frames(path):
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
        head = data[pos:pos + length][:64]
        if not (frames == [] and any(t_ in head for t_ in (b'Xing', b'Info', b'VBRI'))):
            frames.append((pos, length, t))
            t += dur
        pos += length
    return data, frames


def cut(data, frames, t0, t1):
    out = bytearray()
    for i, (off, ln, st) in enumerate(frames):
        if st >= t1:
            break
        nxt = frames[i + 1][2] if i + 1 < len(frames) else t1
        if st >= t0 and nxt <= t1 + 1e-6:
            out += data[off:off + ln]
    return bytes(out)


def envelope(path):
    import av
    env = array.array('f')
    acc, n = 0.0, 0
    with av.open(path) as c:
        st = c.streams.audio[0]
        rate = st.rate or 44100
        per = max(1, int(rate * HOP))
        rs = av.AudioResampler(format='s16', layout='mono', rate=rate)
        for frame in c.decode(st):
            for o in rs.resample(frame):
                for s in o.to_ndarray().reshape(-1):
                    acc += float(s) * float(s)
                    n += 1
                    if n >= per:
                        env.append(math.sqrt(acc / n) / 32768.0)
                        acc, n = 0.0, 0
    if n:
        env.append(math.sqrt(acc / max(1, n)) / 32768.0)
    return env


def speech_level(env, a, b):
    seg = sorted(env[max(0, a):min(len(env), b)])
    return seg[int(len(seg) * .7)] if seg else 0.0


def longest_pause(env, lo, hi, ref):
    """The widest quiet stretch in a window — that is the reveal beat."""
    a, b = max(0, int(lo / HOP)), min(len(env), int(hi / HOP))
    thresh = max(ref * .14, .004)
    best = (0, None)
    run = None
    for i in range(a, b):
        if env[i] < thresh:
            if run is None:
                run = i
        else:
            if run is not None and i - run > best[0]:
                best = (i - run, (run, i))
            run = None
    if run is not None and b - run > best[0]:
        best = (b - run, (run, b))
    if not best[1]:
        return None
    s, e = best[1]
    return (s + (e - s) * .5) * HOP, best[0] * HOP


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='small.en')
    ap.add_argument('--files', nargs='*', default=None)
    ap.add_argument('--lead', type=float, default=0.10,
                    help='seconds kept before a seed starts talking')
    args = ap.parse_args()

    files = args.files or sorted(
        f for f in os.listdir(ROOT)
        if f.lower().startswith('elevenlabs') and f.lower().endswith('.mp3'))
    if not files:
        sys.exit('No ElevenLabs mp3s found in ' + ROOT)

    from faster_whisper import WhisperModel
    print('loading %s ...' % args.model)
    model = WhisperModel(args.model, device='cpu', compute_type='int8')

    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TRANS, exist_ok=True)
    manifest = {}

    for fname in files:
        path = os.path.join(ROOT, fname)
        print('\n=== %s ===' % fname)
        segs, _ = model.transcribe(path, language='en', word_timestamps=True,
                                   vad_filter=False, beam_size=5,
                                   condition_on_previous_text=False)
        words = []
        for s in segs:
            for w in (s.words or []):
                clean = re.sub(r'[^a-z0-9]', '', w.word.lower())
                if clean:
                    words.append({'w': clean, 's': w.start, 'e': w.end})

        # every seed opens with "number <n>"
        marks = []
        for i, w in enumerate(words):
            if w['w'] == 'number' and i + 1 < len(words):
                n = WORD_NUM.get(words[i + 1]['w'])
                if n and not any(m[0] == n for m in marks):
                    marks.append((n, w['s']))
        marks.sort(key=lambda m: m[1])

        # The last one is not announced by number — it is "all right, last one,
        # one spot, one name left on the board". Pick it up by phrase instead.
        LAST_CUES = [['all', 'right', 'last', 'one'], ['last', 'one', 'one', 'spot'],
                     ['one', 'name', 'left'], ['final', 'team', 'in', 'the', 'field']]
        if marks and not any(m[0] == 12 for m in marks):
            after = marks[-1][1]
            hit = None
            for i in range(len(words)):
                if words[i]['s'] <= after + 4:
                    continue
                for cue in LAST_CUES:
                    if [x['w'] for x in words[i:i + len(cue)]] == cue:
                        hit = words[i]['s']
                        break
                if hit:
                    break
            if hit:
                marks.append((12, hit))
                marks.sort(key=lambda m: m[1])
                print('  (seed 12 found by phrase, not by number)')
        print('seeds found: %s' % ', '.join(str(m[0]) for m in marks))
        if not marks:
            print('  (no "number N" markers — skipping)')
            continue

        data, frames = index_frames(path)
        total = frames[-1][2] if frames else 0
        env = envelope(path)

        for k, (seed, start) in enumerate(marks):
            end = marks[k + 1][1] - 0.12 if k + 1 < len(marks) else total
            begin = max(0, start - args.lead)

            ref = speech_level(env, int(begin / HOP), int(end / HOP))
            # the reveal beat sits in the back half of the build-up
            lo = begin + (end - begin) * .34
            hi = begin + (end - begin) * .92
            found = longest_pause(env, lo, hi, ref)
            if not found:
                print('  seed %-2d  no clear pause — skipped' % seed)
                continue
            split, gap = found

            for half, (a, b) in (('before', (begin, split)),
                                 ('after', (split, end))):
                clip = cut(data, frames, a, b)
                name = 's%02d-%s.mp3' % (seed, half)
                open(os.path.join(OUT, name), 'wb').write(clip)
                manifest.setdefault('s%02d' % seed, {})[half] = round(b - a, 2)

            said = ' '.join(w['w'] for w in words
                            if begin <= w['s'] < split)[-58:]
            after = ' '.join(w['w'] for w in words
                             if split <= w['s'] < end)[:44]
            print('  seed %-2d  before %5.1fs | after %5.1fs   gap %.2fs'
                  % (seed, split - begin, end - split, gap))
            print('           ...%s  ||  %s...' % (said, after))
            open(os.path.join(TRANS, 's%02d.txt' % seed), 'w',
                 encoding='utf-8').write(
                'BEFORE: %s\n\nAFTER: %s\n' % (
                    ' '.join(w['w'] for w in words if begin <= w['s'] < split),
                    ' '.join(w['w'] for w in words if split <= w['s'] < end)))

    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    print('\n%d seeds cut into seedcall/' % len(manifest))
    missing = [n for n in range(1, 13) if 's%02d' % n not in manifest]
    if missing:
        print('missing: %s' % ', '.join(str(m) for m in missing))


if __name__ == '__main__':
    main()
