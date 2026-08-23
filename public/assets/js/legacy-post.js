/* Safe compatibility redirect for legacy post.html?id=<id> URLs. */
(function (root, factory) {
  "use strict";

  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.LegacyPost = api;
    if (root.document && root.location) {
      api.redirect(root);
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var POST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
  var WINDOWS_RESERVED_BASENAME_PATTERN = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

  function isPortablePostId(id) {
    return (
      typeof id === "string" &&
      POST_ID_PATTERN.test(id) &&
      !WINDOWS_RESERVED_BASENAME_PATTERN.test(id)
    );
  }

  function resolveTarget(root, id, publishedIds) {
    if (!isPortablePostId(id) || !Array.isArray(publishedIds)) return null;
    if (!publishedIds.some(function (publishedId) { return publishedId === id; })) {
      return null;
    }

    var encode = root && typeof root.encodeURIComponent === "function"
      ? root.encodeURIComponent
      : encodeURIComponent;
    return "posts/" + encode(id) + ".html";
  }

  function publishedIds(posts) {
    return Array.isArray(posts)
      ? posts.map(function (post) { return post && post.id; })
      : [];
  }

  function renderRecovery(root) {
    var status = root.document.getElementById("legacy-post-status");
    if (!status) return;
    status.innerHTML =
      '<h1>文章不存在</h1><p>该文章链接无效或文章已不再发布。</p>' +
      '<p><a href="index.html">返回文章列表</a></p>';
  }

  function redirect(root) {
    var params = new URLSearchParams(root.location.search || "");
    var id = params.get("id");
    var target = resolveTarget(root, id, publishedIds(root.POSTS));
    if (!target) {
      renderRecovery(root);
      return null;
    }
    root.location.replace(target);
    return target;
  }

  return {
    redirect: redirect,
    resolveTarget: resolveTarget,
  };
});
