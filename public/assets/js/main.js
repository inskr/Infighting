/* Infighting - 主逻辑：文章列表分页、详情渲染、标签筛选、每日精选、动效 */
(function () {
  "use strict";

  var POSTS = (window.POSTS || []).filter(function (p) {
    return p.type !== "page";
  });
  var PAGE_SIZE = 4;

  /* ---------- 统计图标 / 统计条（点赞 + 浏览） ---------- */
  // 内联 SVG 图标，不依赖任何第三方图标库
  var HEART_SVG =
    '<svg class="icon-heart" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
    '<path d="M12 21s-7.5-4.9-10-9.2C.4 8.9 1.6 5.3 4.8 4.6c1.9-.4 3.7.6 4.8 2 1.1-1.4 2.9-2.4 4.8-2 3.2.7 4.4 4.3 2.8 7.2C19.5 16.1 12 21 12 21z"/>' +
    "</svg>";
  var EYE_SVG =
    '<svg class="icon-eye" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
    '<path fill="none" stroke="currentColor" stroke-width="1.8" d="M1 12.5C2.7 8.1 7 5 12 5s9.3 3.1 11 7.5C21.3 16.9 17 20 12 20S2.7 16.9 1 12.5z"/>' +
    '<circle cx="12" cy="12.5" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    "</svg>";

  // 生成卡片/详情页底部的统计条（点赞按钮 + 浏览数）
  // 数据从服务端缓存（Stats.getCache）实时读取，服务端统一计数。
  function statBarHtml(p) {
    var likeCount = 0;
    var viewCount = 0;
    if (window.Stats) {
      var cached = (window.Stats.getCache() || {})[p.id];
      if (cached) {
        likeCount = cached.likeCount || 0;
        viewCount = cached.viewCount || 0;
      }
    }
    var likeNum = window.Stats ? window.Stats.formatCount(likeCount) : String(likeCount);
    var viewNum = window.Stats ? window.Stats.formatCount(viewCount) : String(viewCount);
    // 已点赞的文章：按钮渲染为禁用态，防止重复点赞
    var liked = !!(window.LikesStorage && window.LikesStorage.hasLiked(p.id));
    var likeBtnAttrs =
      'class="like-btn' + (liked ? " is-liked" : "") + '"' +
      ' data-id="' + p.id + '"' +
      ' type="button"' +
      ' aria-label="' + (liked ? "已点赞" : "点赞") + '"' +
      (liked ? " disabled" : "");
    return (
      '<div class="stats-bar">' +
      "<button " + likeBtnAttrs + ">" +
      HEART_SVG +
      '<span class="like-count">' + likeNum + "</span>" +
      "</button>" +
      '<span class="stat view-count" aria-label="浏览数">' +
      EYE_SVG +
      '<span class="view-count-num">' + viewNum + "</span>" +
      "</span>" +
      "</div>"
    );
  }

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

  function formatDate(iso) {
    return escapeHtml(iso || "");
  }

  function tagLinks(tags) {
    return tags
      .map(function (t) {
        return (
          '<a class="tag" href="tags.html?tag=' +
          encodeURIComponent(t) +
          '">' +
          escapeHtml(t) +
          "</a>"
        );
      })
      .join("");
  }

  function postCardHtml(p) {
    return (
      '<article class="post-card glass-surface">' +
      "<h2><a href=\"post.html?id=" +
      encodeURIComponent(p.id) +
      '">' +
      escapeHtml(p.title) +
      "</a></h2>" +
      '<div class="post-meta"><span>' +
      formatDate(p.date) +
      "</span>" +
      tagLinks(p.tags) +
      "</div>" +
      '<p class="post-summary">' +
      escapeHtml(p.summary) +
      "</p>" +
      statBarHtml(p) +
      "</article>"
    );
  }

  function setActiveNav(key) {
    document.querySelectorAll(".site-nav a").forEach(function (a) {
      if (a.getAttribute("data-nav") === key) a.classList.add("active");
    });
  }

  function setYear() {
    var el = document.getElementById("year");
    if (el) el.textContent = new Date().getFullYear();
  }

  /* ---------- 滚动渐入动效 ---------- */
  function initReveal() {
    if (!("IntersectionObserver" in window)) return;
    var targets = document.querySelectorAll(
      ".hero, .page-intro, .post-card, .about-card, .article, .board, .tag-cloud, .archive-day"
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

  /* ---------- 精选归档页：最近 7 天每日精选 ---------- */
  function renderArchive() {
    var container = document.getElementById("archive-days");
    if (!container) return;
    setActiveNav("archive");

    var updatedEl = document.getElementById("archive-updated");
    var archive = window.FEED_ARCHIVE;

    if (!archive || !Array.isArray(archive.days)) {
      container.innerHTML = "";
      if (updatedEl) updatedEl.textContent = "";
      return;
    }

    // 排除"今日精选"对应的日期：当日内容在首页展示，归档页只保留历史，避免两模块重复
    var todayKey = (window.FEEDS && window.FEEDS.updatedAt
      ? window.FEEDS.updatedAt
      : ""
    ).slice(0, 10);
    var days = archive.days.filter(function (d) {
      return d && d.date && d.date !== todayKey;
    });

    // 无历史内容时不渲染任何占位元素
    if (!days.length) {
      container.innerHTML = "";
      if (updatedEl) updatedEl.textContent = "";
      return;
    }

    if (updatedEl && archive.updatedAt) {
      var d = new Date(archive.updatedAt);
      updatedEl.textContent =
        "更新于 " +
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0");
    }

    function boardHtml(items, langKey) {
      if (!items || !items.length) {
        return '<ul class="feed-list"><li class="feed-empty">当日未获取到内容。</li></ul>';
      }
      return (
        '<ul class="feed-list">' +
        items
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
              escapeHtml(feedLangLabel(item.lang || langKey)) +
              "</span>" +
              escapeHtml(item.source) +
              (item.date ? " · " + escapeHtml(item.date) : "") +
              "</span>" +
              "</li>"
            );
          })
          .join("") +
        "</ul>"
      );
    }

    // days 已是日期倒序（最新在前），直接按序渲染
    container.innerHTML = days
      .map(function (day) {
        var boards = day.boards || {};
        return (
          '<div class="archive-day glass-surface">' +
          '<h3 class="archive-date">' +
          escapeHtml(day.date) +
          "</h3>" +
          '<div class="daily-boards">' +
          '<div class="board board-en glass-surface">' +
          '<h4 class="board-title"><span class="board-dot"></span>国外 <span class="lang-tag">国外</span></h4>' +
          boardHtml(boards.en, "en") +
          "</div>" +
          '<div class="board-divider" role="separator"></div>' +
          '<div class="board board-zh glass-surface">' +
          '<h4 class="board-title"><span class="board-dot"></span>国内 <span class="lang-tag">国内</span></h4>' +
          boardHtml(boards.zh, "zh") +
          "</div>" +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  /* ---------- 首页：文章列表 + 分页 ---------- */
  function renderList() {
    var listEl = document.getElementById("post-list");
    if (!listEl) return;

    var page = Math.max(1, parseInt(getParam("page") || "1", 10));
    var totalPages = Math.max(1, Math.ceil(POSTS.length / PAGE_SIZE));
    if (page > totalPages) page = totalPages;

    var slice = POSTS.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    listEl.innerHTML = slice.map(postCardHtml).join("");

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

    setActiveNav("home");
    renderFeeds();
  }

  /* ---------- 文章详情页 ---------- */
  function renderPost() {
    var container = document.getElementById("article");
    if (!container) return;

    var id = getParam("id");
    var all = window.POSTS || [];
    var index = all.findIndex(function (p) {
      return p.id === id;
    });

    if (index === -1) {
      container.innerHTML =
        '<div class="article glass-surface"><h1>文章不存在</h1><p><a href="index.html">返回首页</a></p></div>';
      return;
    }

    var post = all[index];
    document.title = post.title + " · Infighting";
    setActiveNav(post.type === "page" ? "" : "home");

    var html =
      '<a class="back-link" href="index.html">&larr; 返回文章列表</a>' +
      '<article class="article glass-surface">' +
      '<header class="article-header">' +
      "<h1>" +
      escapeHtml(post.title) +
      "</h1>" +
      '<div class="post-meta"><span>' +
      formatDate(post.date) +
      "</span>" +
      tagLinks(post.tags) +
      "</div>" +
      "</header>" +
      '<div class="article-body">' +
      marked.parse(post.content) +
      "</div>" +
      statBarHtml(post) +
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
          '<a class="prev" href="post.html?id=' +
          encodeURIComponent(normals[ni - 1].id) +
          '"><span class="nav-label">上一篇</span>' +
          escapeHtml(normals[ni - 1].title) +
          "</a>";
      } else {
        navHtml += "<span></span>";
      }
      if (ni < normals.length - 1) {
        navHtml +=
          '<a class="next" href="post.html?id=' +
          encodeURIComponent(normals[ni + 1].id) +
          '"><span class="nav-label">下一篇</span>' +
          escapeHtml(normals[ni + 1].title) +
          "</a>";
      } else {
        navHtml += "<span></span>";
      }
      navHtml += "</div>";
      html += navHtml;
    }

    container.innerHTML = html;

    // 进入详情页：上报浏览（+1）并回填最新浏览数
    if (window.Stats && id) {
      window.Stats
        .reportView(id)
        .then(function (viewCount) {
          var viewEl = container.querySelector(".article .stats-bar .view-count-num");
          if (viewEl) viewEl.textContent = window.Stats.formatCount(viewCount);
        })
        .catch(function () {
          /* 网络失败：维持 statBarHtml 初始渲染值 */
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

  /* ---------- 标签页 ---------- */
  function renderTags() {
    var cloudEl = document.getElementById("tag-cloud");
    if (!cloudEl) return;

    var counts = {};
    POSTS.forEach(function (p) {
      p.tags.forEach(function (t) {
        counts[t] = (counts[t] || 0) + 1;
      });
    });

    var tags = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || a.localeCompare(b, "zh");
    });

    var active = getParam("tag") || "";

    cloudEl.innerHTML = tags
      .map(function (t) {
        var cls = t === active ? ' class="active"' : "";
        return (
          "<a" +
          cls +
          ' href="tags.html?tag=' +
          encodeURIComponent(t) +
          '">' +
          escapeHtml(t) +
          '<span class="count">' +
          counts[t] +
          "</span></a>"
        );
      })
      .join("");

    var titleEl = document.getElementById("tag-result-title");
    var listEl = document.getElementById("tag-post-list");
    if (active) {
      var filtered = POSTS.filter(function (p) {
        return p.tags.indexOf(active) !== -1;
      });
      titleEl.textContent =
        '标签 "' + active + '" 下的文章（' + filtered.length + " 篇）";
      listEl.innerHTML =
        filtered.map(postCardHtml).join("") ||
        '<p style="color:var(--muted)">该标签下暂无文章。</p>';
    } else {
      titleEl.textContent = "点击上方标签筛选文章";
      listEl.innerHTML = "";
    }

    setActiveNav("tags");
  }

  function initAbout() {
    if (document.querySelector(".about-grid")) setActiveNav("about");
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
    setYear();
    initLikeDelegation();

    // 列表 / 标签页渲染前先批量拉取统计，使卡片初始即显示真实计数
    if (window.Stats) {
      try {
        await window.Stats.fetchAllStats();
      } catch (e) {
        /* 拉取失败不影响渲染，统计条显示 0 */
      }
    }

    renderList();
    renderPost();
    renderTags();
    renderArchive();
    initAbout();
    initReveal();
  }

  init();

  // 浏览器前进/后退时按 URL 中的 page 参数重渲染列表
  window.addEventListener("popstate", function () {
    if (document.getElementById("post-list")) renderList();
  });
})();
