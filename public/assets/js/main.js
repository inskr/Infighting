/* Infighting - 主逻辑：文章列表分页、详情渲染、每日精选、动效 */
(function () {
  "use strict";

  var POSTS = (window.POSTS || []).filter(function (p) {
    return p.type !== "page";
  });
  var PAGE_SIZE = 4;

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

  function safeFeedHref(value) {
    if (!window.UrlPolicy) return "#";
    return window.UrlPolicy.safeExternalUrl(value) || "#";
  }

  function replaceWithPostCards(container, posts) {
    container.textContent = "";
    posts.forEach(function (post) {
      container.appendChild(window.ContentCards.postCard(window, post));
    });
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

  /* ---------- 首页：每日精选 ---------- */
  function feedLangLabel(code) {
    if (code === "en") return "国外";
    if (code === "zh") return "国内";
    return code || "";
  }

  function renderFeeds() {
    var boards = [
      { key: "en", el: document.getElementById("feed-en") },
      { key: "zh", el: document.getElementById("feed-zh") },
    ];
    if (!boards[0].el) return;

    var updatedEl = document.getElementById("feed-updated");
    var feeds = window.FEEDS;

    if (!feeds || !feeds.boards) {
      boards.forEach(function (b) {
        b.el.innerHTML =
          '<li class="feed-empty">今日内容尚未更新，请运行 fetch-feeds.js 抓取最新资讯。</li>';
      });
      if (updatedEl) updatedEl.textContent = "待更新";
      return;
    }

    if (updatedEl && feeds.updatedAt) {
      var d = new Date(feeds.updatedAt);
      updatedEl.textContent =
        "更新于 " +
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0");
    }

    boards.forEach(function (b) {
      var items = (feeds.boards[b.key] || []).slice(0, 8);
      if (!items.length) {
        b.el.innerHTML = '<li class="feed-empty">暂未获取到内容。</li>';
        return;
      }
      b.el.innerHTML = items
        .map(function (item) {
          return (
            "<li>" +
            '<a class="feed-link" href="' +
            escapeHtml(safeFeedHref(item.link)) +
            '" target="_blank" rel="noopener noreferrer">' +
            escapeHtml(item.title) +
            '</a><span class="feed-summary">' +
            escapeHtml(item.summary || "") +
            '</span><span class="feed-meta">' +
            '<span class="feed-lang">' +
            escapeHtml(feedLangLabel(item.lang || b.key)) +
            "</span>" +
            escapeHtml(item.source) +
            (item.date ? " · " + escapeHtml(item.date) : "") +
            "</span>" +
            "</li>"
          );
        })
        .join("");
    });
  }

  /* ---------- 首页：文章列表 + 分页 ---------- */
  function renderList() {
    var listEl = document.getElementById("post-list");
    if (!listEl) return;

    var page = Math.max(1, parseInt(getParam("page") || "1", 10));
    var totalPages = Math.max(1, Math.ceil(POSTS.length / PAGE_SIZE));
    if (page > totalPages) page = totalPages;

    var slice = POSTS.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    replaceWithPostCards(listEl, slice);

    var navEl = document.getElementById("pagination");
    if (navEl && totalPages > 1) {
      var html = "";
      if (page > 1) {
        html += '<a href="index.html?page=' + (page - 1) + '#posts-title">上一页</a>';
      }
      for (var i = 1; i <= totalPages; i++) {
        if (i === page) {
          html += '<span class="current">' + i + "</span>";
        } else {
          html += '<a href="index.html?page=' + i + '#posts-title">' + i + "</a>";
        }
      }
      if (page < totalPages) {
        html += '<a href="index.html?page=' + (page + 1) + '#posts-title">下一页</a>';
      }
      navEl.innerHTML = html;

      // 无刷新翻页：更新 URL、重渲染列表，并保持"最新文章"位置的滚动视图
      navEl.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function (e) {
          e.preventDefault();
          var href = a.getAttribute("href");
          try {
            window.history.pushState(null, "", href);
            renderList();
            var title = document.getElementById("posts-title");
            if (title) title.scrollIntoView({ behavior: "smooth", block: "start" });
          } catch (err) {
            window.location.href = href;
          }
        });
      });
    }

    window.SiteShell.init(window, "home");
    renderFeeds();
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

  /* ---------- 点赞事件委托（全局仅绑定一次） ---------- */
  function initLikeDelegation() {
    if (!window.Stats) return;
    // 委托到 document：列表翻页 / 标签筛选重渲染后新卡片自动生效，无需重复绑定
    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest(".like-btn") : null;
      if (!btn) return;
      if (btn.disabled || btn.getAttribute("data-pending") === "true") return;
      var id = btn.getAttribute("data-id");
      if (!id) return;

      // 防重复：已点赞则直接忽略（disabled 按钮本不应触发 click，此处为防御性检查）
      if (window.LikesStorage && window.LikesStorage.hasLiked(id)) {
        return;
      }

      var numEl = btn.querySelector(".like-count");
      // 当前真实点赞数取缓存（避免由缩写文本反解导致精度丢失）
      var cached = (window.Stats.getCache() || {})[id];
      var cur = cached && typeof cached.likeCount === "number" ? cached.likeCount : 0;

      // 乐观更新：先 +1 并触发点击动效
      if (!window.Stats.getCache()[id]) {
        window.Stats.getCache()[id] = { viewCount: 0, likeCount: 0 };
      }
      window.Stats.getCache()[id].likeCount = cur + 1;
      if (numEl) numEl.textContent = window.Stats.formatCount(cur + 1);
      btn.disabled = true;
      btn.setAttribute("data-pending", "true");
      btn.setAttribute("aria-busy", "true");
      btn.classList.add("is-bumping");
      setTimeout(function () {
        btn.classList.remove("is-bumping");
      }, 300);

      // 上报点赞：成功用真实值校正；失败回退为原值
      window.Stats
        .reportLike(id)
        .then(function (likeCount) {
          if (numEl) numEl.textContent = window.Stats.formatCount(likeCount);
          // 成功后持久化已点赞状态并禁用按钮，防止重复点赞
          if (window.LikesStorage) window.LikesStorage.markLiked(id);
          btn.classList.add("is-liked");
          btn.removeAttribute("data-pending");
          btn.removeAttribute("aria-busy");
          btn.setAttribute("disabled", "");
          btn.setAttribute("aria-label", "已点赞");
        })
        .catch(function () {
          window.Stats.getCache()[id].likeCount = cur;
          if (numEl) numEl.textContent = window.Stats.formatCount(cur);
          btn.disabled = false;
          btn.removeAttribute("data-pending");
          btn.removeAttribute("aria-busy");
        });
    });
  }

  /* ---------- 启动（异步：先拉取统计缓存，再渲染） ---------- */
  async function init() {
    window.SiteShell.init(window, "");
    initLikeDelegation();

    // 列表渲染前先批量拉取统计，使卡片初始即显示真实计数
    if (window.Stats && !document.getElementById("article")) {
      try {
        await window.Stats.fetchAllStats();
      } catch (e) {
        /* 拉取失败不影响渲染，统计条显示 0 */
      }
    }

    renderList();
    if (document.getElementById("article")) {
      await renderPost();
    }
    initReveal();
  }

  init();

  // 浏览器前进/后退时按 URL 中的 page 参数重渲染列表
  window.addEventListener("popstate", function () {
    if (document.getElementById("post-list")) renderList();
  });
})();
