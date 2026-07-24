# Infighting 博客 · 部署与维护手册

> 站点已成功部署：👉 https://inskr.github.io/Infighting/
> 部署方式：**GitHub Pages + GitHub Actions（免费）**，每日精选由云端自动抓取。

---

## 一、部署过程总结

本博客是一个**纯静态站点**：文章和「每日精选」都由 Node 脚本在本地或 CI 中生成数据文件，页面直接读取，浏览器无需后端。

### 1. 站点改造（部署前）
- **「每日精选」中英文分区**：`fetch-feeds.js` 由原本的 `embedded/edge` 板块改为 `en/zh` 语言分区，新增 `summary`、`lang` 字段；英文源 6 个（CNX Software、Hackaday、Embedded.com、The New Stack、EE Times、Hackster.io），中文源 3 个（Solidot、36氪、掘金）。
- **前端展示**：`index.html` + `assets/js/main.js` + `assets/css/style.css` 改为英文资讯在上方、中文在下方，各自独立成块，带语言标签与视觉分隔；语言标签显示为「国外 / 国内」。
- **分页体验**：文章列表翻页改为无刷新（pushState + 重渲染），翻页后滚动视图停留在「最新文章」标题位置，不回到页面顶部。
- **细节清理**：移除首页「保留原文语言」描述、移除关于页的「联系方式」卡片。

### 2. 选定部署方案
对比三种方式后选择 **GitHub Pages + Actions**：
| 方式 | 成本 | 每日自动抓取 | 结论 |
|---|---|---|---|
| 自有服务器 + Nginx | 需买 VPS | 需自己配 cron | 较重 |
| 免费静态托管（无 Actions） | 免费 | ❌ 冻结在提交时 | 不满足自动更新 |
| **GitHub Pages + Actions** | **免费** | ✅ 云端每天跑 | **采用** |

### 3. 本地准备与推送（关键步骤回顾）
1. 初始化 git，提交 24 个文件（含 `.github/`、`DEPLOY.md`、`.nojekyll`、脚本与生成数据），分支改名 `main`。
2. **安全隔离**：`.gitignore` 加入 `.workbuddy/`，确保私有记忆与自动化配置**不进公开仓库**（已用 `git check-ignore` 验证无泄漏）。
3. 网络绕障：默认 DNS 把 `github.com` 劫持到 `127.0.0.1`，改用公共 DNS 解析出真实 IP、临时写 `hosts` 打通连接（完成后已还原）。
4. SSH 推送：在 GitHub 登记本机 `~/.ssh/id_rsa.pub`，远端合并原有的 `LICENSE` 提交后 `git push -u origin main` 成功。

### 4. 修复 Pages 启用报错
首次部署报 `Get Pages site failed / Not Found`。根因是仓库 Pages 未以 GitHub Actions 模式启用（且须为 Public 仓库）。已给工作流 `deploy-pages` 步骤加 `enablement: true` 自动启用 Pages，并提示在 **Settings → Pages → Source 选「GitHub Actions」**，重跑后部署成功。

### 5. 收尾
删除本地重复的每日 8:00 自动化任务（云端 Actions 已接管抓取），部署闭环完成。

---

## 二、站点架构速览

| 类型 | 文件 | 说明 |
|---|---|---|
| 静态页面 | `index.html` `about.html` `post.html` `tags.html` | 直接给浏览器 |
| 静态资源 | `assets/`（css/js） `vendor/` `1.jpg` | 直接给浏览器 |
| 文章源 | `posts/*.md` | 生成用原料，**需提交进仓库** |
| 生成脚本 | `build.js` `fetch-feeds.js` | 仅用 Node 内置模块，CI 无需 `npm install` |
| 生成产物 | `assets/js/posts-data.js`（文章）<br>`assets/js/feed-data.js`（每日精选） | CI 自动生成；**不必手动改** |

> 真相：真正上线的是 HTML + assets + vendor + 图片；`posts/`、`build.js`、`fetch-feeds.js` 是「生产工具」，会一并进仓库，只在构建时使用。

---

## 三、如何添加一篇新博客（日常最重要）

**只需 3 步，全程不用跑脚本、不用碰生成文件。**

### 步骤 1：在 `posts/` 新建一个 `.md` 文件
文件名建议格式：`YYYY-MM-DD-你的英文短链.md`，例如 `2026-07-23-my-new-post.md`。

文件内容分两部分——**frontmatter（顶部 `---` 包裹的元数据）** 和 **正文（markdown）**：

```markdown
---
id: my-new-post
title: 我的新博客标题
date: 2026-07-23
tags: [STM32, 嵌入式, 经验总结]
summary: 一句话摘要，会显示在首页文章列表卡片上，建议 30 字内说清看点。
---

## 开头

在这里写正文，支持标准 Markdown：标题、列表、代码块、链接等。

### 小节示例

- 要点一
- 要点二

\`\`\`c
// 代码块示例
void loop(void) { /* ... */ }
\`\`\`
```

