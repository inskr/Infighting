'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

/**
 * Create the statistics store.
 *
 * Keeping database construction behind this interface gives the HTTP module a
 * real test seam: production uses a file-backed adapter while tests can use an
 * isolated temporary database.
 *
 * @param {{ filename: string }} options
 */
function createStatsStore(options) {
  if (!options || !options.filename) {
    throw new TypeError('createStatsStore requires a database filename');
  }

  const filename = path.resolve(options.filename);
  fs.mkdirSync(path.dirname(filename), { recursive: true });

  const database = new Database(filename);
  database.pragma('foreign_keys = ON');
  database.exec(
    'CREATE TABLE IF NOT EXISTS content_stats (' +
      'id TEXT PRIMARY KEY,' +
      'view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),' +
      'like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0)' +
      ')'
  );

  const getOne = database.prepare(
    'SELECT view_count, like_count FROM content_stats WHERE id = ?'
  );
  const getAll = database.prepare(
    'SELECT id, view_count, like_count FROM content_stats'
  );
  const incrementView = database.prepare(
    'INSERT INTO content_stats (id, view_count) VALUES (?, 1) ' +
      'ON CONFLICT(id) DO UPDATE SET view_count = view_count + 1 ' +
      'RETURNING view_count'
  );
  const incrementLike = database.prepare(
    'INSERT INTO content_stats (id, like_count) VALUES (?, 1) ' +
      'ON CONFLICT(id) DO UPDATE SET like_count = like_count + 1 ' +
      'RETURNING like_count'
  );

  return {
    getStats(id) {
      const row = getOne.get(id);
      return row
        ? { viewCount: row.view_count, likeCount: row.like_count }
        : { viewCount: 0, likeCount: 0 };
    },

    getAllStats() {
      const result = Object.create(null);
      for (const row of getAll.all()) {
        result[row.id] = {
          viewCount: row.view_count,
          likeCount: row.like_count
        };
      }
      return result;
    },

    incrementView(id) {
      return incrementView.get(id).view_count;
    },

    incrementLike(id) {
      return incrementLike.get(id).like_count;
    },

    close() {
      database.close();
    }
  };
}

module.exports = { createStatsStore };
