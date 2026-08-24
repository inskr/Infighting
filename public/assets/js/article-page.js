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

  function enhanceStats(root, article, id) {
    var stats = root && root.Stats;
    if (!stats) return Promise.resolve();

    var viewElement = article.querySelector(".view-count-num");
    var likeElement = article.querySelector(".like-count");
    var reportView = typeof stats.reportView === "function"
      ? Promise.resolve().then(function () { return stats.reportView(id); })
      : Promise.resolve();
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

  function handleLike(root, button, id) {
    var stats = root && root.Stats;
    if (!stats || typeof stats.reportLike !== "function" || !button) {
      return Promise.resolve(false);
    }
    if (
      root.LikesStorage &&
      typeof root.LikesStorage.hasLiked === "function" &&
      root.LikesStorage.hasLiked(id)
    ) {
      return Promise.resolve(false);
    }

    var cache = typeof stats.getCache === "function" ? stats.getCache() : {};
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
          root.LikesStorage.markLiked(id);
        }
        if (button.classList) button.classList.add("is-liked");
        button.removeAttribute("data-pending");
        button.removeAttribute("aria-busy");
        button.setAttribute("disabled", "");
        button.setAttribute("aria-label", "已点赞");
        return true;
      })
      .catch(function () {
        cache[id].likeCount = current;
        if (countElement) countElement.textContent = formatCount(root, current);
        button.disabled = false;
        button.removeAttribute("data-pending");
        button.removeAttribute("aria-busy");
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

    if (typeof button.addEventListener === "function") {
      button.addEventListener("click", function () {
        if (button.disabled || button.getAttribute("data-pending") === "true") return;
        handleLike(root, button, id);
      });
    }
  }

  function init(root) {
    if (!root || !root.document || typeof root.document.querySelector !== "function") {
      return Promise.resolve(false);
    }
    var article = root.document.querySelector("[data-article-id]");
    if (!article || typeof article.getAttribute !== "function") {
      return Promise.resolve(false);
    }
    var id = article.getAttribute("data-article-id");
    if (!isTrustedArticleId(id)) return Promise.resolve(false);

    var body = article.querySelector(".article-body");
    decorateContent(root, body);
    initLike(root, article, id);
    return enhanceStats(root, article, id).then(function () { return true; });
  }

  return {
    decorateContent: decorateContent,
    handleLike: handleLike,
    init: init,
  };
});
