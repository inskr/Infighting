/* Infighting - transitional article rendering and reveal effects */
(function () {
  "use strict";

  /* ---------- 工具函数 ---------- */
  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- 滚动渐入动效 ---------- */
  function initReveal() {
    if (!("IntersectionObserver" in window)) return;
    var targets = document.querySelectorAll(
      ".hero, .page-intro, .post-card, .article, .board, .archive-day"
    );
    targets.forEach(function (el, i) {
      el.classList.add("reveal");
      el.style.transitionDelay = Math.min(i % 6, 5) * 60 + "ms";
    });
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0 }
    );
    var documentElement = document.documentElement;
    var viewportHeight =
      window.innerHeight || (documentElement && documentElement.clientHeight) || 800;
    targets.forEach(function (el) {
      if (el.getBoundingClientRect().top <= viewportHeight * 1.08) {
        el.classList.add("visible");
        return;
      }
      observer.observe(el);
    });
  }

  /* ---------- 文章详情页 ---------- */
  async function renderPost() {
    var container = document.getElementById("article");
    if (!container) return;

    var id = getParam("id");
    var all = window.POSTS || [];
    container.innerHTML =
      '<div class="article glass-surface"><p>文章加载中…</p></div>';

    var isValidId = window.PostLoader.isValidPostId(id);
    var indexedPost = isValidId && all.find(function (post) {
      return post && post.id === id;
    });
    if (!indexedPost) {
      container.innerHTML = window.PostView.errorCardHtml({
        code: isValidId ? "NOT_FOUND" : "INVALID_ID",
      });
      return;
    }

    var post;
    try {
      post = await window.PostLoader.loadPost(window, id);
    } catch (error) {
      container.innerHTML = window.PostView.errorCardHtml(error);
      return;
    }

    document.title = post.title + " · Infighting";
    window.SiteShell.init(window, post.type === "page" ? "" : "home");

    var html =
      '<a class="back-link" href="index.html">&larr; 返回文章列表</a>' +
      '<article class="article glass-surface">' +
      '<header class="article-header">' +
      "<h1>" +
      escapeHtml(post.title) +
      "</h1>" +
      '<div class="post-meta" data-shared-meta></div>' +
      "</header>" +
      '<div class="article-body">' +
      marked.parse(post.content) +
      "</div>" +
      '<div data-shared-stats></div>' +
      "</article>";

    // 上一篇 / 下一篇（仅普通文章之间导航）
    var normals = all.filter(function (p) {
      return p.type !== "page";
    });
    var ni = normals.findIndex(function (p) {
      return p.id === id;
    });
    if (ni !== -1) {
      var navHtml = '<div class="article-nav">';
      if (ni > 0) {
        navHtml +=
          '<a class="prev" href="posts/' +
          encodeURIComponent(normals[ni - 1].id) +
          '.html"><span class="nav-label">上一篇</span>' +
          escapeHtml(normals[ni - 1].title) +
          "</a>";
      } else {
        navHtml += "<span></span>";
      }
      if (ni < normals.length - 1) {
        navHtml +=
          '<a class="next" href="posts/' +
          encodeURIComponent(normals[ni + 1].id) +
          '.html"><span class="nav-label">下一篇</span>' +
          escapeHtml(normals[ni + 1].title) +
          "</a>";
      } else {
        navHtml += "<span></span>";
      }
      navHtml += "</div>";
      html += navHtml;
    }

    container.innerHTML = html;

    // Reuse the shared DOM-safe metadata and cached-stat renderers while this
    // transitional dynamic article path remains in main.js.
    var metaPlaceholder = container.querySelector("[data-shared-meta]");
    var statsPlaceholder = container.querySelector("[data-shared-stats]");
    if (metaPlaceholder || statsPlaceholder) {
      var sharedCard = window.ContentCards.postCard(window, post);
      var sharedMeta = sharedCard.querySelector(".post-meta");
      if (metaPlaceholder && sharedMeta) metaPlaceholder.replaceWith(sharedMeta);
      var sharedStats = sharedCard.querySelector(".stats-bar");
      if (statsPlaceholder && sharedStats) statsPlaceholder.replaceWith(sharedStats);
    }

    window.PostView.decorateArticleImages(container);

    // 进入详情页：上报浏览（+1）并回填最新浏览数
    if (window.Stats && id) {
      window.Stats
        .reportView(id)
        .then(function (viewCount) {
          var viewEl = container.querySelector(".article .stats-bar .view-count-num");
          if (viewEl) viewEl.textContent = window.Stats.formatCount(viewCount);
        })
        .catch(function () {
          /* 网络失败：维持共享统计条的初始缓存值 */
        });

      // 同时拉取最新统计，回填点赞数（浏览数交由 reportView 负责，
      // 避免与 reportView 并发时读到 +1 落库前的旧值并覆盖导致计数回退）
      window.Stats
        .fetchStats(id)
        .then(function (data) {
          if (!data) return;
          var likeEl = container.querySelector(".article .stats-bar .like-count");
          if (likeEl) likeEl.textContent = window.Stats.formatCount(data.likeCount || 0);
        })
        .catch(function () {
          /* 忽略 */
        });
    }

    // 代码高亮
    container.querySelectorAll("pre code").forEach(function (block) {
      hljs.highlightElement(block);
    });

    // 表格响应式包裹
    container.querySelectorAll(".article-body table").forEach(function (table) {
      var wrapper = document.createElement("div");
      wrapper.className = "table-wrapper";
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  /* ---------- 启动 ---------- */
  async function init() {
    if (document.getElementById("article")) {
      await renderPost();
    }
    initReveal();
  }

  init();
})();
