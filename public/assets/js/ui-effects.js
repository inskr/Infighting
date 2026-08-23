/* Lightweight pointer spotlight for frosted-glass surfaces. */
(function (root, factory) {
  "use strict";

  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root && root.document) {
    api.createSpotlightController(root).bind();
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

  function createSpotlightController(root) {
    var bound = false;

    function prefersSimpleEffects() {
      if (typeof root.matchMedia !== "function") return false;
      return (
        root.matchMedia("(pointer: coarse)").matches ||
        root.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    }

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
      var position = calculateSpotlightPosition(
        surface.getBoundingClientRect(),
        event.clientX,
        event.clientY
      );
      surface.style.setProperty("--pointer-x", position.x + "%");
      surface.style.setProperty("--pointer-y", position.y + "%");
    }

    function bind() {
      if (bound || prefersSimpleEffects()) return false;
      root.document.addEventListener("pointermove", handlePointerMove, {
        passive: true,
      });
      bound = true;
      return true;
    }

    return { bind: bind };
  }

  return {
    calculateSpotlightPosition: calculateSpotlightPosition,
    createSpotlightController: createSpotlightController,
  };
});
