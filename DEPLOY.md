# Infighting 部署指南

项目支持纯静态 GitHub Pages 和 Node.js 自托管两种方式。两种方式使用同一份 `public/` 静态产物。

## 方案一：GitHub Pages

仓库内的 `.github/workflows/deploy.yml` 会在以下场景运行：

- 推送到 `main`
- 每天 UTC 00:00（北京时间 08:00）
- 在 Actions 页面手动触发

工作流依次执行：

1. `node scripts/build-posts.js`
2. `node scripts/fetch-feeds.js`
3. 回写 `public/assets/js/feed-data.js` 和 `feed-archive.js`
4. 只上传 `public/` 到 GitHub Pages

首次部署时，在仓库的 **Settings → Pages** 中选择 **GitHub Actions**。工作流需要 `contents: write` 回写资讯数据，并需要 `pages: write`、`id-token: write` 发布 Pages。

纯静态环境没有 Express/SQLite，前端统计模块会自动使用 Abacus 公共计数服务。如果不希望向第三方计数服务发请求，可以在 `public/assets/js/stats.js` 中移除该回退，或改用自托管方案。

## 方案二：Node.js 自托管

### 环境要求

- Node.js 22+
- 可持久化的磁盘目录
- 生产环境建议使用 HTTPS 反向代理

### 安装与启动

```bash
npm ci
npm run build
npm test
npm start
```

默认监听 `3000` 端口，SQLite 位于 `data/stats.db`。

Linux 示例：

```bash
PORT=8080 STATS_DB_PATH=/var/lib/infighting/stats.db npm start
```

PowerShell 示例：

```powershell
$env:PORT = "8080"
$env:STATS_DB_PATH = "D:\infighting-data\stats.db"
npm start
```

请把 `STATS_DB_PATH` 指向持久化卷，并定期备份该文件。不要把 `data/` 加入静态服务器或提交到 Git。

### 反向代理

反向代理应：

- 终止 TLS，并把请求转发到 Node 监听端口
- 保留应用返回的 CSP、`X-Content-Type-Options` 等安全头
- 限制请求体大小和连接速率
- 不额外暴露仓库根目录

应用默认不信任 `X-Forwarded-For`，因此限流使用实际 TCP 来源地址。在单层受控反向代理后部署时，若要按真实访客 IP 限流，应在确认代理会覆盖而非追加外部请求头后，再显式配置 Express 的 `trust proxy`。

## 日常维护

### 新增文章

1. 在 `posts/` 新建 Markdown 文件。
2. 运行 `npm run build`。
3. 运行 `npm test`。
4. 提交文章源文件和生成后的 `public/assets/js/posts-data.js`。

### 更新资讯

```bash
npm run feeds
```

抓取器会忽略单个失败的订阅源，保留符合领域关键词、时间窗和 URL 安全策略的条目，并更新最近 7 天归档。如果所有订阅源都失败，脚本会返回非零状态且不覆盖上一次成功生成的数据。

### 发布前检查

```bash
npm run build
npm test
npm audit
git status --short
```

确认部署物始终是 `public/`，而不是仓库根目录。
