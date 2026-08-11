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

  function isValidPostId(id) {
    return typeof id === "string" && POST_ID_PATTERN.test(id);
  }

  function postError(code) {
    var error = new Error(code);
    error.code = code;
    return error;
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
      return await response.json();
    } catch (error) {
      throw postError("LOAD_FAILED");
    }
  }

  return {
    isValidPostId: isValidPostId,
    loadPost: loadPost,
  };
});
