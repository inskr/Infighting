/* Infighting shared article cards and cached statistics (UMD). */
(function (root, factory) {
  "use strict";

  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ContentCards = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SVG_NAMESPACE = "http://www.w3.org/2000/svg";

  function environment(root) {
    var document = root && root.document ? root.document : root;
    if (!document || typeof document.createElement !== "function") {
      throw new TypeError("ContentCards requires a DOM root");
    }
    var services = root && root.document ? root : document.defaultView || {};
    return { document: document, services: services };
  }

  function element(document, tagName, className, text) {
    var node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text == null ? "" : String(text);
    return node;
  }

  function svgElement(document, tagName, attributes) {
    var node = document.createElementNS(SVG_NAMESPACE, tagName);
    Object.keys(attributes).forEach(function (name) {
      node.setAttribute(name, attributes[name]);
    });
    return node;
  }

  function heartIcon(document) {
    var svg = svgElement(document, "svg", {
      "class": "icon-heart",
      viewBox: "0 0 24 24",
      width: "16",
      height: "16",
      "aria-hidden": "true",
      focusable: "false",
    });
    svg.appendChild(svgElement(document, "path", {
      d: "M12 21s-7.5-4.9-10-9.2C.4 8.9 1.6 5.3 4.8 4.6c1.9-.4 3.7.6 4.8 2 1.1-1.4 2.9-2.4 4.8-2 3.2.7 4.4 4.3 2.8 7.2C19.5 16.1 12 21 12 21z",
    }));
    return svg;
  }

  function eyeIcon(document) {
    var svg = svgElement(document, "svg", {
      "class": "icon-eye",
      viewBox: "0 0 24 24",
      width: "16",
      height: "16",
      "aria-hidden": "true",
      focusable: "false",
    });
    svg.appendChild(svgElement(document, "path", {
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.8",
      d: "M1 12.5C2.7 8.1 7 5 12 5s9.3 3.1 11 7.5C21.3 16.9 17 20 12 20S2.7 16.9 1 12.5z",
    }));
    svg.appendChild(svgElement(document, "circle", {
      cx: "12",
      cy: "12.5",
      r: "2.6",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.8",
    }));
    return svg;
  }

  function formatCount(stats, value) {
    return stats && typeof stats.formatCount === "function"
      ? stats.formatCount(value)
      : String(value);
  }

  function statBar(root, post) {
    var env = environment(root);
    var document = env.document;
    var stats = env.services.Stats;
    var likesStorage = env.services.LikesStorage;
    var id = post && post.id != null ? String(post.id) : "";
    var cache = stats && typeof stats.getCache === "function" ? stats.getCache() || {} : {};
    var cached = cache[id] || {};
    var likeCount = typeof cached.likeCount === "number" ? cached.likeCount : 0;
    var viewCount = typeof cached.viewCount === "number" ? cached.viewCount : 0;
    var liked = !!(
      likesStorage &&
      typeof likesStorage.hasLiked === "function" &&
      likesStorage.hasLiked(id)
    );

    var bar = element(document, "div", "stats-bar");
    var likeButton = element(document, "button", "like-btn" + (liked ? " is-liked" : ""));
    likeButton.setAttribute("data-id", id);
    likeButton.setAttribute("type", "button");
    likeButton.setAttribute("aria-label", liked ? "已点赞" : "点赞");
    if (liked) likeButton.setAttribute("disabled", "");
    likeButton.appendChild(heartIcon(document));
    likeButton.appendChild(element(document, "span", "like-count", formatCount(stats, likeCount)));

    var views = element(document, "span", "stat view-count");
    views.setAttribute("aria-label", "浏览数");
    views.appendChild(eyeIcon(document));
    views.appendChild(element(document, "span", "view-count-num", formatCount(stats, viewCount)));

    bar.appendChild(likeButton);
    bar.appendChild(views);
    return bar;
  }

  function appendTags(document, parent, tags) {
    (Array.isArray(tags) ? tags : []).forEach(function (tag) {
      var link = element(document, "a", "tag", tag);
      link.setAttribute("href", "tags.html?tag=" + encodeURIComponent(String(tag)));
      parent.appendChild(link);
    });
  }

  function postCard(root, post, options) {
    var env = environment(root);
    var document = env.document;
    var settings = options || {};
    var id = post && post.id != null ? String(post.id) : "";
    var card = element(document, "article", "post-card glass-surface");
    var heading = element(document, "h2");
    var title = element(document, "a", "", post && post.title);
    title.setAttribute("href", "posts/" + encodeURIComponent(id) + ".html");
    heading.appendChild(title);
    card.appendChild(heading);

    var meta = element(document, "div", "post-meta");
    meta.appendChild(element(document, "span", "", post && post.date));
    appendTags(document, meta, post && post.tags);
    card.appendChild(meta);

    var summary = Object.prototype.hasOwnProperty.call(settings, "summary")
      ? settings.summary
      : post && post.summary;
    card.appendChild(element(document, "p", "post-summary", summary));
    if (settings.showStats !== false) card.appendChild(statBar(root, post));
    return card;
  }

  return {
    postCard: postCard,
    statBar: statBar,
  };
});
