/* Infighting tags page renderer (UMD). */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TagsPage = api;
  if (root && root.document) api.init(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var boundRoots = [];

  function durablePosts(root) {
    return (root.POSTS || []).filter(function (post) {
      return post && post.type !== "page";
    });
  }

  function tagCounts(posts) {
    var counts = Object.create(null);
    posts.forEach(function (post) {
      (Array.isArray(post.tags) ? post.tags : []).forEach(function (tag) {
        var name = String(tag);
        counts[name] = (counts[name] || 0) + 1;
      });
    });
    return counts;
  }

  function activeTag(root) {
    return new URLSearchParams((root.location && root.location.search) || "").get("tag") || "";
  }

  function appendTagControl(document, cloud, tag, count, active) {
    var link = document.createElement("a");
    if (tag === active) link.className = "active";
    link.setAttribute("href", "tags.html?tag=" + encodeURIComponent(tag));
    link.textContent = tag;
    var countNode = document.createElement("span");
    countNode.className = "count";
    countNode.textContent = String(count);
    link.appendChild(countNode);
    cloud.appendChild(link);
  }

  function replaceWithPostCards(root, container, posts) {
    container.textContent = "";
    posts.forEach(function (post) {
      container.appendChild(root.ContentCards.postCard(root, post));
    });
  }

  function render(root, document, cloud) {
    var posts = durablePosts(root);
    var counts = tagCounts(posts);
    var tags = Object.keys(counts).sort(function (left, right) {
      return counts[right] - counts[left] || left.localeCompare(right, "zh");
    });
    var active = activeTag(root);
    cloud.textContent = "";
    tags.forEach(function (tag) {
      appendTagControl(document, cloud, tag, counts[tag], active);
    });

    var title = document.getElementById("tag-result-title");
    var list = document.getElementById("tag-post-list");
    if (!title || !list) return;
    if (!active) {
      title.textContent = "点击上方标签筛选文章";
      list.textContent = "";
      return;
    }

    var filtered = posts.filter(function (post) {
      return (Array.isArray(post.tags) ? post.tags : []).indexOf(active) !== -1;
    });
    title.textContent = '标签 "' + active + '" 下的文章（' + filtered.length + " 篇）";
    replaceWithPostCards(root, list, filtered);
    if (!filtered.length) {
      var empty = document.createElement("p");
      empty.setAttribute("style", "color:var(--muted)");
      empty.textContent = "该标签下暂无文章。";
      list.appendChild(empty);
    }
  }

  function bindLikeDelegation(root, document) {
    if (!root.Stats || boundRoots.indexOf(root) !== -1) return;
    boundRoots.push(root);
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
    if (!document) return;
    var cloud = document.getElementById("tag-cloud");
    if (!cloud) return;
    root.SiteShell.init(root, "tags");
    bindLikeDelegation(root, document);

    Promise.resolve()
      .then(function () {
        return root.Stats && root.Stats.fetchAllStats ? root.Stats.fetchAllStats() : null;
      })
      .catch(function () {
        return null;
      })
      .then(function () {
        render(root, document, cloud);
      });
  }

  return { init: init };
});
