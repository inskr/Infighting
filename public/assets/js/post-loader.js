/* Safe, on-demand loading for generated article documents. */
(function (root, factory) {
  "use strict";

  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.PostLoader = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var POST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
  var WINDOWS_RESERVED_BASENAME_PATTERN = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

  function isValidPostId(id) {
    return (
      typeof id === "string" &&
      POST_ID_PATTERN.test(id) &&
      !WINDOWS_RESERVED_BASENAME_PATTERN.test(id)
    );
  }

  function postError(code) {
    var error = new Error(code);
    error.code = code;
    return error;
  }

  function isUsablePostDocument(post, requestedId) {
    return (
      !!post &&
      !Array.isArray(post) &&
      post.id === requestedId &&
      typeof post.title === "string" &&
      post.title.trim().length > 0 &&
      typeof post.date === "string" &&
      post.date.trim().length > 0 &&
      Array.isArray(post.tags) &&
      post.tags.every(function (tag) {
        return typeof tag === "string";
      }) &&
      typeof post.summary === "string" &&
      typeof post.type === "string" &&
      post.type.trim().length > 0 &&
      typeof post.content === "string"
    );
  }

  async function loadPost(root, id) {
    if (!isValidPostId(id)) {
      throw postError("INVALID_ID");
    }

    var response;
    try {
      response = await root.fetch("assets/posts/" + id + ".json");
    } catch (error) {
      throw postError("LOAD_FAILED");
    }

    if (!response || !response.ok) {
      throw postError(response && response.status === 404 ? "NOT_FOUND" : "LOAD_FAILED");
    }

    try {
      var post = await response.json();
      if (!isUsablePostDocument(post, id)) {
        throw postError("LOAD_FAILED");
      }
      return post;
    } catch (error) {
      throw postError("LOAD_FAILED");
    }
  }

  return {
    isValidPostId: isValidPostId,
    loadPost: loadPost,
  };
});
