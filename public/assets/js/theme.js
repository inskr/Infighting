/* Infighting theme controller: early bootstrap + persistent dark/light toggle. */
(function (root, factory) {
  "use strict";

  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root && root.document) {
    var controller = api.createThemeController(root);
    controller.bootstrap();
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", controller.bind);
    } else {
      controller.bind();
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STORAGE_KEY = "infighting-theme";

  function normalizeTheme(value) {
    return value === "dark" || value === "light" ? value : null;
  }

  function createThemeController(root) {
    var current = "dark";

    function activateEnhancementStylesheet() {
      var stylesheet = root.document.querySelector &&
        root.document.querySelector("link[data-enhancement-stylesheet]");
      if (!stylesheet || !stylesheet.addEventListener) return;
      stylesheet.addEventListener("load", function () {
        stylesheet.media = "all";
      }, { once: true });
    }

    function syncButtons() {
      var isLight = current === "light";
      root.document
        .querySelectorAll("[data-theme-toggle]")
        .forEach(function (button) {
          var label = isLight ? "切换到深色主题" : "切换到浅色主题";
          button.setAttribute("aria-pressed", String(isLight));
          button.setAttribute("aria-label", label);
          button.setAttribute("title", label);
        });
    }

    function persist(theme) {
      try {
        root.localStorage.setItem(STORAGE_KEY, theme);
      } catch (error) {
        /* Storage can be blocked in private or hardened browser contexts. */
      }
    }

    function setTheme(theme) {
      current = normalizeTheme(theme) || "dark";
      root.document.documentElement.setAttribute("data-theme", current);
      persist(current);
      syncButtons();
      return current;
    }

    function bootstrap() {
      var stored = null;
      try {
        stored = root.localStorage.getItem(STORAGE_KEY);
      } catch (error) {
        /* Dark remains the deterministic first-visit fallback. */
      }
      current = normalizeTheme(stored) || "dark";
      root.document.documentElement.setAttribute("data-theme", current);
      activateEnhancementStylesheet();
      return current;
    }

    function bind() {
      syncButtons();
      root.document
        .querySelectorAll("[data-theme-toggle]")
        .forEach(function (button) {
          if (button.getAttribute && button.getAttribute("data-theme-bound") === "true") {
            return;
          }
          button.addEventListener("click", function () {
            setTheme(current === "dark" ? "light" : "dark");
          });
          button.setAttribute("data-theme-bound", "true");
        });
    }

    return {
      bootstrap: bootstrap,
      bind: bind,
      getTheme: function () {
        return current;
      },
      setTheme: setTheme,
    };
  }

  return {
    normalizeTheme: normalizeTheme,
    createThemeController: createThemeController,
  };
});
