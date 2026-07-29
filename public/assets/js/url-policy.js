/* Shared URL policy for generated feeds and browser rendering (UMD). */
(function () {
  "use strict";

  function safeExternalUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      var parsed = new URL(value.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      if (parsed.username || parsed.password) return "";
      return parsed.href;
    } catch (error) {
      return "";
    }
  }

  var api = { safeExternalUrl: safeExternalUrl };
  if (typeof window !== "undefined") window.UrlPolicy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
