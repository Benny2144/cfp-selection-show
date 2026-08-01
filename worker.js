const MEDIA_PREFIX = '/media/';
const ALLOWED_MEDIA = new Set(['intro-video.mp4']);

function mediaHeaders(object, length) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  if (length !== undefined) headers.set('content-length', String(length));
  return headers;
}

function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value || '');
  if (!match || (!match[1] && !match[2])) return null;

  let offset;
  let length;

  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    length = Math.min(suffix, size);
    offset = size - length;
  } else {
    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) ||
        start < 0 || start >= size || requestedEnd < start) return null;
    const end = Math.min(requestedEnd, size - 1);
    offset = start;
    length = end - start + 1;
  }

  return { offset, length };
}

async function serveMedia(request, env, key) {
  if (!ALLOWED_MEDIA.has(key)) return new Response('Not found', { status: 404 });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { allow: 'GET, HEAD' },
    });
  }

  const metadata = await env.MEDIA.head(key);
  if (!metadata) return new Response('Not found', { status: 404 });

  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch && (ifNoneMatch === '*' || ifNoneMatch.includes(metadata.httpEtag))) {
    return new Response(null, { status: 304, headers: mediaHeaders(metadata) });
  }

  const rangeValue = request.headers.get('range');
  const ifRange = request.headers.get('if-range');
  const mayUseRange = rangeValue && (!ifRange || ifRange === metadata.httpEtag);

  if (mayUseRange) {
    const range = parseRange(rangeValue, metadata.size);
    if (!range) {
      return new Response('Range not satisfiable', {
        status: 416,
        headers: {
          'accept-ranges': 'bytes',
          'content-range': `bytes */${metadata.size}`,
        },
      });
    }

    const object = await env.MEDIA.get(key, { range });
    if (!object || !('body' in object)) return new Response('Not found', { status: 404 });

    const headers = mediaHeaders(object, range.length);
    headers.set(
      'content-range',
      `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`,
    );
    return new Response(request.method === 'HEAD' ? null : object.body, {
      status: 206,
      headers,
    });
  }

  if (request.method === 'HEAD') {
    return new Response(null, { headers: mediaHeaders(metadata, metadata.size) });
  }

  const object = await env.MEDIA.get(key);
  if (!object || !('body' in object)) return new Response('Not found', { status: 404 });
  return new Response(object.body, { headers: mediaHeaders(object, object.size) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(MEDIA_PREFIX)) {
      const key = decodeURIComponent(url.pathname.slice(MEDIA_PREFIX.length));
      return serveMedia(request, env, key);
    }
    return env.ASSETS.fetch(request);
  },
};
