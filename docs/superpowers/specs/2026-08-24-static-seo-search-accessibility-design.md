# Static SEO, Search, Accessibility, and Frontend Modules Design

## Goal

在保留原生 HTML/CSS/JavaScript、Node.js 构建脚本、GitHub Pages 和 Express 自托管能力的前提下，将 Infighting 升级为可被搜索引擎稳定收录、可全文检索、达到 WCAG 2.2 AA 目标、按页面加载前端行为并具有可量化性能预算的静态技术博客。

本设计不新增个人品牌、作者介绍或关于页面。

## Success Criteria

- 每篇文章发布为 `posts/<id>.html`，正文存在于初始 HTML。
- 旧地址 `post.html?id=<id>` 在验证 ID 后兼容跳转；非法或不存在的 ID 显示可恢复错误。
- canonical、sitemap 和 RSS 使用 `https://inskr.github.io/Infighting/` 作为站点根地址。
- 新增可分享的 `search.html?q=<query>` 全文搜索页，检索标题、摘要、标签和正文。
- 首页、搜索、标签、归档和文章页满足设计中的 WCAG 2.2 AA 验收范围。
- 删除承担多页面职责的 `main.js`，由较深的页面 Module 和共享 Module 接管行为。
- 页面按需加载脚本；文章页不再请求正文 JSON；性能预算进入自动化检查。
- 现有主题、资讯抓取、统计、点赞、安全策略、GitHub Pages 和 Express 部署继续工作。

## Constraints

- 保留原生 JavaScript，不迁移到 Astro、Eleventy、React 或其他框架。
- 保留 `public/` 作为唯一发布目录。
- 保留现有文章 ID 规则：`[A-Za-z0-9][A-Za-z0-9_-]{0,127}`，包括大小写折叠冲突和 Windows 保留名限制。
- GitHub Pages 部署位于 `/Infighting/` 子路径；Express 自托管仍可位于站点根路径。
- 嵌套文章页的运行时资源使用相对 URL；SEO 产物使用绝对站点 URL。
- 每日精选资讯不进入长期文章搜索索引。
- 不重新引入已移除的 about 页面。

## Chosen Approach

采用渐进式静态生成。现有 Node 构建链扩展为一个深的内容发布 Module，一次读取 Markdown 源文章，统一生成文章 HTML、文章目录数据、列表元数据、全文搜索索引、sitemap 和 RSS。浏览器端 JavaScript只提供统计、点赞、主题、搜索和交互增强，不承担文章正文的首次渲染。

没有选择半静态文章壳，因为它会保留两套正文渲染路径，降低 locality 并扩大测试表面。没有迁移静态站点框架，因为当前内容规模和既有测试体系不足以抵消全面迁移成本。

## Publishing Architecture

### Content publication Module

构建侧提供一个主要 Interface，例如 `buildSite(options)`。调用者只需提供源目录、发布目录、站点根地址和构建选项。以下行为属于其 Implementation，不暴露为多个调用方必须协调的浅 Interface：

1. 读取和验证 Markdown frontmatter 与文章 ID。
2. 将 Markdown 渲染为可信文章 HTML。
3. 从标题层级生成稳定、唯一的 heading ID 和文章目录。
4. 生成文章页、文章索引、搜索索引、sitemap 和 RSS。
5. 校验所有站内文章链接和生成产物。
6. 先写入同一父目录下的临时构建目录，全部成功后再替换受管理的生成结果。

生成数据流：

```text
posts/*.md
   |
   v
content publication Module
   +-- public/posts/<id>.html
   +-- public/assets/js/posts-index.js
   +-- public/assets/search-index.json
   +-- public/sitemap.xml
   +-- public/rss.xml
   +-- public/assets/posts/<id>.json (compatibility period)
```

生成文件必须确定性排序和序列化。同一输入在不同机器上产生相同文本结果，日期和文章 ID 作为稳定排序依据。

### Static article pages

每篇 `posts/<id>.html` 包含：

- 独立的 title 和 description。
- canonical：`https://inskr.github.io/Infighting/posts/<id>.html`。
- Open Graph 和 Twitter Card 元数据。
- `BlogPosting` JSON-LD，包括标题、发布日期、摘要、canonical URL 和标签。
- 已渲染正文、文章目录、上一篇/下一篇和相关文章容器。
- 文章 ID 的可信 `data-*` 标记，供统计和点赞增强使用。
- 指向首页、标签、归档、搜索、CSS 和脚本的相对 URL。

文章元数据、JSON-LD、XML 和正文模板值必须按目标上下文分别进行 HTML、JSON 或 XML 转义，不能复用错误上下文的转义函数。

现有 `public/assets/posts/<id>.json` 在兼容期保留，以免立即破坏旧缓存或未发现的调用方，但新文章页不请求它。确认没有运行时消费者后可在独立变更中删除。