**frontmatter 字段说明**（字段名必须是英文，`\w+` 形式）：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 建议填 | 文章唯一标识，通常用文件名里的短链（不含日期）。不填则自动取文件名。 |
| `title` | 必填 | 文章标题，显示在列表和详情页。 |
| `date` | 必填 | 发布日期 `YYYY-MM-DD`，决定列表排序（新的在前）。 |
| `tags` | 可选 | 标签数组，用方括号写法：`[标签1, 标签2]`，会进入标签筛选页。 |
| `summary` | 建议填 | 列表卡片摘要；不填则卡片无摘要。 |
| `type` | 可选 | 默认 `post`；如需其他类型可自定义。 |

> 注意：`tags` 必须写成 `[A, B, C]` 形式，`build.js` 才能识别为数组。

### 步骤 2：提交并推送
```bash
cd F:/项目/个人网站-WorkBuddy
git add posts/你的文件.md
git commit -m "post: 添加《我的新博客标题》"
git push origin main
```

### 步骤 3：等 CI 自动发布（无需手动操作）
push 后 **Actions 会自动执行 `build.js`**，把你的 `.md` 编译进 `assets/js/posts-data.js` 并发布。一般 1 分钟内完成，刷新站点即可看到新文章。

> 想本地先预览？在本地跑一次 `node build.js` 再打开 `index.html` 即可（预览完不必提交生成的 `posts-data.js`，CI 会重新生成）。

### 常见坑
- **改了文章却不更新？** 确认已 `git push` 到 `main`；去仓库 **Actions** 页看是否跑成功（绿勾）。
- **标签不显示？** 检查 `tags` 是否用了 `[...]` 方括号写法。
- **日期排序不对？** `date` 必须是 `YYYY-MM-DD`；列表按日期倒序，日期填错会排到后面。

---

## 四、日常维护

| 场景 | 你要做的 | 结果 |
|---|---|---|
| 发新文章 | `posts/` 加 `.md` → `git add/commit/push` | Actions 自动 `build.js` 并发布 |
| 每日精选 | **什么都不用做** | 每天 08:00（北京）Actions 自动 `fetch-feeds.js` 并发布 |
| 改样式/页面/关于页 | 改完 `git push` | 自动发布 |
| 加 RSS 源 | 改 `fetch-feeds.js` 里的 `feeds` 配置 → push | 次日抓取即生效 |

- **定时规则**：`.github/workflows/deploy.yml` 中 `cron: "0 0 * * *"` = UTC 00:00 = 北京时间 08:00。改时间改这里（注意用 UTC）。
- **抓取容错**：`fetch-feeds.js` 步骤设了 `continue-on-error`，某天 RSS 源失败也不会中断部署，页面继续展示上一次成功数据。
- **内容过滤**：`fetch-feeds.js` 内置领域相关性机制——关键词计分（核心词 2 分/外围词 1 分，入选线 3 分或「核心词+2 分」）、负向词排除（股市行情/人事变动等非技术内容）、14 天时间窗、标题近似去重，确保精选与嵌入式/边缘 AI/物联网紧密相关。词表在文件顶部 `CORE_KEYWORDS` / `RELATED_KEYWORDS` / `NEGATIVE_KEYWORDS`，可按需调整。
- **精选归档**：每次抓取后自动把当天精选合并进 `assets/js/feed-archive.js`（同日覆盖，当日数据留存供次日归档），只保留最近 7 天（`ARCHIVE_DAYS` 常量），超出自动裁剪。归档页 `archive.html` 按天倒序展示，**渲染时自动排除当日**（当日精选在首页展示，两个模块内容不重复），从导航栏「精选归档」进入。
- **触发部署的三种方式**：push 到 `main` / 每天定时 / Actions 页手动 **Run workflow**。

---

## 五、可选：绑定自己的域名

1. GitHub 仓库 **Settings → Pages → Custom domain** 填写你的域名。
2. 在域名服务商添加一条 **CNAME 记录**指向 `inskr.github.io`。
3. 仓库会自动生成 `CNAME` 文件，等待生效即可用自有域名访问。

---

## 六、故障排查速查

| 现象 | 可能原因 | 处理 |
|---|---|---|
| Actions 报 `Get Pages site failed` | Pages 未以 Actions 模式启用 / 仓库为私有 | Settings→Pages→Source 选 GitHub Actions；私有仓改为 Public |
| 站点空白/文章不显示 | 未 push 或 push 到非 `main` | 确认推到 `main`，Actions 跑成功 |
| 每日精选不更新 | 云端抓取失败被 `continue-on-error` 吞掉 | 去 Actions 日志看 `fetch-feeds` 步骤输出 |
| `git push` 连不上 github | 本机 DNS 劫持 github.com | 检查 `C:\Windows\System32\drivers\etc\hosts` 或网络环境 |
