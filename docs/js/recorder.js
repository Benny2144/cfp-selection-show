/* =====================================================================
   SHOW RECORDER
   Captures the show to a video file you can keep or post.

   Uses the browser's own screen-capture: you pick this tab, tick
   "share tab audio", and everything you see and hear is written to a
   .webm. Needs a secure page (https:// or localhost) — it will not work
   from a file:// double-click.
   ===================================================================== */

const Recorder = (() => {
  let stream = null, rec = null, chunks = [], blob = null, url = null;
  let active = false, startedAt = 0;

  const supported = () =>
    !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia &&
       window.MediaRecorder && window.isSecureContext);

  const onPhone = () =>
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));

  function reason() {
    if (!window.isSecureContext)
      return 'Recording needs the site to be on https:// or localhost — ' +
             'it can\'t run from a file on disk.';
    if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) {
      if (onPhone())
        return 'Phones can\'t record a browser tab. Use your phone\'s own screen ' +
               'recorder — iPhone: swipe down and tap the record button. ' +
               'Android: swipe down and tap Screen record. It saves straight to ' +
               'your camera roll.';
      return 'This browser can\'t record. Chrome, Edge or Firefox on a computer can.';
    }
    return '';
  }

  function pickType() {
    const want = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4'
    ];
    return want.find(t => MediaRecorder.isTypeSupported(t)) || '';
  }

  /** Ask for the screen/tab. Must be called straight off a click. */
  async function start(onStop) {
    if (!supported()) throw new Error(reason());
    discard();

    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      systemAudio: 'include'
    });

    const mimeType = pickType();
    rec = new MediaRecorder(stream, Object.assign(
      { videoBitsPerSecond: 6_000_000 }, mimeType ? { mimeType } : {}));

    chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' });
      url = URL.createObjectURL(blob);
      active = false;
      stream.getTracks().forEach(t => t.stop());
      onStop && onStop(info());
    };

    /* if they hit the browser's own "Stop sharing" bar */
    stream.getVideoTracks()[0].addEventListener('ended', () => stop());

    rec.start(1000);
    active = true;
    startedAt = performance.now();
    return true;
  }

  function stop() {
    if (rec && rec.state !== 'inactive') rec.stop();
    else if (stream) { stream.getTracks().forEach(t => t.stop()); active = false; }
  }

  function discard() {
    if (url) URL.revokeObjectURL(url);
    url = null; blob = null; chunks = [];
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; rec = null; active = false;
  }

  function info() {
    if (!blob) return null;
    return {
      url, size: blob.size,
      seconds: Math.round((performance.now() - startedAt) / 1000),
      ext: (blob.type || '').includes('mp4') ? 'mp4' : 'webm'
    };
  }

  function filename() {
    const clean = s => String(s || '').replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '').toLowerCase();
    const parts = [clean(STATE.league) || 'dynasty', clean(STATE.season) || '',
                   'selection-show'].filter(Boolean);
    return parts.join('-') + '.' + (info()?.ext || 'webm');
  }

  function download() {
    const i = info();
    if (!i) return false;
    const a = document.createElement('a');
    a.href = i.url; a.download = filename();
    document.body.appendChild(a); a.click(); a.remove();
    return true;
  }

  /* ---------------------------------------------------------- to a phone */
  function file() {
    if (!blob) return null;
    try { return new File([blob], filename(), { type: blob.type }); }
    catch (e) { return null; }
  }

  /** Can the OS share sheet take this video? (AirDrop, Messages, Photos…) */
  function canShare() {
    const f = file();
    return !!(f && navigator.canShare && navigator.canShare({ files: [f] }));
  }

  /** Hand the video to the OS share sheet — the way to get it onto a phone. */
  async function share() {
    const f = file();
    if (!f) throw new Error('Nothing recorded yet');
    if (!navigator.share) throw new Error('no-share');
    await navigator.share({
      files: [f],
      title: 'Selection Show',
      text: 'Our playoff selection show'
    });
    return true;
  }

  return { supported, reason, start, stop, discard, info, download, filename,
           file, canShare, share,
           get active() { return active; },
           get ready()  { return !!blob; } };
})();