### Legacy article URL

`post.html` 变为兼容入口：

1. 读取 `id` 查询参数。
2. 使用与构建端一致的 ID 规则验证。
3. 在已发布文章索引中确认 ID 存在。
4. 使用 `location.replace('posts/' + encodeURIComponent(id) + '.html')` 跳转，避免浏览历史形成往返循环。
5. 缺失、非法或不存在的 ID 显示错误标题、说明和返回文章列表链接，不上报浏览量。

### Sitemap and RSS

`sitemap.xml` 收录首页、标签、归档、搜索页和所有独立文章页，不收录旧 `post.html?id=...` 地址。文章使用源文件日期作为 `lastmod`，避免每次构建制造虚假更新时间。

`rss.xml` 包含所有技术文章，按日期倒序，至少包含标题、摘要、发布日期、标签、绝对文章链接和稳定 GUID。RSS 不包含每日精选资讯。首页 `<head>` 暴露 RSS discovery link。

## Search and Content Discovery

### Search index

构建时生成 `public/assets/search-index.json`。每条记录包含：

- `id`
- `title`
- `summary`
- `tags`
- `date`
- `url`
- 正文纯文本

正文索引去除 HTML 标签和纯装饰内容，但保留技术标识符与代码文本，以便检索 MCU 型号、函数名和协议名。索引不包含每日精选资讯。

### Query behavior

新增 `search.html?q=<query>`，并在全站主导航加入“搜索”。行为如下：

- 空查询不请求索引，并显示简短搜索说明。
- 第一次有效查询时加载索引，此后在当前页面会话复用。
- 输入使用短防抖，查询状态同步到 URL，浏览器前进/后退能恢复搜索结果。
- 中文使用规范化后的连续文本匹配。
- 拉丁字母和技术标识符使用不区分大小写的词项匹配，同时支持完整短语。
- 排序权重为标题、标签、摘要、正文；完整短语额外加权；同分按发布日期和 ID 稳定排序。
- 结果显示标题、日期、标签和命中位置附近的短片段。
- 片段和高亮通过安全 DOM 或正确转义构建，不把索引文本直接写入不可信 `innerHTML`。
- 无结果状态提供清除查询与打开标签页的入口。
- 索引加载或解析失败时显示可重试错误，不显示空白结果。

### Reading paths

- 文章页生成语义化目录导航。
- 保留上一篇/下一篇导航并迁移到新 URL。
- 根据标签重合数量计算相关文章；同分按日期和 ID 稳定排序，并限制显示数量。
- 首页、标签页、搜索结果、目录和相关文章全部链接到 `posts/<id>.html`。
- 资讯归档保持独立，不伪装成文章归档，也不混入文章搜索。

## Frontend Module Design

删除 `public/assets/js/main.js`。按页面行为形成较深的 Module：

- `site-shell.js`：共享年份、当前导航状态、跳到主要内容和全站状态播报。
- `content-cards.js`：文章卡片、标签链接和统计展示，供首页、标签和搜索使用。
- `home-page.js`：首页文章列表、分页和每日精选。
- `search-page.js`：索引获取、查询解析、评分、片段和 URL 状态。
- `tags-page.js`：标签聚合、筛选和对应文章列表。
- `archive-page.js`：每日精选历史归档。
- `article-page.js`：静态文章增强、目录状态、点赞、统计和相关文章。
- `home-effects.js`：仅首页需要的 Hero 和 Canvas 行为。
- `ui-effects.js`：仅保留两个或更多页面实际共享的轻量视觉行为。

每个 HTML 页面只加载自身需要的页面 Module 和共享依赖。页面 Module 的 Interface 是其初始化入口及少量可测试的纯行为；页面之间不互相调用初始化函数。

`stats.js`、`likes-storage.js`、`theme.js` 和 `url-policy.js` 保持已有 seam。只有出现两个真实 Adapter 时才新增可替换 Interface，避免为单一实现制造假 seam。

## Accessibility Design

目标为 WCAG 2.2 AA；自动化检查不等同于完整合规声明。

### Page requirements

- 每页正文前提供第一个可聚焦的“跳到主要内容”链接。
- 主内容使用稳定 `id`，页面只有一个主 landmark 和一个一级标题。
- 当前导航项使用 `aria-current="page"`。
- 键盘焦点使用清晰的 `:focus-visible`，且不被粘性导航遮挡。
- 搜索输入有可见 label；清除按钮、提交行为和结果区域有明确名称。
- 搜索加载、结果数量、无结果、点赞成功和点赞回滚通过合适的 `aria-live` 区域播报，避免重复或打断式播报。
- 分页、文章目录、上一篇/下一篇和相关文章使用语义化导航及清晰的可访问名称。
- 所有可交互目标保持至少 44 x 44 CSS px。
- 320px 宽度与 200% 缩放下不丢失内容，不产生页面级双向滚动；代码块和表格可在自身区域横向滚动。
- 深浅主题的正文、链接、按钮、焦点环和状态文本满足 AA 对比度。
- `prefers-reduced-motion: reduce` 下关闭 Hero、Canvas、滚动渐入、弹性跟随和平滑滚动。
- Canvas 和纯装饰视觉继续对辅助技术隐藏。

