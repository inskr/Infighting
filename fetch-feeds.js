// 每日资讯抓取脚本：按语言（en/zh）拉取多个 RSS/Atom 源，
// 生成 assets/js/feed-data.js（window.FEEDS），供首页"每日精选"展示。
// 用法: node fetch-feeds.js
// 无第三方依赖；单个源失败不影响整体结果。

const https = require("https");
const fs = require("fs");
const path = require("path");

const OUT_FILE = path.join(__dirname, "assets", "js", "feed-data.js");
const ITEMS_PER_BOARD = 8;
const SUMMARY_MAX_LEN = 180;
const TIMEOUT_MS = 15000;

// 语言分区与信息源配置（name 会显示在页面上）
const BOARDS = {
  en: {
    label: "国外",
    lang: "en",
    feeds: [
      { name: "CNX Software", url: "https://www.cnx-software.com/feed/" },
      { name: "Hackaday", url: "https://hackaday.com/blog/feed/" },
      { name: "Embedded.com", url: "https://www.embedded.com/feed/" },
      { name: "The New Stack", url: "https://thenewstack.io/feed/" },
      { name: "EE Times", url: "https://www.eetimes.com/feed/" },
      { name: "Hackster.io", url: "https://www.hackster.io/feed" },
    ],
  },
  zh: {
    label: "国内",
    lang: "zh",
    feeds: [
      { name: "Solidot", url: "https://www.solidot.org/index.rss" },
      { name: "36氪", url: "https://36kr.com/feed" },
      { name: "掘金", url: "https://juejin.cn/rss" },
    ],
  },
};

/* ---------- HTTP 抓取（支持 2 次重定向） ---------- */
function fetchText(url, redirectsLeft) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        timeout: TIMEOUT_MS,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; InfightingBlogBot/1.0; +https://localhost)",
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          (redirectsLeft || 0) > 0
        ) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          resolve(fetchText(next, (redirectsLeft || 0) - 1));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error("HTTP " + res.statusCode + " for " + url));
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout " + url)));
    req.on("error", reject);
  });
}

/* ---------- XML 解析（正则级，兼容 RSS 2.0 与 Atom） ---------- */
function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function pickTag(xml, tag) {
  const m = xml.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "i"));
  return m ? decodeEntities(m[1]) : "";
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateSummary(text) {
  if (!text) return "";
  const plain = stripHtml(text);
  if (plain.length <= SUMMARY_MAX_LEN) return plain;
  return plain.slice(0, SUMMARY_MAX_LEN).replace(/\s+\S*$/, "") + "…";
}

function parseFeed(xml, sourceName) {
  const items = [];
  const blocks =
    xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ||
    xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ||
    [];

  for (const block of blocks) {
    const title = pickTag(block, "title");
    let link = pickTag(block, "link");
    if (!link) {
      const m = block.match(/<link[^>]*href="([^"]+)"/i);
      link = m ? m[1] : "";
    }
    const dateStr =
      pickTag(block, "pubDate") ||
      pickTag(block, "published") ||
      pickTag(block, "updated") ||
      pickTag(block, "dc:date");

    const description =
      pickTag(block, "description") ||
      pickTag(block, "summary") ||
      pickTag(block, "content:encoded") ||
      "";

    let date = "";
    const ts = Date.parse(dateStr);
    if (!isNaN(ts)) date = new Date(ts).toISOString().slice(0, 10);

    if (title && link) {
      items.push({
        title,
        link,
        source: sourceName,
        date,
        summary: truncateSummary(description),
        _ts: isNaN(ts) ? 0 : ts,
      });
    }
  }
  return items;
}

/* ---------- 主流程 ---------- */
async function collectBoard(feeds, lang) {
  const results = await Promise.allSettled(
    feeds.map((f) => fetchText(f.url, 2).then((xml) => parseFeed(xml, f.name)))
  );
  const items = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      console.log("  [OK] " + feeds[i].name + ": " + r.value.length + " items");
      items.push(...r.value);
    } else {
      console.log("  [FAIL] " + feeds[i].name + ": " + r.reason.message);
    }
  });
  // 按日期倒序、去重（按链接）、限量
  const seen = new Set();
  return items
    .sort((a, b) => b._ts - a._ts)
    .filter((it) => {
      if (seen.has(it.link)) return false;
      seen.add(it.link);
      return true;
    })
    .slice(0, ITEMS_PER_BOARD)
    .map(({ title, link, source, date, summary }) => ({
      title,
      link,
      source,
      date,
      summary,
      lang,
    }));
}

(async () => {
  console.log("Fetching daily feeds...");
  const boards = {};
  let total = 0;
  for (const key of Object.keys(BOARDS)) {
    console.log("Board: " + BOARDS[key].label + " (" + BOARDS[key].lang + ")");
    boards[key] = await collectBoard(BOARDS[key].feeds, BOARDS[key].lang);
    total += boards[key].length;
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    boards,
  };
  const js =
    "// Auto-generated by fetch-feeds.js at " +
    payload.updatedAt +
    ". Do not edit manually.\n" +
    "window.FEEDS = " +
    JSON.stringify(payload, null, 2) +
    ";\n";

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, js, "utf8");
  console.log(
    "Generated " + OUT_FILE + " (" + total + " items, updatedAt " + payload.updatedAt + ")"
  );
  if (total === 0) {
    console.warn("WARNING: no items fetched from any source. Page will show fallback text.");
  }
})();
