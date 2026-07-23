# Infighting 博客部署指南（GitHub Pages + Actions，免费）

本方案完全免费，且由 GitHub Actions 在**云端每天自动抓取「每日精选」**，
不依赖你本机开机。发新文章只需 push，Actions 会自动构建并发布。

---

## 一、准备工作（只做一次）

### 1. 本地初始化 git 并推到 GitHub

```bash
cd F:/项目/个人网站-WorkBuddy
git init
git add .
git commit -m "init: Infighting blog"
git branch -M main
# 在 GitHub 新建一个仓库（Public 才享受免费 Pages + Actions），拿到地址后：
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

> 仓库建议设为 **Public**。私有仓库的 GitHub Pages / Actions 有额度限制。

### 2. 在 GitHub 打开 Pages

仓库页面 → **Settings → Pages → Build and deployment → Source** 选
**「GitHub Actions」**（不是 Deploy from a branch）。保存即可。

### 3. 触发首次部署

push 后 Actions 会自动跑；也可在 **Actions 标签页 → Build & Deploy →
Run workflow** 手动触发一次。跑完后访问：

```
https://<你的用户名>.github.io/<仓库名>/
```

---

## 二、日常使用

| 场景 | 你要做的 | 结果 |
|---|---|---|
| 发新文章 | 在 `posts/` 加 `.md`，`git add/commit/push` | Actions 自动 `build.js` 并发布 |
| 每日精选 | **什么都不用做** | 每天 08:00（北京时间）Actions 自动 `fetch-feeds.js` 并发布 |
| 改样式/页面 | 改完 push | 自动发布 |

定时规则在 `.github/workflows/deploy.yml`：
`cron: "0 0 * * *"` 即 UTC 00:00 = 北京时间 08:00。想改时间改这里即可。

---

## 三、可选：绑定自己的域名

Settings → Pages → Custom domain 填域名，并在域名服务商加一条
CNAME 记录指向 `<你的用户名>.github.io`。仓库会自动生成 `CNAME` 文件。

---

## 四、说明

- 脚本 `build.js` / `fetch-feeds.js` 仅用 Node 内置模块，CI 无需 `npm install`。
- `fetch-feeds.js` 步骤设了 `continue-on-error`：某天 RSS 源抓取失败也不会
  中断部署，页面继续展示上一次成功抓取的数据。
- `posts/`、脚本会一并进仓库，但它们只在构建时使用，不影响访问性能。
