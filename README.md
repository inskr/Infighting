# Infighting 个人博客（含服务端统计）

静态站点（首页文章列表 / 文章详情 / 标签筛选）由 Express 同进程托管，
并提供**点赞数、浏览数**的服务端统一计数接口（Express + better-sqlite3）。

## 部署

```bash
npm install      # 安装 express 与 better-sqlite3（Node 22 有预编译二进制）
npm start        # 启动，默认端口 3000
```

可用环境变量覆盖端口：

```bash
PORT=8080 npm start
```

启动后访问 http://localhost:3000 即可。静态站点与 API 同源，前端使用相对路径
`fetch('/api/content/...')`，无需额外配置 CORS。

## 统计接口

| 方法 | 路径 | 说明 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/content/stats` | 批量获取所有内容统计 | `{ [id]: { viewCount, likeCount } }` |
| GET | `/api/content/:id/stats` | 单条统计 | `{ viewCount, likeCount }` |
| POST | `/api/content/:id/view` | 浏览 +1（原子） | `{ viewCount }` |
| POST | `/api/content/:id/like` | 点赞 +1（可累加，原子） | `{ likeCount }` |

统一响应体：`{ code:0, data:{...}, message:"ok" }`；异常时 `code:1`。

## 数据存储

统计库文件位于 `data/stats.db`（SQLite），已被 `.gitignore` 忽略，不入库。
自增采用单条原子 SQL（INSERT OR IGNORE → UPDATE col = col + 1 → SELECT），
由 SQLite 引擎内部完成读-改-写，并发安全，无需显式事务。

## 本地验证

```bash
curl localhost:3000/api/content/abc123/view   # viewCount:1，再调一次返回 2
curl -X POST localhost:3000/api/content/abc123/like  # likeCount:1，再调返回 2
curl localhost:3000/api/content/abc123/stats   # { viewCount, likeCount }
node tests/stats.test.js                      # formatCount 纯函数单测
```
