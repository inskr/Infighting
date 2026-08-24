/* Infighting search page controller (UMD). */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SearchPage = api;
  if (root && root.document) api.createController(root).init();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createController(root, options) {
    var settings = options || {};
    settings.fetch = settings.fetch || root.fetch.bind(root);
    settings.searchCore = settings.searchCore || root.SearchCore;
    settings.contentCards = settings.contentCards || root.ContentCards;
    settings.siteShell = settings.siteShell || root.SiteShell;
    var document = root && root.document ? root.document : root;
    var form = document.getElementById("search-form");
    var input = document.getElementById("search-input");
    var clear = document.getElementById("search-clear");
    var status = document.getElementById("search-status");
    var results = document.getElementById("search-results");
    var indexPromise;
    var initialized = false;
    var runVersion = 0;

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

    function renderMatches(matches) {
      results.textContent = "";
      matches.forEach(function (match) {
        var card = settings.contentCards.postCard(root, match.document, {
          showStats: false,
          summary: match.snippet,
        });
        renderHighlightedText(card.querySelector(".post-summary"), match.snippet, match.ranges);
        results.appendChild(card);
      });
    }

    function showRetry(query) {
      results.textContent = "";
      var retry = document.createElement("button");
      retry.setAttribute("type", "button");
      retry.className = "search-retry";
      retry.textContent = "重试";
      retry.addEventListener("click", function () {
        return run(query);
      });
      results.appendChild(retry);
    }

    function updateUrl(query) {
      var url = new URL(root.location.pathname + root.location.search + root.location.hash, "https://search.invalid");
      if (query) url.searchParams.set("q", query);
      else url.searchParams.delete("q");
      root.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }

    async function run(query) {
      var version = ++runVersion;
      var normalized = String(query == null ? "" : query).trim();
      input.value = normalized;
      updateUrl(normalized);
      if (!normalized) {
        results.textContent = "";
        status.textContent = "输入关键词开始搜索。";
        return;
      }

      try {
        var index = await loadIndex();
        if (version !== runVersion) return;
        var matches = settings.searchCore.search(index, normalized);
        renderMatches(matches);
        if (!matches.length) {
          status.textContent = "没有找到与“" + normalized + "”匹配的文章。";
        } else {
          status.textContent = "找到 " + matches.length + " 篇与“" + normalized + "”匹配的文章。";
        }
      } catch (error) {
        if (version !== runVersion) return;
        showRetry(normalized);
        status.textContent = "搜索暂时不可用，请重试。";
      }
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
        return run(input.value);
      });
      input.addEventListener("input", function () {
        runVersion += 1;
        updateUrl(String(input.value == null ? "" : input.value).trim());
      });
      clear.addEventListener("click", function () {
        return run("");
      });
      root.addEventListener("popstate", function () {
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

  return { createController: createController };
});
