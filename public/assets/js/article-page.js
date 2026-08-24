/* Progressive enhancement for generated static article pages. */
(function (root, factory) {
  "use strict";

  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.ArticlePage = api;
    if (root.document) {
      var start = function () {
        Promise.resolve(api.init(root)).catch(function () {
          /* Enhancement failures must never hide the static article. */
        });
      };
      if (root.document.readyState === "loading" && root.document.addEventListener) {
        root.document.addEventListener("DOMContentLoaded", start, { once: true });
      } else {
        start();
      }
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var POST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
  var WINDOWS_RESERVED_BASENAME_PATTERN = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  var LIKE_BOUND_KEY = "__articlePageLikeBound";
  var TOC_OBSERVER_KEY = "__articlePageTocObserver";
  var VIEW_PROMISE_KEY = "__articlePageViewPromise";

  function forEachNode(nodes, callback) {
    Array.prototype.forEach.call(nodes || [], callback);
  }

  function decorateContent(root, container) {
    if (!container || typeof container.querySelectorAll !== "function") {
      return { images: 0, tables: 0, codeBlocks: 0 };
    }

    var images = container.querySelectorAll("img");
    forEachNode(images, function (image) {
      image.setAttribute("loading", "lazy");
      image.setAttribute("decoding", "async");
    });

    var wrappedTables = 0;
    var tables = container.querySelectorAll("table");
    forEachNode(tables, function (table) {
      var parent = table.parentNode;
      if (
        parent &&
        parent.classList &&
        typeof parent.classList.contains === "function" &&
        parent.classList.contains("table-wrapper")
      ) {
        return;
      }
      if (!root || !root.document || typeof root.document.createElement !== "function" || !parent) {
        return;
      }
      var wrapper = root.document.createElement("div");
      wrapper.className = "table-wrapper";
      parent.insertBefore(wrapper, table);
      wrapper.appendChild(table);
      wrappedTables += 1;
    });

    var codeBlocks = container.querySelectorAll("pre code");
    if (root && root.hljs && typeof root.hljs.highlightElement === "function") {
      forEachNode(codeBlocks, function (block) {
        try {
          root.hljs.highlightElement(block);
        } catch (error) {
          /* Highlighting is optional; the original code remains readable. */
        }
      });
    }

    return {
      images: images.length,
      tables: wrappedTables,
      codeBlocks: codeBlocks.length,
    };
  }

  function isTrustedArticleId(id) {
    return (
      typeof id === "string" &&
      POST_ID_PATTERN.test(id) &&
      !WINDOWS_RESERVED_BASENAME_PATTERN.test(id)
    );
  }

  function formatCount(root, count) {
    if (root.Stats && typeof root.Stats.formatCount === "function") {
      return root.Stats.formatCount(count);
    }
    return String(count || 0);
  }

  function announce(root, message) {
    if (!root || !root.SiteShell || typeof root.SiteShell.announce !== "function") return;
    try {
      root.SiteShell.announce(root, message);
    } catch (error) {
      /* Announcements are optional progressive enhancement. */
    }
  }

  function renderCachedStats(root, stats, id, viewElement, likeElement) {
    if (typeof stats.getCache !== "function") return;

    try {
      var cache = stats.getCache();
      var cached = cache && cache[id];
      if (!cached) return;
      if (viewElement && typeof cached.viewCount === "number") {
        viewElement.textContent = formatCount(root, cached.viewCount);
      }
      if (likeElement && typeof cached.likeCount === "number") {
        likeElement.textContent = formatCount(root, cached.likeCount);
      }
    } catch (error) {
      /* Cached statistics are optional progressive enhancement. */
    }
  }

  function enhanceStats(root, article, id) {
    var stats = root && root.Stats;
    if (!stats) return Promise.resolve();

    var viewElement = article.querySelector(".view-count-num");
    var likeElement = article.querySelector(".like-count");
    renderCachedStats(root, stats, id, viewElement, likeElement);

    var reportView = article[VIEW_PROMISE_KEY];
    if (!reportView && typeof stats.reportView === "function") {
      reportView = Promise.resolve().then(function () { return stats.reportView(id); });
      article[VIEW_PROMISE_KEY] = reportView;
    }
    if (!reportView) reportView = Promise.resolve();
    var fetchStats = typeof stats.fetchStats === "function"
      ? Promise.resolve().then(function () { return stats.fetchStats(id); })
      : Promise.resolve();

    return Promise.all([
      reportView.then(function (count) {
        if (viewElement && typeof count === "number") {
          viewElement.textContent = formatCount(root, count);
        }
      }).catch(function () {
        /* Keep the static zero value when view reporting is unavailable. */
      }),
      fetchStats.then(function (data) {
        if (likeElement && data && typeof data.likeCount === "number") {
          likeElement.textContent = formatCount(root, data.likeCount);
        }
      }).catch(function () {
        /* Statistics are optional progressive enhancement. */
      }),
    ]);
  }

  function setCurrentTocLink(links, current) {
    forEachNode(links, function (link) {
      var isCurrent = link === current;
      if (isCurrent) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
      if (link.classList) {
        if (isCurrent) link.classList.add("is-current");
        else link.classList.remove("is-current");
      }
    });
  }

  function initToc(root, article) {
    if (
      !article ||
      article[TOC_OBSERVER_KEY] ||
      typeof article.querySelectorAll !== "function" ||
      !root.document ||
      typeof root.document.getElementById !== "function"
    ) {
      return;
    }

    var links = article.querySelectorAll('.article-toc a[href^="#"]');
    var sections = [];
    forEachNode(links, function (link) {
      var href = link.getAttribute("href");
      if (!href || href.length < 2) return;
      var id;
      try {
        id = decodeURIComponent(href.slice(1));
      } catch (error) {
        return;
      }
      var heading = root.document.getElementById(id);
      if (heading) sections.push({ heading: heading, link: link });
    });
    if (sections.length === 0) return;

    setCurrentTocLink(links, sections[0].link);
    if (typeof root.IntersectionObserver !== "function") return;

    try {
      var observer = new root.IntersectionObserver(function (entries) {
        forEachNode(entries, function (entry) {
          if (!entry || !entry.isIntersecting) return;
          forEachNode(sections, function (section) {
            if (section.heading === entry.target) {
              setCurrentTocLink(links, section.link);
            }
          });
        });
      }, { rootMargin: "0px 0px -65% 0px" });
      article[TOC_OBSERVER_KEY] = observer;
      forEachNode(sections, function (section) {
        observer.observe(section.heading);
      });
    } catch (error) {
      /* TOC observation is optional; generated anchors remain usable. */
    }
  }

  function handleLike(root, button, id) {
    var stats = root && root.Stats;
    if (!stats || typeof stats.reportLike !== "function" || !button) {
      return Promise.resolve(false);
    }
    try {
      if (
        root.LikesStorage &&
        typeof root.LikesStorage.hasLiked === "function" &&
        root.LikesStorage.hasLiked(id)
      ) {
        return Promise.resolve(false);
      }
    } catch (error) {
      /* Storage is optional; the server remains the source of truth. */
    }

    var cache = {};
    try {
      cache = typeof stats.getCache === "function" ? stats.getCache() || {} : {};
    } catch (error) {
      cache = {};
    }
    var current = cache[id] && typeof cache[id].likeCount === "number"
      ? cache[id].likeCount
      : 0;
    if (!cache[id]) cache[id] = { viewCount: 0, likeCount: 0 };
    cache[id].likeCount = current + 1;

    var countElement = button.querySelector(".like-count");
    if (countElement) countElement.textContent = formatCount(root, current + 1);
    button.disabled = true;
    button.setAttribute("data-pending", "true");
    button.setAttribute("aria-busy", "true");
    if (button.classList) button.classList.add("is-bumping");
    if (root && typeof root.setTimeout === "function") {
      root.setTimeout(function () {
        if (button.classList) button.classList.remove("is-bumping");
      }, 300);
    }

    return Promise.resolve()
      .then(function () { return stats.reportLike(id); })
      .then(function (count) {
        cache[id].likeCount = count;
        if (countElement) countElement.textContent = formatCount(root, count);
        if (root.LikesStorage && typeof root.LikesStorage.markLiked === "function") {
          try {
            root.LikesStorage.markLiked(id);
          } catch (error) {
            /* A confirmed server like must survive optional storage failure. */
          }
        }
        if (button.classList) button.classList.add("is-liked");
        button.removeAttribute("data-pending");
        button.removeAttribute("aria-busy");
        button.setAttribute("disabled", "");
        button.setAttribute("aria-label", "已点赞");
        announce(root, "点赞成功，当前点赞数 " + formatCount(root, count) + "。");
        return true;
      })
      .catch(function () {
        cache[id].likeCount = current;
        if (countElement) countElement.textContent = formatCount(root, current);
        button.disabled = false;
        button.removeAttribute("data-pending");
        button.removeAttribute("aria-busy");
        announce(root, "点赞失败，已恢复到 " + formatCount(root, current) + "，请重试。");
        return false;
      });
  }

  function initLike(root, article, id) {
    var button = article.querySelector(".like-btn");
    if (
      !button ||
      typeof button.getAttribute !== "function" ||
      button.getAttribute("data-id") !== id
    ) {
      return;
    }

    var liked = false;
    try {
      liked = !!(
        root.LikesStorage &&
        typeof root.LikesStorage.hasLiked === "function" &&
        root.LikesStorage.hasLiked(id)
      );
    } catch (error) {
      liked = false;
    }
    if (liked) {
      button.disabled = true;
      button.setAttribute("disabled", "");
      button.setAttribute("aria-label", "已点赞");
      if (button.classList) button.classList.add("is-liked");
    }

    if (typeof button.addEventListener === "function" && !button[LIKE_BOUND_KEY]) {
      button[LIKE_BOUND_KEY] = true;
      button.addEventListener("click", function () {
        if (button.disabled || button.getAttribute("data-pending") === "true") return;
        handleLike(root, button, id);
      });
    }
  }

  function init(root) {
    if (!root || !root.document || typeof root.document.querySelector !== "function") {
      return Promise.resolve();
    }
    if (root.SiteShell && typeof root.SiteShell.init === "function") {
      root.SiteShell.init(root);
    }
    var article = root.document.querySelector("[data-article-id]");
    if (!article || typeof article.getAttribute !== "function") {
      return Promise.resolve();
    }
    var id = article.getAttribute("data-article-id");
    if (!isTrustedArticleId(id)) return Promise.resolve();

    var body = article.querySelector(".article-body");
    decorateContent(root, body);
    initToc(root, article);
    initLike(root, article, id);
    return enhanceStats(root, article, id).then(function () {});
  }

  return {
    decorateContent: decorateContent,
    handleLike: handleLike,
    init: init,
  };
});
