/* Infighting archive page renderer (UMD). */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ArchivePage = api;
  if (root && root.document) api.init(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function feedLangLabel(code) {
    if (code === "en") return "国外";
    if (code === "zh") return "国内";
    return code || "";
  }

  function formatUpdatedAt(value) {
    var date = new Date(value);
    return (
      "更新于 " +
      date.getFullYear() +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(date.getDate()).padStart(2, "0")
    );
  }

  function boardHtml(root, items, langKey) {
    if (!items || !items.length) {
      return '<ul class="feed-list"><li class="feed-empty">当日未获取到内容。</li></ul>';
    }
    return (
      '<ul class="feed-list">' +
      items
        .map(function (item) {
          var safeUrl = root.UrlPolicy && root.UrlPolicy.safeExternalUrl
            ? root.UrlPolicy.safeExternalUrl(item.link)
            : "";
          return (
            "<li>" +
            '<a class="feed-link" href="' +
            escapeHtml(safeUrl || "#") +
            '" target="_blank" rel="noopener noreferrer">' +
            escapeHtml(item.title) +
            '</a><span class="feed-summary">' +
            escapeHtml(item.summary || "") +
            '</span><span class="feed-meta">' +
            '<span class="feed-lang">' +
            escapeHtml(feedLangLabel(item.lang || langKey)) +
            "</span>" +
            escapeHtml(item.source) +
            (item.date ? " · " + escapeHtml(item.date) : "") +
            "</span>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function init(root) {
    var document = root && root.document;
    if (!document) return;
    var container = document.getElementById("archive-days");
    if (!container) return;

    root.SiteShell.init(root, "archive");

    var updatedEl = document.getElementById("archive-updated");
    var archive = root.FEED_ARCHIVE;
    if (!archive || !Array.isArray(archive.days)) {
      container.innerHTML = "";
      if (updatedEl) updatedEl.textContent = "";
      return;
    }

    var todayKey = (root.FEEDS && root.FEEDS.updatedAt ? root.FEEDS.updatedAt : "").slice(0, 10);
    var days = archive.days
      .filter(function (day) {
        return day && day.date && day.date !== todayKey;
      })
      .sort(function (left, right) {
        return String(right.date).localeCompare(String(left.date));
      });

    if (!days.length) {
      container.innerHTML = "";
      if (updatedEl) updatedEl.textContent = "";
      return;
    }

    if (updatedEl && archive.updatedAt) {
      updatedEl.textContent = formatUpdatedAt(archive.updatedAt);
    }

    container.innerHTML = days
      .map(function (day) {
        var boards = day.boards || {};
        return (
          '<div class="archive-day glass-surface">' +
          '<h2 class="archive-date">' +
          escapeHtml(day.date) +
          "</h2>" +
          '<div class="daily-boards">' +
          '<div class="board board-en glass-surface">' +
          '<h3 class="board-title"><span class="board-dot"></span>国外 <span class="lang-tag">国外</span></h3>' +
          boardHtml(root, boards.en, "en") +
          "</div>" +
          '<div class="board-divider" role="separator"></div>' +
          '<div class="board board-zh glass-surface">' +
          '<h3 class="board-title"><span class="board-dot"></span>国内 <span class="lang-tag">国内</span></h3>' +
          boardHtml(root, boards.zh, "zh") +
          "</div>" +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  return { init: init };
});
