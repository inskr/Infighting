'use strict';

/**
 * Infighting - 统计数据库层（better-sqlite3 同步单连接）
 *
 * 全进程共享同一个 Database 实例；自增采用单条原子 SQL：
 *   INSERT OR IGNORE -> UPDATE col = col + 1 -> SELECT
 * 读-改-写在 SQLite 引擎内部完成，JS 侧无竞态，无需显式事务。
 *
 * 供 server.js 与 Node 端 QA（require('../src/db')）复用。
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// 数据库文件位于项目根 data/stats.db（相对 __dirname 计算，摆脱 cwd 依赖）
const dbPath = path.join(__dirname, '..', 'data', 'stats.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// 建表（幂等）
db.exec(
  'CREATE TABLE IF NOT EXISTS content_stats (' +
    'id          TEXT PRIMARY KEY,' +
    'view_count  INTEGER NOT NULL DEFAULT 0,' +
    'like_count  INTEGER NOT NULL DEFAULT 0' +
    ')'
);

// 预编译语句（prepare 只做一次，复用更安全高效）
const stmtGetOne = db.prepare(
  'SELECT view_count, like_count FROM content_stats WHERE id = ?'
);
const stmtGetAll = db.prepare(
  'SELECT id, view_count, like_count FROM content_stats'
);
const stmtInsert = db.prepare(
  'INSERT OR IGNORE INTO content_stats (id) VALUES (?)'
);
const stmtIncView = db.prepare(
  'UPDATE content_stats SET view_count = view_count + 1 WHERE id = ?'
);
const stmtIncLike = db.prepare(
  'UPDATE content_stats SET like_count = like_count + 1 WHERE id = ?'
);
const stmtSelView = db.prepare('SELECT view_count FROM content_stats WHERE id = ?');
const stmtSelLike = db.prepare('SELECT like_count FROM content_stats WHERE id = ?');

/**
 * 读取单条统计；不存在则返回全 0。
 * @param {string} id
 * @returns {{viewCount:number, likeCount:number}}
 */
function getStats(id) {
  const row = stmtGetOne.get(id);
  if (!row) return { viewCount: 0, likeCount: 0 };
  return { viewCount: row.view_count, likeCount: row.like_count };
}

/**
 * 读取全部统计，整理为 { [id]: { viewCount, likeCount } }。
 * @returns {Object<string, {viewCount:number, likeCount:number}>}
 */
function getAllStats() {
  const rows = stmtGetAll.all();
  const map = {};
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    map[r.id] = { viewCount: r.view_count, likeCount: r.like_count };
  }
  return map;
}

/**
 * 原子浏览 +1，返回最新浏览数。
 * @param {string} id
 * @returns {number}
 */
function incrementView(id) {
  stmtInsert.run(id);
  stmtIncView.run(id);
  const row = stmtSelView.get(id);
  return row ? row.view_count : 0;
}

/**
 * 原子点赞 +1（可累加），返回最新点赞数。
 * @param {string} id
 * @returns {number}
 */
function incrementLike(id) {
  stmtInsert.run(id);
  stmtIncLike.run(id);
  const row = stmtSelLike.get(id);
  return row ? row.like_count : 0;
}

module.exports = {
  getStats: getStats,
  getAllStats: getAllStats,
  incrementView: incrementView,
  incrementLike: incrementLike
};