### Accessibility verification

- 使用 Playwright 加载真实构建页面，并使用 axe 检查首页、搜索页、标签页、归档页和至少一篇文章页。
- serious 和 critical axe 问题必须为零。
- 浏览器测试覆盖键盘访问搜索、清除查询、打开结果、文章目录、分页和点赞。
- 人工清单覆盖主题对比度、200% 缩放、320px reflow、键盘顺序、屏幕阅读器播报和减少动画。

## Performance Design

### Budgets

- 移动端 Lighthouse Performance 分数至少 90。
- Lighthouse Accessibility 分数至少 95，同时保留 axe 的独立阈值。
- 实验室 LCP 不高于 2.5 秒，CLS 不高于 0.1，TBT 不高于 200ms。
- 发布 CSS 总大小不超过 50 KB 未压缩。
- 搜索索引初始 gzip 大小不超过 150 KB；超出后改为元数据清单加按需分片，而不是提高预算。
- 首页不加载搜索页或文章页 Module。
- 搜索索引只在有效查询出现后加载。
- 文章页不请求正文 JSON。

### Runtime behavior

- 保留响应式 AVIF/WebP Hero、尺寸属性、缓存策略和正文图片懒加载。
- 粗指针或移动设备不启动 Canvas 粒子；减少动画偏好关闭所有持续动画。
- 视觉效果不得造成布局位移，连续动画只修改合成友好的属性。
- 页面脚本使用 `defer` 并按依赖顺序加载；主题预初始化仍在 CSS 前运行以避免闪烁。

性能测试运行在固定构建、固定页面和固定 Lighthouse 配置上。若 CI 机器波动导致分数不稳定，以核心指标和资源预算作为硬门槛，分数用于趋势告警。

## Error Handling and Security

- 搜索索引网络或解析失败显示重试入口，并保留用户查询。
- 旧 URL 在验证和目录确认前不拼接跳转目标。
- 不存在的文章不请求统计，也不产生数据库记录。
- 统计和点赞失败不影响正文阅读；乐观更新回滚并播报结果。
- 所有生成 HTML、JSON-LD、JSON、XML 和 URL 分别使用适合上下文的编码。
- 继续执行现有 CSP、外链 URL policy、静态发布隔离、API 限流和错误隐藏规则。
- 构建在临时目录完成并验证后替换受管理输出；失败保留上一次完整发布结果。

## Testing Strategy

### Unit tests

- Markdown 元数据、heading ID 和目录生成。
- 搜索规范化、中文匹配、英文词项、权重、稳定排序和片段。
- 相关文章评分和稳定排序。
- HTML、JSON、XML 与 URL 上下文编码。
- 旧文章 ID 验证和跳转目标。
- 各页面 Module 的初始化与错误状态。

### Build contract tests

- 每篇文章产生独立 HTML 且包含正文、唯一元数据和 JSON-LD。
- 文章列表、标签、上一篇/下一篇和相关文章不再输出旧查询 URL。
- sitemap 只包含 canonical 地址。
- RSS 是合法 XML，链接和 GUID 稳定。
- 搜索索引不包含每日精选且符合大小预算。
- 故意制造构建错误时不会留下半套输出。

### Browser and accessibility tests

- Playwright 覆盖首页、搜索、标签、归档、旧 URL 和静态文章主路径。
- axe 检查主要静态与动态状态。
- 键盘、焦点、URL 历史、减少动画和搜索失败恢复测试。

### Performance and regression tests

- Lighthouse 检查代表页面和既定指标。
- 静态脚本映射和字节预算测试确保页面按需加载。
- 现有安全、并发、主题、统计、点赞、图片、资讯过滤和缓存测试继续通过。

## Delivery Sequence

1. 深化内容发布 Module，并生成独立文章 HTML、SEO 元数据、sitemap 和 RSS。
2. 迁移站内链接并实现旧 URL 兼容入口。
3. 生成全文索引并实现独立搜索页与阅读路径。
4. 拆分 `main.js`，切换为页面专属 Module 和脚本映射。
5. 完成 WCAG 2.2 AA 页面改造与 Playwright/axe 验收。
6. 加入 Lighthouse 和资源预算，针对测得的瓶颈收尾优化。
7. 运行生产构建、完整回归、浏览器冒烟与发布产物检查。

每一步都必须保持可构建、可测试，并保留 GitHub Pages 与 Express 两种部署方式。
