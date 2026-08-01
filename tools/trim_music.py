"""
Trim an MP3 to the first N minutes without re-encoding.

Cuts on frame boundaries, so there is no quality loss and no encoder needed.
The 83-minute music bed is 80 MB, which makes the site slow to upload and slow
to load. Fifteen minutes is plenty for a selection show.

    python tools/trim_music.py                 # default: 15 minutes
    python tools/trim_music.py 10              # 10 minutes
    python tools/trim_music.py 12 in.mp3 out.mp3
"""
import sys, os

BITRATES = {
    1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],   # V1 L1
    2: [0, 32, 48, 56,  64,  80,  96, 112, 128, 160, 192, 224, 256, 320, 384],   # V1 L2
    3: [0, 32, 40, 48,  56,  64,  80,  96, 112, 128, 160, 192, 224, 256, 320],   # V1 L3
    4: [0, 32, 48, 56,  64,  80,  96, 112, 128, 144, 160, 176, 192, 224, 256],   # V2 L1
    5: [0,  8, 16, 24,  32,  40,  48,  56,  64,  80,  96, 112, 128, 144, 160],   # V2 L2/L3
}
RATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}


def id3_size(data):
    if data[:3] != b'ID3':
        return 0
    s = data[6:10]
    return 10 + ((s[0] & 0x7F) << 21 | (s[1] & 0x7F) << 14 |
                 (s[2] & 0x7F) << 7  | (s[3] & 0x7F))


def frame_info(h):
    """Return (length_bytes, duration_seconds) for a frame header, or None."""
    if h[0] != 0xFF or (h[1] & 0xE0) != 0xE0:
        return None
    ver, layer = (h[1] >> 3) & 3, (h[1] >> 1) & 3
    bri, sri, pad = (h[2] >> 4) & 15, (h[2] >> 2) & 3, (h[2] >> 1) & 1
    if ver == 1 or layer == 0 or bri in (0, 15) or sri == 3:
        return None

    if ver == 3:                                   # MPEG 1
        table = {3: 1, 2: 2, 1: 3}[layer]
    else:                                          # MPEG 2 / 2.5
        table = 4 if layer == 3 else 5
    bitrate = BITRATES[table][bri] * 1000
    rate = RATES[ver if ver in RATES else 0][sri]
    if not bitrate or not rate:
        return None

    if layer == 3:                                 # Layer I
        length = (12 * bitrate // rate + pad) * 4
        samples = 384
    else:
        samples = 1152 if (layer == 1 and ver == 3) else (576 if layer == 1 else 1152)
        length = 144 * bitrate // rate + pad
        if ver != 3 and layer == 1:
            length = 72 * bitrate // rate + pad
    return length, samples / rate


def is_vbr_header(frame):
    """Xing / Info / VBRI frames declare the length of the ORIGINAL file.
    Keeping one makes every player report the wrong duration, so drop it."""
    return any(tag in frame[:64] for tag in (b'Xing', b'Info', b'VBRI'))


def trim(src, dst, minutes):
    data = open(src, 'rb').read()
    start = id3_size(data)
    out = bytearray()                               # no ID3 — it also carries a length
    pos, elapsed, frames, dropped = start, 0.0, 0, 0
    target = minutes * 60

    while pos + 4 <= len(data) and elapsed < target:
        info = frame_info(data[pos:pos + 4])
        if not info:
            pos += 1                                # resync
            continue
        length, dur = info
        if pos + length > len(data):
            break
        frame = data[pos:pos + length]
        if frames == 0 and dropped == 0 and is_vbr_header(frame):
            dropped = 1                             # skip it, don't count its time
        else:
            out += frame
            elapsed += dur
            frames += 1
        pos += length

    open(dst, 'wb').write(out)
    return elapsed, frames, len(out)


if __name__ == '__main__':
    minutes = float(sys.argv[1]) if len(sys.argv) > 1 else 15
    src = sys.argv[2] if len(sys.argv) > 2 else \
        '2025 ESPN College Football Playoff Rankings Show _ Background Music.mp3'
    dst = sys.argv[3] if len(sys.argv) > 3 else 'music.mp3'

    if not os.path.exists(src):
        sys.exit('Cannot find ' + src)

    secs, frames, size = trim(src, dst, minutes)
    print('%s  ->  %s' % (src, dst))
    print('%.1f min, %d frames, %.1f MB (was %.1f MB)'
          % (secs / 60, frames, size / 1e6, os.path.getsize(src) / 1e6))
    print('\nNow point MUSIC_FILE in js/show.js at "%s".' % dst)
