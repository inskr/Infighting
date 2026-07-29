'use strict';

const path = require('path');
const { createApp } = require('./src/app');
const { loadContentIds } = require('./src/content-catalog');
const { createStatsStore } = require('./src/db');

function startServer(options = {}) {
  const publicDir = options.publicDir || path.join(__dirname, 'public');
  const databaseFile =
    options.databaseFile ||
    process.env.STATS_DB_PATH ||
    path.join(__dirname, 'data', 'stats.db');
  const statsStore = options.statsStore || createStatsStore({ filename: databaseFile });
  const contentIds =
    options.contentIds ||
    loadContentIds(path.join(publicDir, 'assets', 'js', 'posts-data.js'));

  const app = createApp({
    statsStore,
    contentIds,
    publicDir,
    logger: options.logger,
    mutationLimit: options.mutationLimit
  });
  const port = options.port ?? process.env.PORT ?? 3000;
  const server = app.listen(port, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    console.log(`Infighting server on ${actualPort}`);
  });
  server.once('close', () => statsStore.close());
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
