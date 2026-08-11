/* Testable view helpers for article loading states and rendered media. */
(function (root, factory) {
  "use strict";

  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.PostView = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function errorCardHtml(error) {
    var isMissing = error && (error.code === "INVALID_ID" || error.code === "NOT_FOUND");
    var title = isMissing ? "文章不存在" : "文章加载失败";
    return (
      '<div class="article glass-surface"><h1>' +
      title +
      '</h1><p><a href="index.html">返回文章列表</a></p></div>'
    );
  }

  function decorateArticleImages(container) {
    if (!container || typeof container.querySelectorAll !== "function") return 0;
    var images = container.querySelectorAll(".article-body img");
    images.forEach(function (image) {
      image.setAttribute("loading", "lazy");
      image.setAttribute("decoding", "async");
    });
    return images.length;
  }

  return {
    errorCardHtml: errorCardHtml,
    decorateArticleImages: decorateArticleImages,
  };
});
