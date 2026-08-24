/* Infighting home page renderer (UMD). */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HomePage = api;
  if (root && root.document) api.init(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PAGE_SIZE = 4;
  var likeBoundRoots = [];
  var navigationBoundRoots = [];

  function durablePosts(root) {
    return (root.POSTS || []).filter(function (post) {
      return post && post.type !== "page";
    });
  }

  function currentPage(root, totalPages) {
    var raw = new URLSearchParams((root.location && root.location.search) || "").get("page");
    var parsed = parseInt(raw || "1", 10);
    if (!Number.isFinite(parsed)) parsed = 1;
    return Math.min(totalPages, Math.max(1, parsed));
  }

  function replaceWithPostCards(root, container, posts) {
    container.textContent = "";
    posts.forEach(function (post) {
      container.appendChild(root.ContentCards.postCard(root, post));
    });
  }

  function pageLink(document, page, label) {
    var link = document.createElement("a");
    link.setAttribute("href", "index.html?page=" + page + "#posts-title");
    link.textContent = String(label);
    return link;
  }

  function prefersReducedMotion(root) {
    return !!(
      typeof root.matchMedia === "function" &&
      root.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function bindPageLink(root, document, link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      var href = link.getAttribute("href");
      try {
        root.history.pushState(null, "", href);
        renderList(root, document);
        var title = document.getElementById("posts-title");
        if (title) {
          title.scrollIntoView({
            behavior: prefersReducedMotion(root) ? "auto" : "smooth",
            block: "start",
          });
        }
      } catch (error) {
        root.location.href = href;
      }
    });
  }

  function renderPagination(root, document, container, page, totalPages) {
    container.textContent = "";
    if (totalPages <= 1) return;

    if (page > 1) container.appendChild(pageLink(document, page - 1, "上一页"));
    for (var number = 1; number <= totalPages; number += 1) {
      if (number === page) {
        var current = document.createElement("span");
        current.className = "current";
        current.setAttribute("aria-current", "page");
        current.textContent = String(number);
        container.appendChild(current);
      } else {
        container.appendChild(pageLink(document, number, number));
      }
    }
    if (page < totalPages) container.appendChild(pageLink(document, page + 1, "下一页"));

    container.querySelectorAll("a").forEach(function (link) {
      bindPageLink(root, document, link);
    });
  }

  function renderList(root, document) {
    var list = document.getElementById("post-list");
    if (!list) return;
    var posts = durablePosts(root);
    var totalPages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
    var page = currentPage(root, totalPages);
    replaceWithPostCards(root, list, posts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));

    var pagination = document.getElementById("pagination");
    if (pagination) renderPagination(root, document, pagination, page, totalPages);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function feedLangLabel(code) {
    if (code === "en") return "国外";
    if (code === "zh") return "国内";
    return code || "";
  }

  function formatUpdatedAt(value) {
    var date = new Date(value);
    return (
      "更新于 " +
      date.getFullYear() +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(date.getDate()).padStart(2, "0")
    );
  }

  function safeFeedHref(root, value) {
    if (!root.UrlPolicy || typeof root.UrlPolicy.safeExternalUrl !== "function") return "#";
    return root.UrlPolicy.safeExternalUrl(value) || "#";
  }

  function boardHtml(root, items, langKey) {
    if (!items.length) return '<li class="feed-empty">暂未获取到内容。</li>';
    return items
      .slice(0, 8)
      .map(function (item) {
        return (
          "<li>" +
          '<a class="feed-link" href="' +
          escapeHtml(safeFeedHref(root, item.link)) +
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
      .join("");
  }

  function renderFeeds(root, document) {
    var boards = [
      { key: "en", element: document.getElementById("feed-en") },
      { key: "zh", element: document.getElementById("feed-zh") },
    ];
    if (!boards[0].element && !boards[1].element) return;
    var updated = document.getElementById("feed-updated");
    var feeds = root.FEEDS;

    if (!feeds || !feeds.boards) {
      boards.forEach(function (board) {
        if (board.element) {
          board.element.innerHTML =
            '<li class="feed-empty">今日内容尚未更新，请运行 fetch-feeds.js 抓取最新资讯。</li>';
        }
      });
      if (updated) updated.textContent = "待更新";
      return;
    }

    if (updated) updated.textContent = feeds.updatedAt ? formatUpdatedAt(feeds.updatedAt) : "";
    boards.forEach(function (board) {
      if (!board.element) return;
      var items = Array.isArray(feeds.boards[board.key]) ? feeds.boards[board.key] : [];
      board.element.innerHTML = boardHtml(root, items, board.key);
    });
  }

  function bindLikeDelegation(root, document) {
    if (!root.Stats || likeBoundRoots.indexOf(root) !== -1) return;
    likeBoundRoots.push(root);
    document.addEventListener("click", function (event) {
      var button = event.target && event.target.closest ? event.target.closest(".like-btn") : null;
      if (!button || button.disabled || button.getAttribute("data-pending") === "true") return;
      var id = button.getAttribute("data-id");
      if (!id || (root.LikesStorage && root.LikesStorage.hasLiked(id))) return;

      var cache = root.Stats.getCache();
      var cached = (cache || {})[id];
      var current = cached && typeof cached.likeCount === "number" ? cached.likeCount : 0;
      if (!cache[id]) cache[id] = { viewCount: 0, likeCount: 0 };
      cache[id].likeCount = current + 1;
      var number = button.querySelector(".like-count");
      if (number) number.textContent = root.Stats.formatCount(current + 1);
      button.disabled = true;
      button.setAttribute("data-pending", "true");
      button.setAttribute("aria-busy", "true");
      button.classList.add("is-bumping");
      (root.setTimeout || setTimeout)(function () {
        button.classList.remove("is-bumping");
      }, 300);

      root.Stats.reportLike(id)
        .then(function (likeCount) {
          if (number) number.textContent = root.Stats.formatCount(likeCount);
          if (root.LikesStorage) root.LikesStorage.markLiked(id);
          button.classList.add("is-liked");
          button.removeAttribute("data-pending");
          button.removeAttribute("aria-busy");
          button.setAttribute("disabled", "");
          button.setAttribute("aria-label", "已点赞");
        })
        .catch(function () {
          cache[id].likeCount = current;
          if (number) number.textContent = root.Stats.formatCount(current);
          button.disabled = false;
          button.removeAttribute("data-pending");
          button.removeAttribute("aria-busy");
        });
    });
  }

  function init(root) {
    var document = root && root.document;
    if (!document || !document.getElementById("post-list")) return;
    root.SiteShell.init(root, "home");
    bindLikeDelegation(root, document);

    Promise.resolve()
      .then(function () {
        return root.Stats && root.Stats.fetchAllStats ? root.Stats.fetchAllStats() : null;
      })
      .catch(function () {
        return null;
      })
      .then(function () {
        renderList(root, document);
        renderFeeds(root, document);
      });

    if (
      typeof root.addEventListener === "function" &&
      navigationBoundRoots.indexOf(root) === -1
    ) {
      navigationBoundRoots.push(root);
      root.addEventListener("popstate", function () {
        renderList(root, document);
      });
    }
  }

  return { init: init };
});
