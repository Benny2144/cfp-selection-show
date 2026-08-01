"""
Take the generated artwork and the committee film and turn them into
something a phone can actually download.

The originals are 1.9-2.5 MB PNGs and a 62 MB 4K video. Shipped as-is the
site would be a third of a gigabyte. Everything here is lossy on purpose:
these are full-bleed backdrops sitting behind type, so WebP at q72 and a
720p video are indistinguishable in use and about forty times smaller.

    python tools/import_assets.py

Run it again whenever you drop new artwork in — it only rewrites what it
can find, and it names things by what they are rather than by the time
the image generator happened to finish.
"""
import os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets')
PICK_DIR = os.path.join(SRC, 'pick')

try:
    from PIL import Image
except ImportError:
    sys.exit('Pillow is needed:  python -m pip install pillow')


def find(pattern):
    """First file in assets/ matching a regex, or None."""
    rx = re.compile(pattern, re.I)
    for name in sorted(os.listdir(SRC)):
        if rx.search(name):
            return os.path.join(SRC, name)
    return None


def webp(src, dst, width, quality=72):
    if not src or not os.path.exists(src):
        print('  skip (not found) ->', os.path.basename(dst))
        return 0
    im = Image.open(src).convert('RGB')
    if im.width > width:
        h = round(im.height * width / im.width)
        im = im.resize((width, h), Image.LANCZOS)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im.save(dst, 'WEBP', quality=quality, method=6)
    n = os.path.getsize(dst)
    print('  %-28s %4d x %-4d %6.0f KB' %
          (os.path.relpath(dst, ROOT), im.width, im.height, n / 1024))
    return n


def shrink_video(src, dst, height=720, crf=30):
    """720p, no audio — it is a silent backdrop, the track is dead weight."""
    if not src or not os.path.exists(src):
        print('  skip (not found) ->', os.path.basename(dst))
        return 0
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ff, '-y', '-v', 'error', '-i', src,
           '-an',                                   # drop the audio outright
           '-vf', 'scale=-2:%d' % height,
           '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf),
           '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
           dst]
    subprocess.run(cmd, check=True)
    n = os.path.getsize(dst)
    print('  %-28s %6.1f MB  (from %.1f MB)' %
          (os.path.relpath(dst, ROOT), n / 1e6, os.path.getsize(src) / 1e6))
    return n


def main():
    total = 0
    print('Pick backdrops')
    # "...02_20_51 PM (3).png" -> pick 3.  The two later ones are 11 and 12.
    for n in range(1, 11):
        src = find(r'02_20_5\d PM \(%d\)\.png$' % n)
        total += webp(src, os.path.join(PICK_DIR, '%02d.webp' % n), 1600)
    total += webp(find(r'02_18_35 PM \(1\)\.png$'),
                  os.path.join(PICK_DIR, '11.webp'), 1600)
    total += webp(find(r'02_18_35 PM \(2\)\.png$'),
                  os.path.join(PICK_DIR, '12.webp'), 1600)

    print('Boards')
    total += webp(find(r'02_15_37 PM \(1\)\.png$'),
                  os.path.join(SRC, 'board-bracket.webp'), 1920)
    total += webp(find(r'02_15_37 PM \(3\)\.png$'),
                  os.path.join(SRC, 'board-rankings.webp'), 1920)
    total += webp(find(r'^Generated image 1 \(3\)\.png$'),
                  os.path.join(SRC, 'board-top10.webp'), 1920)

    print('Committee film')
    total += shrink_video(find(r'^kling_.*\.mp4$'),
                          os.path.join(ROOT, 'committee.mp4'))

    print('\n%.1f MB of shippable assets.' % (total / 1e6))


if __name__ == '__main__':
    main()
