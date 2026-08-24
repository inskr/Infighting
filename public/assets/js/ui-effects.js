/* Shared spotlight and reveal effects. */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) {
    api.createSpotlightController(root).bind();
    api.createRevealController(root).bind();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function calculateSpotlightPosition(rect, clientX, clientY) {
    var width = rect && rect.width > 0 ? rect.width : 1;
    var height = rect && rect.height > 0 ? rect.height : 1;
    return {
      x: clamp(((clientX - rect.left) / width) * 100, 0, 100),
      y: clamp(((clientY - rect.top) / height) * 100, 0, 100),
    };
  }

  function prefersSimpleEffects(root) {
    if (typeof root.matchMedia !== "function") return false;
    return (
      root.matchMedia("(hover: none)").matches ||
      root.matchMedia("(pointer: coarse)").matches ||
      root.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function prefersReducedMotion(root) {
    return !!(
      typeof root.matchMedia === "function" &&
      root.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function createRevealController(root) {
    var selector = ".hero, .page-intro, .tag-cloud, .post-card, .article, .board, .archive-day";
    var bound = false;
    var observer = null;
    var revealIndex = 0;

    function enhance(target) {
      if (!target || !target.classList || target.classList.contains("reveal")) return;
      target.classList.add("reveal");
      if (target.style) target.style.transitionDelay = Math.min(revealIndex % 6, 5) * 60 + "ms";
      revealIndex += 1;
      var documentElement = root.document.documentElement;
      var viewportHeight = root.innerHeight || (documentElement && documentElement.clientHeight) || 800;
      if (target.getBoundingClientRect().top <= viewportHeight * 1.08) target.classList.add("visible");
      else observer.observe(target);
    }

    function scan(scope) {
      if (!scope) return;
      if (typeof scope.matches === "function" && scope.matches(selector)) enhance(scope);
      if (typeof scope.querySelectorAll === "function") {
        Array.prototype.forEach.call(scope.querySelectorAll(selector), enhance);
      }
    }

    function bind() {
      if (bound) return true;
      if (typeof root.IntersectionObserver !== "function" || prefersReducedMotion(root)) return false;
      observer = new root.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0 });
      scan(root.document);
      if (typeof root.MutationObserver === "function" && root.document.body) {
        new root.MutationObserver(function (mutations) {
          mutations.forEach(function (mutation) {
            Array.prototype.forEach.call(mutation.addedNodes || [], scan);
          });
        }).observe(root.document.body, { childList: true, subtree: true });
      }
      bound = true;
      return true;
    }

    return { bind: bind };
  }

  function createSpotlightController(root) {
    var bound = false;
    function handlePointerMove(event) {
      if (event.pointerType === "touch") return;
      var documentElement = root.document.documentElement;
      if (documentElement && documentElement.style) {
        documentElement.style.setProperty("--ambient-x", event.clientX + "px");
        documentElement.style.setProperty("--ambient-y", event.clientY + "px");
      }
      if (!event.target || typeof event.target.closest !== "function") return;
      var surface = event.target.closest(".glass-surface");
      if (!surface || typeof surface.getBoundingClientRect !== "function") return;
      var position = calculateSpotlightPosition(surface.getBoundingClientRect(), event.clientX, event.clientY);
      surface.style.setProperty("--pointer-x", position.x + "%");
      surface.style.setProperty("--pointer-y", position.y + "%");
    }
    function bind() {
      if (bound || prefersSimpleEffects(root)) return false;
      root.document.addEventListener("pointermove", handlePointerMove, { passive: true });
      bound = true;
      return true;
    }
    return { bind: bind };
  }

  return {
    calculateSpotlightPosition: calculateSpotlightPosition,
    createRevealController: createRevealController,
    createSpotlightController: createSpotlightController,
  };
});
