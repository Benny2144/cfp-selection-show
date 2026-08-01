"""
Check every cut clip for bleed — a neighbouring team's voice slipping in.

I can't listen to these, so this measures instead. A clip that was cut cleanly
ends in the pause after the announcer stops talking. A clip with the next team
bleeding in ends while someone is still speaking.

So the test is simply: how many milliseconds of quiet does the clip end with?

    python tools/check_voice.py
    python tools/check_voice.py --need 120
"""
import os, sys, math, array, argparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE = os.path.join(ROOT, 'voice')
HOP = 0.01


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
            for out in rs.resample(frame):
                for s in out.to_ndarray().reshape(-1):
                    acc += float(s) * float(s)
                    n += 1
                    if n >= per:
                        env.append(math.sqrt(acc / n) / 32768.0)
                        acc, n = 0.0, 0
    if n:
        env.append(math.sqrt(acc / max(1, n)) / 32768.0)
    return env


def quiet_run(env, thresh):
    """Milliseconds of quiet at the very end of the clip."""
    n = 0
    for i in range(len(env) - 1, -1, -1):
        if env[i] < thresh:
            n += 1
        else:
            break
    return n * HOP * 1000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--need', type=float, default=100,
                    help='ms of trailing quiet a clean clip should have')
    args = ap.parse_args()

    files = sorted(f for f in os.listdir(VOICE) if f.endswith('.mp3'))
    if not files:
        sys.exit('No clips in voice/ — run tools/cut_voice.py first.')

    rows = []
    for f in files:
        env = envelope(os.path.join(VOICE, f))
        if len(env) < 30:
            rows.append((f, 0.0, 0.0, len(env) * HOP))
            continue
        loud = sorted(env)[int(len(env) * 0.85)]     # speech level
        thresh = max(loud * 0.10, 0.004)
        rows.append((f, quiet_run(env, thresh), loud, len(env) * HOP))

    bad = [r for r in rows if r[1] < args.need]
    print('checked %d clips' % len(rows))
    print('trailing silence: median %.0f ms, worst %.0f ms'
          % (sorted(r[1] for r in rows)[len(rows) // 2],
             min(r[1] for r in rows)))

    if bad:
        print('\n%d clip(s) end while someone is still talking '
              '(under %.0f ms of quiet):' % (len(bad), args.need))
        for f, q, loud, dur in sorted(bad, key=lambda x: x[1]):
            print('  %-26s %4.0f ms quiet   (%.1fs long)' % (f, q, dur))
    else:
        print('\nAll clear — every clip ends in silence, no bleed.')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
