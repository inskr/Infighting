/* Infighting - 主逻辑：文章列表分页、详情渲染、标签筛选、每日精选、动效 */
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

  function formatDate(iso) {
    return iso || "";
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
      '<article class="post-card">' +
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
      ".post-card, .about-card, .article, .board, .tag-cloud"
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
      { threshold: 0.08 }
    );
    targets.forEach(function (el) {
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
            escapeHtml(item.link) +
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

    if (!archive || !Array.isArray(archive.days) || !archive.days.length) {
      container.innerHTML =
        '<p class="feed-empty">暂无归档内容，每日抓取后会自动累积最近 7 天的精选。</p>';
      if (updatedEl) updatedEl.textContent = "待更新";
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
              escapeHtml(item.link) +
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
    container.innerHTML = archive.days
      .map(function (day) {
        var boards = day.boards || {};
        return (
          '<div class="archive-day">' +
          '<h3 class="archive-date">' +
          escapeHtml(day.date) +
          "</h3>" +
          '<div class="daily-boards">' +
          '<div class="board board-en">' +
          '<h4 class="board-title"><span class="board-dot"></span>国外 <span class="lang-tag">国外</span></h4>' +
          boardHtml(boards.en, "en") +
          "</div>" +
          '<div class="board-divider" role="separator"></div>' +
          '<div class="board board-zh">' +
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
        '<div class="article"><h1>文章不存在</h1><p><a href="index.html">返回首页</a></p></div>';
      return;
    }

    var post = all[index];
    document.title = post.title + " · Infighting";
    setActiveNav(post.type === "page" ? "" : "home");

    var html =
      '<a class="back-link" href="index.html">&larr; 返回文章列表</a>' +
      '<article class="article">' +
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

  /* ---------- 启动 ---------- */
  setYear();
  renderList();
  renderPost();
  renderTags();
  renderArchive();
  initAbout();
  initReveal();

  // 浏览器前进/后退时按 URL 中的 page 参数重渲染列表
  window.addEventListener("popstate", function () {
    if (document.getElementById("post-list")) renderList();
  });
})();
