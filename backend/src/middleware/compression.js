import zlib from 'zlib';

const MIN_BYTES = 1024;

// Lightweight gzip for JSON API responses — no new dependency. Scoped to
// res.json() only, so binary/range-request audio streaming is untouched.
export function jsonCompression(req, res, next) {
  const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    const payload = Buffer.from(JSON.stringify(body));
    if (!acceptsGzip || payload.length < MIN_BYTES) {
      return originalJson(body);
    }
    zlib.gzip(payload, (err, compressed) => {
      if (err) return originalJson(body);
      res.set('Content-Encoding', 'gzip');
      res.set('Content-Type', 'application/json; charset=utf-8');
      res.set('Vary', 'Accept-Encoding');
      res.send(compressed);
    });
  };

  next();
}
