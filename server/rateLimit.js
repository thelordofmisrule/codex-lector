const buckets = new Map();

function createRateLimit({ windowMs, max, message, keyFn }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = keyFn ? keyFn(req) : `${req.ip}:${req.baseUrl}:${req.path}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: message || "Too many requests. Please try again later." });
    }

    bucket.count += 1;
    next();
  };
}

module.exports = { createRateLimit };

