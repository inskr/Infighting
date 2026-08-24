'use strict';

const path = require('path');
const { createApp } = require('../../src/app');
const { loadContentIds } = require('../../src/content-catalog');

function createInMemoryStatsStore() {
  const stats = new Map();

  function getStats(id) {
    return stats.get(id) || { viewCount: 0, likeCount: 0 };
  }

  return {
    getStats,
    getAllStats() {
      const allStats = Object.create(null);
      for (const [id, value] of stats) allStats[id] = { ...value };
      return allStats;
    },
    incrementView(id) {
      const value = getStats(id);
      const next = { ...value, viewCount: value.viewCount + 1 };
      stats.set(id, next);
      return next.viewCount;
    },
    incrementLike(id) {
      const value = getStats(id);
      const next = { ...value, likeCount: value.likeCount + 1 };
      stats.set(id, next);
      return next.likeCount;
    },
    close() {}
  };
}

const rootDir = path.resolve(__dirname, '../..');
const publicDir = path.join(rootDir, 'public');
const app = createApp({
  statsStore: createInMemoryStatsStore(),
  contentIds: loadContentIds(path.join(publicDir, 'assets', 'js', 'posts-index.js')),
  publicDir
});
const port = Number(process.env.PORT || 4173);
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Browser test server listening on ${port}`);
});

function stop() {
  server.close(() => process.exit(0));
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
