'use strict';

/**
 * Infighting - 单进程服务：托管静态站点 + 统计 API
 *
 * 静态站点与接口同源（均挂在项目根），前端 fetch 相对路径即可，免 CORS。
 * 统一响应体：{ code:0, data:{...}, message:"ok" }；异常时 code!=0。
 */

const path = require('path');
const express = require('express');
const db = require('./src/db');

const app = express();
app.use(express.json());

// 静态托管项目根（含 index.html / assets/ 等）
app.use(express.static(__dirname));

// 统一异常包裹：业务逻辑抛错时返回 code:1 + 500
function guard(handler) {
  return function (req, res) {
    try {
      handler(req, res);
    } catch (err) {
      res.status(500).json({
        code: 1,
        data: null,
        message: (err && err.message) || 'internal error'
      });
    }
  };
}

// 批量统计
app.get(
  '/api/content/stats',
  guard(function (req, res) {
    res.json({ code: 0, data: db.getAllStats(), message: 'ok' });
  })
);

// 单条统计
app.get(
  '/api/content/:id/stats',
  guard(function (req, res) {
    res.json({ code: 0, data: db.getStats(req.params.id), message: 'ok' });
  })
);

// 浏览 +1（原子）
app.post(
  '/api/content/:id/view',
  guard(function (req, res) {
    res.json({
      code: 0,
      data: { viewCount: db.incrementView(req.params.id) },
      message: 'ok'
    });
  })
);

// 点赞 +1（原子，可累加）
app.post(
  '/api/content/:id/like',
  guard(function (req, res) {
    res.json({
      code: 0,
      data: { likeCount: db.incrementLike(req.params.id) },
      message: 'ok'
    });
  })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('Infighting stats server on ' + PORT);
});
