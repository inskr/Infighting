/* Deterministic browser/CommonJS full-text search helpers (UMD). */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SearchCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SCORE = {
    TITLE: 16,
    TAGS: 10,
    SUMMARY: 5,
    BODY: 1,
    PHRASE: 12,
  };

  function normalizeText(value) {
    return normalizeDisplayText(value)
      .toLowerCase();
  }

  function normalizeDisplayText(value) {
    return String(value == null ? "" : value)
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeQuery(value) {
    var phrase = normalizeText(value);
    return {
      phrase: phrase,
      terms: phrase ? phrase.split(" ") : [],
    };
  }

  function uniqueTerms(terms) {
    return terms.filter(function (term, index) {
      return terms.indexOf(term) === index;
    });
  }

  function allRanges(text, term) {
    var ranges = [];
    var start = text.indexOf(term);
    while (start !== -1) {
      ranges.push({ start: start, end: start + term.length });
      start = text.indexOf(term, start + term.length);
    }
    return ranges;
  }

  function mergeRanges(ranges) {
    var sorted = ranges
      .map(function (range) {
        return { start: range.start, end: range.end };
      })
      .sort(function (left, right) {
        return left.start - right.start || left.end - right.end;
      });
    var merged = [];

    sorted.forEach(function (range) {
      var previous = merged[merged.length - 1];
      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
      } else {
        merged.push(range);
      }
    });
    return merged;
  }

  function fieldScore(text, terms, phrase, weight) {
    var score = 0;
    terms.forEach(function (term) {
      if (text.indexOf(term) !== -1) score += weight;
    });
    if (phrase && text.indexOf(phrase) !== -1) score += SCORE.PHRASE;
    return score;
  }

  function numberOr(value, fallback) {
    return typeof value === "number" && isFinite(value) ? value : fallback;
  }

  function buildSnippet(body, matches, radius) {
    var text = normalizeDisplayText(body);
    var limit = Math.max(0, Math.floor(numberOr(radius, 80))) * 2;
    var first = matches && matches.length ? matches[0] : null;
    if (!text || !first || limit === 0) return { text: "", start: 0, end: 0 };

    var matchStart = Math.max(0, Math.min(text.length, numberOr(first.start, 0)));
    var matchEnd = Math.max(matchStart, Math.min(text.length, numberOr(first.end, matchStart)));
    var matchLength = matchEnd - matchStart;
    var visibleLength = Math.max(matchLength, limit);
    var start = Math.max(0, Math.floor((matchStart + matchEnd - visibleLength) / 2));
    var end = Math.min(text.length, start + visibleLength);
    start = Math.max(0, end - visibleLength);

    var visible = text.slice(start, end);
    var leadingWhitespace = visible.match(/^\s*/)[0].length;
    var trailingWhitespace = visible.match(/\s*$/)[0].length;
    start += leadingWhitespace;
    end -= trailingWhitespace;
    visible = text.slice(start, end);

    return {
      text: (start > 0 ? "…" : "") + visible + (end < text.length ? "…" : ""),
      start: start,
      end: end,
    };
  }

  function createSnippet(body, matches, radius) {
    return buildSnippet(body, matches, radius).text;
  }

  function cloneDocument(document) {
    var copy = Object.assign({}, document);
    if (Array.isArray(document.tags)) copy.tags = document.tags.slice();
    return copy;
  }

  function search(documents, query) {
    var normalized = normalizeQuery(query);
    var terms = uniqueTerms(normalized.terms);
    if (!normalized.phrase || !Array.isArray(documents)) return [];

    return documents
      .map(function (document) {
        var source = document || {};
        var title = normalizeText(source.title);
        var tags = normalizeText(Array.isArray(source.tags) ? source.tags.join(" ") : source.tags);
        var summary = normalizeText(source.summary);
        var displayBody = normalizeDisplayText(source.body);
        var body = normalizeText(source.body);
        var score =
          fieldScore(title, terms, normalized.phrase, SCORE.TITLE) +
          fieldScore(tags, terms, normalized.phrase, SCORE.TAGS) +
          fieldScore(summary, terms, normalized.phrase, SCORE.SUMMARY) +
          fieldScore(body, terms, normalized.phrase, SCORE.BODY);

        if (!score) return null;

        var matches = mergeRanges(
          terms.reduce(function (ranges, term) {
            return ranges.concat(allRanges(body, term));
          }, [])
        );
        var snippetData = buildSnippet(displayBody, matches, 16);
        var prefixLength = snippetData.start > 0 ? 1 : 0;
        var ranges = matches
          .filter(function (range) {
            return range.end > snippetData.start && range.start < snippetData.end;
          })
          .map(function (range) {
            return {
              start: Math.max(range.start, snippetData.start) - snippetData.start + prefixLength,
              end: Math.min(range.end, snippetData.end) - snippetData.start + prefixLength,
            };
          });

        return {
          document: cloneDocument(source),
          score: score,
          snippet: snippetData.text,
          ranges: ranges,
          date: normalizeText(source.date),
          id: normalizeText(source.id),
        };
      })
      .filter(Boolean)
      .sort(function (left, right) {
        if (left.score !== right.score) return right.score - left.score;
        if (left.date !== right.date) return left.date < right.date ? 1 : -1;
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
      })
      .map(function (result) {
        return {
          document: result.document,
          score: result.score,
          snippet: result.snippet,
          ranges: result.ranges,
        };
      });
  }

  return {
    normalizeQuery: normalizeQuery,
    search: search,
    createSnippet: createSnippet,
  };
});
