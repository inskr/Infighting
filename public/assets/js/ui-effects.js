/* Lightweight pointer spotlight for frosted-glass surfaces. */
(function (root, factory) {
  "use strict";

  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root && root.document) {
    api.createSpotlightController(root).bind();
    api.createHeroMotionController(root).bind();
    api.createSignalFieldController(root).bind();
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

  function watchMotionPreferences(root, handler) {
    if (typeof root.matchMedia !== "function") return;
    [
      "(hover: none)",
      "(pointer: coarse)",
      "(prefers-reduced-motion: reduce)",
    ].forEach(function (query) {
      var media = root.matchMedia(query);
      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", handler);
      } else if (typeof media.addListener === "function") {
        media.addListener(handler);
      }
    });
  }

  function stepSpring(state, target, options) {
    var settings = options || {};
    var stiffness = settings.stiffness == null ? 0.12 : settings.stiffness;
    var damping = settings.damping == null ? 0.8 : settings.damping;
    var velocity =
      (state.velocity + (target - state.position) * stiffness) * damping;
    return { position: state.position + velocity, velocity: velocity };
  }

  function createParticleLayout(width, height, options) {
    var settings = options || {};
    var areaPerParticle = settings.areaPerParticle || 6200;
    var maxParticles = settings.maxParticles || 48;
    var random = settings.random || Math.random;
    var count = Math.min(
      maxParticles,
      Math.max(12, Math.floor((width * height) / areaPerParticle))
    );
    var particles = [];
    for (var index = 0; index < count; index += 1) {
      particles.push({
        x: random() * width,
        y: random() * height,
        vx: (random() - 0.5) * 0.32,
        vy: (random() - 0.5) * 0.32,
        radius: 0.5 + random() * 1.5,
      });
    }
    return particles;
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
      var position = calculateSpotlightPosition(
        surface.getBoundingClientRect(),
        event.clientX,
        event.clientY
      );
      surface.style.setProperty("--pointer-x", position.x + "%");
      surface.style.setProperty("--pointer-y", position.y + "%");
    }

    function bind() {
      if (bound || prefersSimpleEffects(root)) return false;
      root.document.addEventListener("pointermove", handlePointerMove, {
        passive: true,
      });
      bound = true;
      return true;
    }

    return { bind: bind };
  }

  function createHeroMotionController(root) {
    var bound = false;
    var active = false;
    var pointerBound = false;
    var frameId = 0;
    var hero = null;
    var target = { x: 0, y: 0 };
    var xState = { position: 0, velocity: 0 };
    var yState = { position: 0, velocity: 0 };
    var lastFrameTime = null;
    var accumulator = 0;
    var frameStep = 1000 / 60;

    function writeMotion() {
      var x = xState.position;
      var y = yState.position;
      hero.style.setProperty("--motion-x", x.toFixed(2) + "px");
      hero.style.setProperty("--motion-y", y.toFixed(2) + "px");
      hero.style.setProperty("--motion-image-x", (x * 0.55).toFixed(2) + "px");
      hero.style.setProperty("--motion-image-y", (y * 0.55).toFixed(2) + "px");
      hero.style.setProperty("--motion-panel-x", (x * -0.2).toFixed(2) + "px");
      hero.style.setProperty("--motion-panel-y", (y * -0.2).toFixed(2) + "px");
    }

    function tick(timestamp) {
      if (!active) {
        frameId = 0;
        return;
      }
      if (lastFrameTime == null) {
        accumulator = frameStep;
      } else {
        accumulator += clamp(timestamp - lastFrameTime, 0, 50);
      }
      lastFrameTime = timestamp;
      while (accumulator + 0.001 >= frameStep) {
        xState = stepSpring(xState, target.x, { stiffness: 0.15, damping: 0.8 });
        yState = stepSpring(yState, target.y, { stiffness: 0.15, damping: 0.8 });
        accumulator -= frameStep;
      }
      writeMotion();
      var moving =
        Math.abs(target.x - xState.position) > 0.02 ||
        Math.abs(target.y - yState.position) > 0.02 ||
        Math.abs(xState.velocity) > 0.02 ||
        Math.abs(yState.velocity) > 0.02;
      if (moving) {
        frameId = root.requestAnimationFrame(tick);
      } else {
        frameId = 0;
        lastFrameTime = null;
        accumulator = 0;
      }
    }

    function schedule() {
      if (!frameId) frameId = root.requestAnimationFrame(tick);
    }

    function handlePointerMove(event) {
      if (!active || event.pointerType === "touch") return;
      var rect = hero.getBoundingClientRect();
      target.x = (((event.clientX - rect.left) / (rect.width || 1)) - 0.5) * 24;
      target.y = (((event.clientY - rect.top) / (rect.height || 1)) - 0.5) * 18;
      schedule();
    }

    function handlePointerLeave() {
      if (!active) return;
      target.x = 0;
      target.y = 0;
      schedule();
    }

    function bindMagneticButton(button) {
      if (!button || typeof button.addEventListener !== "function") return;
      button.addEventListener("pointermove", function (event) {
        var rect = button.getBoundingClientRect();
        button.style.setProperty(
          "--magnet-x",
          ((event.clientX - rect.left - rect.width / 2) * 0.12).toFixed(2) + "px"
        );
        button.style.setProperty(
          "--magnet-y",
          ((event.clientY - rect.top - rect.height / 2) * 0.16).toFixed(2) + "px"
        );
      });
      button.addEventListener("pointerleave", function () {
        button.style.setProperty("--magnet-x", "0px");
        button.style.setProperty("--magnet-y", "0px");
      });
    }

    function resetMotion() {
      target.x = 0;
      target.y = 0;
      xState = { position: 0, velocity: 0 };
      yState = { position: 0, velocity: 0 };
      lastFrameTime = null;
      accumulator = 0;
      hero.style.setProperty("--motion-x", "0px");
      hero.style.setProperty("--motion-y", "0px");
      hero.style.setProperty("--motion-image-x", "0px");
      hero.style.setProperty("--motion-image-y", "0px");
      hero.style.setProperty("--motion-panel-x", "0px");
      hero.style.setProperty("--motion-panel-y", "0px");
    }

    function deactivate() {
      active = false;
      if (frameId && typeof root.cancelAnimationFrame === "function") {
        root.cancelAnimationFrame(frameId);
      }
      frameId = 0;
      resetMotion();
    }

    function activate() {
      if (active || prefersSimpleEffects(root)) return false;
      if (!pointerBound) {
        hero.addEventListener("pointermove", handlePointerMove, { passive: true });
        hero.addEventListener("pointerleave", handlePointerLeave, { passive: true });
        if (typeof hero.querySelectorAll === "function") {
          Array.prototype.forEach.call(
            hero.querySelectorAll(".hero-actions .button"),
            bindMagneticButton
          );
        }
        pointerBound = true;
      }
      if (hero.dataset) hero.dataset.motionReady = "true";
      active = true;
      return true;
    }

    function handlePreferenceChange() {
      if (prefersSimpleEffects(root)) deactivate();
      else activate();
    }

    function bind() {
      if (bound) return active;
      hero = root.document.querySelector("[data-motion-hero]");
      if (!hero) return false;
      bound = true;
      watchMotionPreferences(root, handlePreferenceChange);
      return activate();
    }

    return { bind: bind };
  }

  function createSignalFieldController(root) {
    var bound = false;
    var canvas = null;
    var context = null;
    var particles = [];
    var frameId = 0;
    var visible = true;
    var active = false;
    var pointer = { x: -1000, y: -1000 };
    var width = 0;
    var height = 0;
    var lastFrameTime = null;
    var accumulator = 0;
    var frameStep = 1000 / 60;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      var ratio = Math.min(root.devicePixelRatio || 1, 1.5);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      if (context.setTransform) context.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles = createParticleLayout(width, height, {
        areaPerParticle: 7200,
        maxParticles: 48,
      });
    }

    function updateParticles() {
      for (var index = 0; index < particles.length; index += 1) {
        var particle = particles[index];
        var dx = particle.x - pointer.x;
        var dy = particle.y - pointer.y;
        var distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < 10000) {
          var distance = Math.sqrt(distanceSquared) || 1;
          var force = (1 - distanceSquared / 10000) * 0.045;
          particle.vx += (dx / distance) * force;
          particle.vy += (dy / distance) * force;
        }
        particle.vx *= 0.995;
        particle.vy *= 0.995;
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < 0 || particle.x > width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > height) particle.vy *= -1;
        particle.x = clamp(particle.x, 0, width);
        particle.y = clamp(particle.y, 0, height);
      }
    }

    function drawLinks() {
      var cellSize = 84;
      var buckets = {};
      var index;
      for (index = 0; index < particles.length; index += 1) {
        var particle = particles[index];
        var key = Math.floor(particle.x / cellSize) + ":" + Math.floor(particle.y / cellSize);
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(index);
      }
      for (index = 0; index < particles.length; index += 1) {
        var origin = particles[index];
        var cellX = Math.floor(origin.x / cellSize);
        var cellY = Math.floor(origin.y / cellSize);
        for (var offsetX = -1; offsetX <= 1; offsetX += 1) {
          for (var offsetY = -1; offsetY <= 1; offsetY += 1) {
            var nearby = buckets[(cellX + offsetX) + ":" + (cellY + offsetY)] || [];
            for (var item = 0; item < nearby.length; item += 1) {
              var otherIndex = nearby[item];
              if (otherIndex <= index) continue;
              var other = particles[otherIndex];
              var distance = Math.hypot(origin.x - other.x, origin.y - other.y);
              if (distance > cellSize) continue;
              context.strokeStyle =
                "rgba(103, 232, 249, " + ((1 - distance / cellSize) * 0.2).toFixed(3) + ")";
              context.beginPath();
              context.moveTo(origin.x, origin.y);
              context.lineTo(other.x, other.y);
              context.stroke();
            }
          }
        }
      }
    }

    function draw(timestamp) {
      if (!visible || !active) {
        frameId = 0;
        return;
      }
      context.clearRect(0, 0, width, height);
      if (lastFrameTime == null) accumulator = frameStep;
      else accumulator += clamp(timestamp - lastFrameTime, 0, 50);
      lastFrameTime = timestamp;
      while (accumulator + 0.001 >= frameStep) {
        updateParticles();
        accumulator -= frameStep;
      }
      drawLinks();
      for (var index = 0; index < particles.length; index += 1) {
        var particle = particles[index];
        context.fillStyle = "rgba(126, 240, 255, 0.68)";
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      }
      frameId = root.requestAnimationFrame(draw);
    }

    function start() {
      if (visible && active && !frameId) frameId = root.requestAnimationFrame(draw);
    }

    function handlePreferenceChange() {
      active = !prefersSimpleEffects(root);
      if (!active) {
        if (frameId && typeof root.cancelAnimationFrame === "function") {
          root.cancelAnimationFrame(frameId);
        }
        frameId = 0;
        lastFrameTime = null;
        accumulator = 0;
        context.clearRect(0, 0, width, height);
      } else {
        start();
      }
    }

    function bind() {
      if (bound) return active;
      canvas = root.document.querySelector("[data-signal-field]");
      if (!canvas || typeof canvas.getContext !== "function") return false;
      context = canvas.getContext("2d");
      if (!context) return false;
      resize();
      var interactionSurface = canvas.parentElement || canvas;
      interactionSurface.addEventListener("pointermove", function (event) {
        var rect = canvas.getBoundingClientRect();
        pointer.x = event.clientX - rect.left;
        pointer.y = event.clientY - rect.top;
      }, { passive: true });
      interactionSurface.addEventListener("pointerleave", function () {
        pointer.x = -1000;
        pointer.y = -1000;
      }, { passive: true });
      if (typeof root.ResizeObserver === "function") {
        new root.ResizeObserver(resize).observe(canvas);
      }
      if (typeof root.IntersectionObserver === "function") {
        new root.IntersectionObserver(function (entries) {
          visible = !!(entries[0] && entries[0].isIntersecting);
          if (visible) start();
          else {
            if (frameId && typeof root.cancelAnimationFrame === "function") {
              root.cancelAnimationFrame(frameId);
            }
            frameId = 0;
            lastFrameTime = null;
            accumulator = 0;
          }
        }, { rootMargin: "160px" }).observe(canvas);
      }
      bound = true;
      active = !prefersSimpleEffects(root);
      watchMotionPreferences(root, handlePreferenceChange);
      start();
      return active;
    }

    return { bind: bind };
  }

  return {
    calculateSpotlightPosition: calculateSpotlightPosition,
    createSpotlightController: createSpotlightController,
    stepSpring: stepSpring,
    createParticleLayout: createParticleLayout,
    createHeroMotionController: createHeroMotionController,
    createSignalFieldController: createSignalFieldController,
  };
});
