/* Infighting shared page shell (UMD). */
(function (root, factory) {
  "use strict";

  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SiteShell = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ANNOUNCEMENT_ATTRIBUTE = "data-site-announcement";

  function getDocument(root) {
    var document = root && root.document ? root.document : root;
    if (!document || typeof document.querySelectorAll !== "function") {
      throw new TypeError("SiteShell requires a DOM root");
    }
    return document;
  }

  function ensureAnnouncement(document) {
    var surfaces = document.querySelectorAll("[" + ANNOUNCEMENT_ATTRIBUTE + "]");
    var surface = surfaces[0];

    if (!surface) {
      surface = document.createElement("div");
      surface.setAttribute(ANNOUNCEMENT_ATTRIBUTE, "");
      surface.className = "visually-hidden";
      document.body.appendChild(surface);
    }

    for (var index = 1; index < surfaces.length; index += 1) {
      if (typeof surfaces[index].remove === "function") {
        surfaces[index].remove();
      } else if (surfaces[index].parentNode) {
        surfaces[index].parentNode.removeChild(surfaces[index]);
      }
    }

    surface.setAttribute("role", "status");
    surface.setAttribute("aria-live", "polite");
    surface.setAttribute("aria-atomic", "true");
    return surface;
  }

  function init(root, activeNav) {
    var document = getDocument(root);
    var year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());

    var currentSet = false;
    document.querySelectorAll(".site-nav a").forEach(function (link) {
      var isCurrent =
        !currentSet && !!activeNav && link.getAttribute("data-nav") === activeNav;
      link.classList.remove("active");
      link.removeAttribute("aria-current");
      if (isCurrent) {
        currentSet = true;
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      }
    });
  }

  function announce(root, message) {
    var surface = ensureAnnouncement(getDocument(root));
    surface.textContent = "";
    surface.textContent = message == null ? "" : String(message);
  }

  return {
    init: init,
    announce: announce,
  };
});
