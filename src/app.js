'use strict';

const express = require('express');
const { CONTENT_ID_PATTERN, isPortableContentId } = require('./content-id');

const SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self' https://abacus.jasoncameron.dev",
  "font-src 'self'",
  "form-action 'self'",
  "img-src 'self' data: https:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'"
].join('; ');

const LONG_CACHE_CONTROL = 'public, max-age=604800, must-revalidate';
const SHORT_CACHE_CONTROL = 'public, max-age=3600, must-revalidate';
const SHORT_CACHE_SCRIPTS = new Set(['feed-archive.js', 'feed-data.js', 'posts-index.js']);
const SHORT_CACHE_DOCUMENTS = new Set(['rss.xml', 'sitemap.xml']);

function setStaticCacheHeaders(res, filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const fileName = normalizedPath.slice(normalizedPath.lastIndexOf('/') + 1);

  if (
    normalizedPath.endsWith('.html') ||
    SHORT_CACHE_DOCUMENTS.has(fileName) ||
    SHORT_CACHE_SCRIPTS.has(fileName) ||
    /\/assets\/posts\/[^/]+\.json$/.test(normalizedPath)
  ) {
    res.setHeader('Cache-Control', SHORT_CACHE_CONTROL);
    return;
  }

  if (
    /\/vendor\//.test(normalizedPath) ||
    /\.(?:avif|css|gif|ico|jpe?g|js|png|svg|webp)$/.test(normalizedPath)
  ) {
    res.setHeader('Cache-Control', LONG_CACHE_CONTROL);
  }
}

function jsonError(res, status, message) {
  return res.status(status).json({ code: 1, data: null, message });
}

function createMutationLimiter(options = {}) {
  const windowMs = options.windowMs || 60_000;
  const max = options.max || 60;
  const maxEntries = options.maxEntries || 10_000;
  const now = options.now || Date.now;
  const buckets = new Map();

  return function limitMutation(req, res, next) {
    const timestamp = now();
    const key = `${req.ip}:${req.params.id}:${req.path.split('/').pop()}`;
    let bucket = buckets.get(key);
    if (!bucket && buckets.size >= maxEntries) {
      for (const [candidateKey, candidate] of buckets) {
        if (timestamp >= candidate.resetAt) buckets.delete(candidateKey);
      }
      if (buckets.size >= maxEntries) {
        buckets.delete(buckets.keys().next().value);
      }
    }
    if (!bucket || timestamp >= bucket.resetAt) {
      bucket = { count: 0, resetAt: timestamp + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    res.set({
      'RateLimit-Limit': String(max),
      'RateLimit-Remaining': String(Math.max(0, max - bucket.count)),
      'RateLimit-Reset': String(Math.ceil(bucket.resetAt / 1000))
    });

    if (bucket.count > max) {
      return jsonError(res, 429, 'too many requests');
    }
    return next();
  };
}

/**
 * Build the HTTP application around an injected statistics store.
 *
 * @param {{
 *   statsStore: object,
 *   contentIds: Set<string>,
 *   publicDir: string,
 *   logger?: Pick<Console, 'error'>,
 *   mutationLimit?: number,
 *   mutationWindowMs?: number
 * }} options
 */
function createApp(options) {
  if (!options || !options.statsStore || !options.publicDir) {
    throw new TypeError('createApp requires statsStore and publicDir');
  }

  const contentIds = options.contentIds || new Set();
  const logger = options.logger || console;
  const app = express();
  const limitMutation = createMutationLimiter({
    max: options.mutationLimit,
    windowMs: options.mutationWindowMs
  });

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': SECURITY_POLICY,
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff'
    });
    next();
  });

  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  function guard(handler) {
    return function guardedHandler(req, res) {
      try {
        handler(req, res);
      } catch (error) {
        logger.error(error);
        jsonError(res, 500, 'internal error');
      }
    };
  }

  function validateContentId(req, res, next) {
    const id = req.params.id;
    if (!isPortableContentId(id)) {
      return jsonError(res, 400, 'invalid content id');
    }
    if (!contentIds.has(id)) {
      return jsonError(res, 404, 'content not found');
    }
    return next();
  }

  app.get(
    '/api/content/stats',
    guard((req, res) => {
      const allStats = options.statsStore.getAllStats();
      const publishedStats = Object.create(null);
      for (const id of contentIds) {
        if (allStats[id]) publishedStats[id] = allStats[id];
      }
      res.json({ code: 0, data: publishedStats, message: 'ok' });
    })
  );

  app.get(
    '/api/content/:id/stats',
    validateContentId,
    guard((req, res) => {
      res.json({
        code: 0,
        data: options.statsStore.getStats(req.params.id),
        message: 'ok'
      });
    })
  );

  app.post(
    '/api/content/:id/view',
    validateContentId,
    limitMutation,
    guard((req, res) => {
      res.json({
        code: 0,
        data: { viewCount: options.statsStore.incrementView(req.params.id) },
        message: 'ok'
      });
    })
  );

  app.post(
    '/api/content/:id/like',
    validateContentId,
    limitMutation,
    guard((req, res) => {
      res.json({
        code: 0,
        data: { likeCount: options.statsStore.incrementLike(req.params.id) },
        message: 'ok'
      });
    })
  );

  app.use('/api', (req, res) => jsonError(res, 404, 'endpoint not found'));
  app.use(
    express.static(options.publicDir, {
      dotfiles: 'deny',
      index: 'index.html',
      redirect: false,
      setHeaders: setStaticCacheHeaders
    })
  );
  app.use((req, res) => res.status(404).type('text').send('Not found'));

  return app;
}

module.exports = {
  CONTENT_ID_PATTERN,
  createApp,
  createMutationLimiter,
  setStaticCacheHeaders
};
