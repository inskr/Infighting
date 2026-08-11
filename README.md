# Infighting

Infighting 是一个面向嵌入式系统、边缘计算与边缘 AI 的个人技术博客。它既可以作为纯静态站点部署到 GitHub Pages，也可以由 Node.js + Express 自托管，并使用 SQLite 保存文章浏览数和点赞数。

## 主要功能

- Markdown 文章构建、按日期排序、分页、标签筛选和上一篇/下一篇导航
- 中英文技术资讯 RSS/Atom 聚合、关键词过滤、近似去重和 7 天归档
- 两种统计模式：
  - 自托管：Express + SQLite，同源统计接口
  - 纯静态：自动回退到 Abacus 公共计数服务
- 响应式布局、代码高亮、表格适配和滚动渐入效果
- 已点赞状态保存在浏览器 `localStorage`，不可用时自动降级到内存

## 项目结构

```text
.
├─ public/                  # 唯一可发布目录
│  ├─ *.html               # 首页、文章、标签、归档、关于页
│  ├─ assets/              # 样式、前端模块、响应式图片与构建后的文章/资讯数据
│  └─ vendor/              # 浏览器端 Markdown 与代码高亮库
├─ assets/images/           # Hero 高分辨率源图（不直接发布）
├─ posts/                   # Markdown 文章源文件
├─ scripts/
│  ├─ build-posts.js        # 生成元数据索引与 public/assets/posts/*.json
│  ├─ build-images.js       # 生成 Hero 的 AVIF/WebP/PNG 响应式资源
│  └─ fetch-feeds.js        # RSS/Atom -> 每日精选与归档数据
├─ src/
│  ├─ app.js                # HTTP 路由、安全策略、限流与静态托管
│  ├─ db.js                 # SQLite 统计存储模块
│  ├─ content-catalog.js    # 读取已发布文章 ID
│  └─ content-id.js         # 文章 ID 规则
├─ tests/                   # API、并发、安全和浏览器模块测试
├─ data/                    # 运行时 SQLite 数据，不纳入 Git
├─ server.js                # 自托管启动入口
└─ .github/workflows/       # GitHub Pages 自动构建与部署
```

`public/` 是部署和 HTTP 静态托管的唯一入口。源码、测试、数据库和仓库元数据不会被当作静态文件发布。

## 快速开始

需要 Node.js 22 或更高版本。

```bash
npm install
npm run build
npm start
```

打开 <http://localhost:3000>。

常用命令：

```bash
npm run build    # 重新生成文章索引、单篇正文与 Hero 响应式图片
npm run feeds    # 联网抓取每日精选并更新 7 天归档
npm test         # 运行完整回归测试
npm start        # 启动自托管站点与统计接口
```

可选环境变量：

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `PORT` | `3000` | HTTP 监听端口 |
| `STATS_DB_PATH` | `data/stats.db` | SQLite 文件位置 |

PowerShell 示例：

```powershell
$env:PORT = "8080"
$env:STATS_DB_PATH = "D:\data\infighting-stats.db"
npm start
```

## 发布文章

在 `posts/` 下新建 Markdown 文件：

```markdown
---
id: stm32-uart-dma
title: STM32 UART DMA 实践
date: 2026-07-29
tags: [STM32, DMA, 串口]
summary: 使用 DMA 和空闲中断实现稳定的串口接收。
---

## 正文

在这里编写 Markdown 内容。
```

文章 ID 必须符合 `[A-Za-z0-9][A-Za-z0-9_-]{0,127}`，同时不能使用 Windows 保留设备名（如 `CON`、`COM1`、`LPT1`）。ID 按 ASCII 大小写折叠后也必须唯一；构建会在写入文件前拒绝非法、保留或冲突的 ID，避免生成前端无法访问、后端无法统计的内容。

完成后运行：

```bash
npm run build
npm test
```

## 统计接口

自托管模式提供以下同源接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/content/stats` | 获取所有已发布文章的统计 |
| `GET` | `/api/content/:id/stats` | 获取单篇统计 |
| `POST` | `/api/content/:id/view` | 浏览数原子加一 |
| `POST` | `/api/content/:id/like` | 点赞数原子加一 |

成功响应：

```json
{ "code": 0, "data": { "viewCount": 1, "likeCount": 2 }, "message": "ok" }
```

接口只接受构建目录中实际存在的文章 ID。写请求带有按来源 IP、文章和动作划分的内存限流；SQLite 使用单条 UPSERT 完成计数，避免并发丢失更新。

## 安全设计

- 仅发布 `public/`，防止下载服务器源码、`package.json`、`.git` 或 SQLite 数据
- 外部资讯链接只允许无凭据的 `http:`/`https:` URL，并在抓取和渲染两处校验
- 页面和服务器同时设置内容安全策略；服务器补充 `nosniff`、Referrer Policy 和 Permissions Policy
- API 校验文章 ID 和发布目录，未知 ID 不会创建数据库记录
- 500 响应不返回内部异常信息
- 依赖可用 `npm audit` 检查；测试覆盖静态暴露、URL 协议、限流与 100+100 并发计数

点赞不是身份认证系统。浏览器本地防重复与服务端限流可以降低普通滥用，但无法抵御分布式刷量；若统计用于计费、排名或其他高价值决策，应接入登录、服务端幂等键和持久化限流。

## 部署

GitHub Pages 工作流会构建文章、抓取资讯，并且只上传 `public/`。自托管部署、环境变量和持久化建议见 [DEPLOY.md](DEPLOY.md)。

## License

[MIT](LICENSE)
