/* Infighting search page controller (UMD). */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SearchPage = api;
  if (root && root.document) api.createController(root).init();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var INPUT_DEBOUNCE_MS = 200;
  var HERO_PAINT_TIMEOUT_MS = 800;

  function timerFunction(root, options, name) {
    if (typeof options[name] === "function") return options[name];
    if (root && typeof root[name] === "function") return root[name].bind(root);
    if (typeof globalThis !== "undefined" && typeof globalThis[name] === "function") {
      return globalThis[name].bind(globalThis);
    }
    return null;
  }

  function boundedFallback(root, options) {
    var fallback = typeof options.fallback === "function"
      ? options.fallback
      : function () {
          if (!root || typeof root.requestAnimationFrame !== "function") return Promise.resolve();
          return new Promise(function (resolve) {
            root.requestAnimationFrame(function () {
              root.requestAnimationFrame(resolve);
            });
          });
        };
    var setTimer = timerFunction(root, options, "setTimeout");
    var clearTimer = timerFunction(root, options, "clearTimeout");
    var timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(0, options.timeoutMs)
      : HERO_PAINT_TIMEOUT_MS;

    return new Promise(function (resolve) {
      var settled = false;
      var timeoutId = null;
      var document = root && root.document;

      function cleanup() {
        if (timeoutId !== null && clearTimer) clearTimer(timeoutId);
        if (root && typeof root.removeEventListener === "function") {
          root.removeEventListener("pagehide", settle);
        }
        if (document && typeof document.removeEventListener === "function") {
          document.removeEventListener("visibilitychange", onVisibilityChange);
        }
      }

      function settle() {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      }

      function onVisibilityChange() {
        if (document.visibilityState === "hidden") settle();
      }

      if (root && typeof root.addEventListener === "function") {
        root.addEventListener("pagehide", settle, { once: true });
      }
      if (document && typeof document.addEventListener === "function") {
        document.addEventListener("visibilitychange", onVisibilityChange);
      }
      if (setTimer) timeoutId = setTimer(settle, timeoutMs);

      var fallbackResult;
      try {
        fallbackResult = fallback();
      } catch (error) {
        settle();
        return;
      }
      Promise.resolve(fallbackResult).then(settle, settle);
      if (!setTimer && fallbackResult == null) settle();
    });
  }

  function waitForHeroPaint(root, options) {
    var settings = options || {};
    var document = root && root.document;
    var hero = document && document.getElementById
      ? document.getElementById("search-hero-title")
      : null;
    var Observer = Object.prototype.hasOwnProperty.call(settings, "PerformanceObserver")
      ? settings.PerformanceObserver
      : root && root.PerformanceObserver;
    var supportedTypes = Observer && Observer.supportedEntryTypes;
    var explicitlyUnsupported = Array.isArray(supportedTypes) &&
      supportedTypes.indexOf("largest-contentful-paint") === -1;
    if (!hero || typeof Observer !== "function" || explicitlyUnsupported) {
      return boundedFallback(root, settings);
    }

    var setTimer = timerFunction(root, settings, "setTimeout");
    var clearTimer = timerFunction(root, settings, "clearTimeout");
    var timeoutMs = Number.isFinite(settings.timeoutMs)
      ? Math.max(0, settings.timeoutMs)
      : HERO_PAINT_TIMEOUT_MS;

    return new Promise(function (resolve) {
      var observer = null;
      var settled = false;
      var timeoutId = null;

      function cleanup() {
        if (observer) observer.disconnect();
        if (timeoutId !== null && clearTimer) clearTimer(timeoutId);
        if (root && typeof root.removeEventListener === "function") {
          root.removeEventListener("pagehide", settle);
        }
        if (document && typeof document.removeEventListener === "function") {
          document.removeEventListener("visibilitychange", onVisibilityChange);
        }
      }

      function settle() {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      }

      function onVisibilityChange() {
        if (document.visibilityState === "hidden") settle();
      }

      try {
        observer = new Observer(function (list) {
          var entries = list && typeof list.getEntries === "function" ? list.getEntries() : [];
          for (var index = 0; index < entries.length; index += 1) {
            var element = entries[index] && entries[index].element;
            if (element === hero || (
              element &&
              element.id === "search-hero-title" &&
              document.getElementById("search-hero-title") === element
            )) {
              settle();
              return;
            }
          }
        });
        observer.observe({ type: "largest-contentful-paint", buffered: true });
      } catch (error) {
        if (observer) observer.disconnect();
        resolve(boundedFallback(root, settings));
        return;
      }

      if (root && typeof root.addEventListener === "function") {
        root.addEventListener("pagehide", settle, { once: true });
      }
      if (document && typeof document.addEventListener === "function") {
        document.addEventListener("visibilitychange", onVisibilityChange);
      }
      if (document && document.visibilityState === "hidden") {
        settle();
        return;
      }
      if (setTimer) timeoutId = setTimer(settle, timeoutMs);
      else settle();
    });
  }

  function createController(root, options) {
    var settings = options || {};
    settings.fetch = settings.fetch || root.fetch.bind(root);
    settings.searchCore = settings.searchCore || root.SearchCore;
    settings.contentCards = settings.contentCards || root.ContentCards;
    settings.siteShell = settings.siteShell || root.SiteShell;
    settings.metadata = Array.isArray(settings.metadata)
      ? settings.metadata
      : (Array.isArray(root.POSTS) ? root.POSTS : []);
    settings.previewState = Object.prototype.hasOwnProperty.call(settings, "previewState")
      ? settings.previewState
      : root.SearchPreviewState;
    settings.setTimeout = settings.setTimeout || (typeof root.setTimeout === "function" ? root.setTimeout.bind(root) : null);
    settings.clearTimeout = settings.clearTimeout || (typeof root.clearTimeout === "function" ? root.clearTimeout.bind(root) : null);
    settings.waitForPreviewPaint = settings.waitForPreviewPaint || function () {
      if (typeof root.requestAnimationFrame !== "function") return Promise.resolve();
      return new Promise(function (resolve) {
        root.requestAnimationFrame(function () {
          root.requestAnimationFrame(resolve);
        });
      });
    };
    settings.waitForHeroPaint = settings.waitForHeroPaint || function () {
      return waitForHeroPaint(root, {
        clearTimeout: settings.clearTimeout,
        fallback: settings.waitForPreviewPaint,
        setTimeout: settings.setTimeout,
      });
    };
    var document = root && root.document ? root.document : root;
    var form = document.getElementById("search-form");
    var input = document.getElementById("search-input");
    var clear = document.getElementById("search-clear");
    var status = document.getElementById("search-status");
    var results = document.getElementById("search-results");
    var indexPromise;
    var initialized = false;
    var runVersion = 0;
    var pendingRunTimer = null;
    var activeRunPromise = null;
    var activeRunState = null;
    var previewIndex = settings.metadata.map(function (document) {
      return Object.assign({}, document, { body: "" });
    });

    function cancelPendingRun() {
      if (pendingRunTimer === null) return;
      settings.clearTimeout(pendingRunTimer);
      pendingRunTimer = null;
    }

    function loadIndex() {
      if (!indexPromise) {
        indexPromise = Promise.resolve(settings.fetch("assets/search-index.json"))
          .then(function (response) {
            if (!response || !response.ok) throw new Error("Search index request failed");
            return response.json();
          })
          .then(function (index) {
            if (!Array.isArray(index)) throw new Error("Search index is invalid");
            return index;
          })
          .catch(function (error) {
            indexPromise = null;
            throw error;
          });
      }
      return indexPromise;
    }

    function appendTextElement(parent, tagName, text) {
      if (!text) return;
      var node = document.createElement(tagName);
      node.textContent = text;
      parent.appendChild(node);
    }

    function renderHighlightedText(parent, text, ranges) {
      var source = String(text == null ? "" : text);
      var cursor = 0;
      parent.textContent = "";
      (Array.isArray(ranges) ? ranges : []).forEach(function (range) {
        var start = Math.max(cursor, Math.min(source.length, Number(range.start) || 0));
        var end = Math.max(start, Math.min(source.length, Number(range.end) || 0));
        appendTextElement(parent, "span", source.slice(cursor, start));
        appendTextElement(parent, "mark", source.slice(start, end));
        cursor = end;
      });
      appendTextElement(parent, "span", source.slice(cursor));
    }

    function createMatchCard(match, preview) {
      var summary = match.snippet || (preview && match.document && match.document.summary) || "";
      var card = settings.contentCards.postCard(root, match.document, {
        headingLevel: 3,
        showStats: false,
        summary: summary,
      });
      card.setAttribute("data-search-id", String(match.document && match.document.id || ""));
      renderHighlightedText(card.querySelector(".post-summary"), summary, preview ? [] : match.ranges);
      return card;
    }

    function visibleFingerprint(matches) {
      return JSON.stringify(matches.map(function (match) {
        var document = match && match.document || {};
        var renderedSnippet = match && match.snippet || document.summary || "";
        var renderedRanges = Array.isArray(match && match.ranges)
          ? match.ranges.map(function (range) {
            return [Number(range.start) || 0, Number(range.end) || 0];
          })
          : [];
        return [
          String(document.id == null ? "" : document.id),
          String(document.title == null ? "" : document.title),
          String(document.date == null ? "" : document.date),
          Array.isArray(document.tags) ? document.tags.map(function (tag) { return String(tag); }) : [],
          String(document.summary == null ? "" : document.summary),
          String(renderedSnippet),
          renderedRanges,
        ];
      }));
    }

    function renderMatches(matches, preview) {
      results.textContent = "";
      matches.forEach(function (match) {
        results.appendChild(createMatchCard(match, preview));
      });
    }

    function canReconcile(matches) {
      var cards = Array.prototype.slice.call(results.querySelectorAll(".post-card"));
      return cards.length <= matches.length && cards.every(function (card, index) {
        return card.getAttribute("data-search-id") === String(matches[index].document && matches[index].document.id || "");
      });
    }

    function cardMetadataMatches(card, match) {
      var document = match && match.document || {};
      var heading = card.querySelector("h3");
      var link = heading && heading.querySelector("a");
      var meta = card.querySelector(".post-meta");
      var metaChildren = meta ? Array.prototype.slice.call(meta.children || []) : [];
      var date = metaChildren[0];
      var tags = metaChildren.slice(1);
      var expectedTags = Array.isArray(document.tags) ? document.tags : [];
      return !!(
        link &&
        link.textContent === String(document.title == null ? "" : document.title) &&
        date &&
        date.textContent === String(document.date == null ? "" : document.date) &&
        tags.length === expectedTags.length &&
        tags.every(function (tag, index) {
          return tag.textContent === String(expectedTags[index]);
        })
      );
    }

    function reconcileMatches(matches) {
      var cards = Array.prototype.slice.call(results.querySelectorAll(".post-card"));
      if (cards.length === matches.length && cards.every(function (card, index) {
        return cardMetadataMatches(card, matches[index]);
      })) {
        matches.forEach(function (match, index) {
          var summary = match.snippet || "";
          renderHighlightedText(cards[index].querySelector(".post-summary"), summary, match.ranges);
        });
        return;
      }
      matches.forEach(function (match, index) {
        var currentCard = cards[index];
        var finalCard = createMatchCard(match, false);
        if (!currentCard) {
          results.appendChild(finalCard);
          return;
        }
        var currentHeading = currentCard.querySelector("h3");
        var finalHeading = finalCard.querySelector("h3");
        var currentLink = currentHeading && currentHeading.querySelector("a");
        var finalLink = finalHeading && finalHeading.querySelector("a");
        if (currentLink && finalLink) {
          if (currentLink.textContent !== finalLink.textContent) currentLink.textContent = finalLink.textContent;
          currentLink.setAttribute("href", finalLink.getAttribute("href"));
        }

        Array.prototype.slice.call(currentCard.children, 1).forEach(function (child) {
          if (typeof child.remove === "function") child.remove();
          else if (child.parentNode) child.parentNode.removeChild(child);
        });
        Array.prototype.slice.call(finalCard.children, 1).forEach(function (child) {
          currentCard.appendChild(child);
        });
      });
    }

    function renderAuthoritativeMatches(matches) {
      if (results.getAttribute("data-search-preview") === "true" && canReconcile(matches)) {
        reconcileMatches(matches);
      } else {
        renderMatches(matches, false);
      }
    }

    function renderPreview(normalized) {
      if (!previewIndex.length) return false;
      var previewMatches = settings.searchCore.search(previewIndex, normalized);
      renderMatches(previewMatches, true);
      results.setAttribute("data-search-preview", "true");
      results.setAttribute("data-search-query", normalized);
      updateStatus("已显示快速预览，正在搜索“" + normalized + "”的全文内容。", false);
      return { fingerprint: visibleFingerprint(previewMatches) };
    }

    function adoptGeneratedPreview(normalized) {
      var state = settings.previewState;
      if (!state || state.preview !== true) return false;

      settings.previewState = null;
      if (root.SearchPreviewState === state) root.SearchPreviewState = null;
      var matches =
        state.kind === "generated-metadata-preview" &&
        state.query === normalized &&
        state.results === results &&
        results.getAttribute("data-search-preview") === "true" &&
        results.getAttribute("data-search-query") === normalized;
      if (!matches) {
        results.textContent = "";
        results.removeAttribute("data-search-preview");
        results.removeAttribute("data-search-query");
        return false;
      }

      state.consumed = true;
      updateStatus("已显示快速预览，正在搜索“" + normalized + "”的全文内容。", false);
      return { fingerprint: typeof state.fingerprint === "string" ? state.fingerprint : null };
    }

    function announce(message) {
      if (!settings.siteShell || typeof settings.siteShell.announce !== "function") return false;
      try {
        settings.siteShell.announce(root, message);
        return true;
      } catch (error) {
        /* The visible search state remains usable when announcement enhancement fails. */
        return false;
      }
    }

    function updateStatus(message, shouldAnnounce) {
      if (
        shouldAnnounce &&
        announce(message) &&
        typeof status.getAttribute === "function" &&
        status.getAttribute("data-site-announcement") !== null
      ) {
        return;
      }
      status.textContent = message;
    }

    function createSearchState(kind, message) {
      var state = document.createElement("div");
      state.className = "search-state search-" + kind + "-state";
      appendTextElement(state, "p", message);
      var actions = document.createElement("div");
      actions.className = "search-state-actions";
      state.appendChild(actions);
      results.appendChild(state);
      return actions;
    }

    function showNoResults(query) {
      results.textContent = "";
      results.removeAttribute("data-search-preview");
      var actions = createSearchState(
        "empty",
        "没有找到与“" + query + "”匹配的文章。可以尝试其他关键词。"
      );
      var clearQuery = document.createElement("button");
      clearQuery.setAttribute("type", "button");
      clearQuery.className = "button button-ghost search-clear-query";
      clearQuery.textContent = "清除查询";
      clearQuery.addEventListener("click", function () {
        var pending = run("");
        if (typeof input.focus === "function") input.focus();
        return pending;
      });
      actions.appendChild(clearQuery);
      var tags = document.createElement("a");
      tags.className = "button button-ghost";
      tags.setAttribute("href", "tags.html");
      tags.textContent = "浏览标签";
      actions.appendChild(tags);
    }

    function showRetry(query, shouldFocus) {
      results.textContent = "";
      results.removeAttribute("data-search-preview");
      var actions = createSearchState(
        "error",
        "搜索暂时不可用。请检查网络连接后重试。"
      );
      var retry = document.createElement("button");
      retry.setAttribute("type", "button");
      retry.className = "button button-primary search-retry";
      retry.textContent = "重试";
      retry.addEventListener("click", function () {
        return run(query);
      });
      actions.appendChild(retry);
      if (shouldFocus && typeof retry.focus === "function") retry.focus();
    }

    function updateUrl(query) {
      var url = new URL(root.location.pathname + root.location.search + root.location.hash, "https://search.invalid");
      if (query) url.searchParams.set("q", query);
      else url.searchParams.delete("q");
      root.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }

    async function executeRun(normalized, state) {
      var version = state.version;
      if (!normalized) {
        results.textContent = "";
        results.setAttribute("aria-busy", "false");
        results.removeAttribute("data-search-active");
        results.removeAttribute("data-search-preview");
        updateStatus("输入关键词开始搜索。", false);
        return;
      }

      results.setAttribute("data-search-active", "true");
      results.setAttribute("aria-busy", "true");
      updateStatus("正在搜索“" + normalized + "”。", true);
      var previewRendered = adoptGeneratedPreview(normalized) || renderPreview(normalized);
      try {
        if (previewRendered) await settings.waitForHeroPaint();
        if (version !== runVersion) return;
        var index = await loadIndex();
        if (version !== runVersion) return;
        var matches = settings.searchCore.search(index, normalized);
        if (!previewRendered || previewRendered.fingerprint !== visibleFingerprint(matches)) {
          renderAuthoritativeMatches(matches);
        }
        results.removeAttribute("data-search-preview");
        results.setAttribute("aria-busy", "false");
        if (!matches.length) {
          showNoResults(normalized);
          updateStatus("没有找到与“" + normalized + "”匹配的文章。", true);
        } else {
          updateStatus("找到 " + matches.length + " 篇与“" + normalized + "”匹配的文章。", true);
        }
      } catch (error) {
        if (version !== runVersion) return;
        results.setAttribute("aria-busy", "false");
        showRetry(normalized, !!state.focusRetryOnError);
        updateStatus("搜索暂时不可用，请重试。", true);
      }
    }

    function run(query, runOptions) {
      var options = runOptions || {};
      var normalized = String(query == null ? "" : query).trim();
      input.value = normalized;
      updateUrl(normalized);

      if (
        normalized &&
        activeRunPromise &&
        activeRunState.version === runVersion &&
        activeRunState.query === normalized
      ) {
        if (options.focusRetryOnError) activeRunState.focusRetryOnError = true;
        return activeRunPromise;
      }

      var state = {
        focusRetryOnError: !!options.focusRetryOnError,
        query: normalized,
        version: ++runVersion,
      };
      activeRunState = state;
      activeRunPromise = executeRun(normalized, state);
      var promise = activeRunPromise;
      var clearActiveRun = function () {
        if (activeRunState !== state) return;
        activeRunState = null;
        activeRunPromise = null;
      };
      promise.then(clearActiveRun, clearActiveRun);
      return promise;
    }

    function queryFromLocation() {
      return new URLSearchParams(root.location.search).get("q") || "";
    }

    function init() {
      if (initialized) return;
      initialized = true;
      settings.siteShell.init(root, "search");
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        cancelPendingRun();
        return run(input.value, { focusRetryOnError: true });
      });
      input.addEventListener("input", function () {
        cancelPendingRun();
        runVersion += 1;
        results.textContent = "";
        results.setAttribute("aria-busy", "false");
        results.removeAttribute("data-search-preview");
        var query = String(input.value == null ? "" : input.value).trim();
        if (query) results.setAttribute("data-search-active", "true");
        else results.removeAttribute("data-search-active");
        updateUrl(query);
        pendingRunTimer = settings.setTimeout(function () {
          pendingRunTimer = null;
          return run(query);
        }, INPUT_DEBOUNCE_MS);
      });
      clear.addEventListener("click", function () {
        cancelPendingRun();
        return run("");
      });
      root.addEventListener("popstate", function () {
        cancelPendingRun();
        return run(queryFromLocation());
      });

      var query = queryFromLocation();
      if (query) run(query);
      else run("");
    }

    return {
      init: init,
      run: run,
    };
  }

  return { createController: createController, waitForHeroPaint: waitForHeroPaint };
});
