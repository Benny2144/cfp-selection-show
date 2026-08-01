"""
Re-encode the intro video down to something you can actually host.

The source is 1080p and about 300 MB. GitHub refuses any file over 100 MB,
and your friends would be staring at a loading spinner anyway. This makes a
720p H.264 / AAC copy that looks the same on a stream but is a fraction of
the size, with the moov atom moved to the front so playback can start before
the download finishes.

    python tools/shrink_video.py
    python tools/shrink_video.py --height 1080 --crf 21
"""
import os, sys, subprocess, argparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = 'intro when pushing play. after pat, and boone talk.mp4'
DEFAULT_DST = 'intro-video.mp4'


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass
    from shutil import which
    exe = which('ffmpeg')
    if not exe:
        sys.exit('No ffmpeg. Install one with:  python -m pip install imageio-ffmpeg')
    return exe


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=DEFAULT_SRC)
    ap.add_argument('--dst', default=DEFAULT_DST)
    ap.add_argument('--height', type=int, default=720)
    ap.add_argument('--crf', type=int, default=25,
                    help='quality, lower is better and bigger (18-28)')
    ap.add_argument('--audio', type=int, default=128, help='audio kbps')
    ap.add_argument('--preset', default='medium')
    args = ap.parse_args()

    src = args.src if os.path.isabs(args.src) else os.path.join(ROOT, args.src)
    dst = args.dst if os.path.isabs(args.dst) else os.path.join(ROOT, args.dst)
    if not os.path.exists(src):
        sys.exit('Cannot find ' + src)

    cmd = [
        ffmpeg_exe(), '-y', '-i', src,
        '-vf', 'scale=-2:%d' % args.height,
        '-c:v', 'libx264', '-preset', args.preset, '-crf', str(args.crf),
        '-pix_fmt', 'yuv420p', '-profile:v', 'high',
        '-c:a', 'aac', '-b:a', '%dk' % args.audio, '-ac', '2',
        '-movflags', '+faststart',
        dst,
    ]
    print('encoding %s -> %dp ...' % (os.path.basename(src), args.height))
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-2500:])
        sys.exit('ffmpeg failed')

    before, after = os.path.getsize(src), os.path.getsize(dst)
    print('%.0f MB  ->  %.0f MB  (%.0f%% smaller)'
          % (before / 1e6, after / 1e6, (1 - after / before) * 100))
    if after > 95e6:
        print('\nStill over GitHub\'s 100 MB limit — try --crf %d or --height 540'
              % (args.crf + 4))
    else:
        print('\nSet VIDEO_FILE in js/show.js to "%s".' % os.path.basename(dst))


if __name__ == '__main__':
    main()
