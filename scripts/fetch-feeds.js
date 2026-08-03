// 每日资讯抓取脚本：按语言（en/zh）拉取多个 RSS/Atom 源，
// 生成 public/assets/js/feed-data.js（window.FEEDS），供首页"每日精选"展示。
// 用法: node scripts/fetch-feeds.js
// 无第三方依赖；单个源失败不影响整体结果。

const https = require("https");
const fs = require("fs");
const path = require("path");
const UrlPolicy = require("../public/assets/js/url-policy.js");

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const OUT_FILE = path.join(PUBLIC_DIR, "assets", "js", "feed-data.js");
const ARCHIVE_FILE = path.join(PUBLIC_DIR, "assets", "js", "feed-archive.js");
const ARCHIVE_DAYS = 7; // 归档只保留最近 7 天的每日精选
const ITEMS_PER_BOARD = 8;
const SUMMARY_MAX_LEN = 180;
const TIMEOUT_MS = 15000;

// 领域相关性计分：核心词每个 2 分，外围词每个 1 分，总分 >= 2 才入选，
// 确保精选与嵌入式硬件 / 边缘计算 / 边缘 AI 模型部署 / 物联网应用紧密相关。
// 核心词：几乎只出现在嵌入式/边缘 AI 语境的专属词
const CORE_KEYWORDS = [
  "stm32", "esp32", "mcu", "microcontroller", "embedded", "rtos", "freertos",
  "zephyr", "risc-v", "fpga", "cortex", "firmware", "tinyml", "edge ai",
  "edge computing", "iot", "internet of things", "sbc", "raspberry pi",
  "arduino", "yocto", "buildroot", "device driver", "linux kernel",
  "bootloader", "jetson", "on-device",
  "嵌入式", "单片机", "边缘计算", "边缘ai", "边缘 ai", "端侧", "物联网",
  "微控制器", "实时操作系统", "固件", "开发板", "裸机", "烧录", "鸿蒙", "智能硬件",
];
// 外围词：相关但也会出现在泛科技新闻中，需与其他词共现
const RELATED_KEYWORDS = [
  "soc", "npu", "gpu", "tpu", "silicon", "semiconductor", "chiplet", "sensor",
  "lidar", "radar", "imu", "mqtt", "lora", "zigbee", "bluetooth", "ble",
  "wifi", "5g", "nb-iot", "can bus", "modbus", "robot", "robotics", "drone",
  "uav", "motor", "servo", "industrial", "automation", "smart home",
  "wearable", "bms", "battery", "power management", "inference",
  "quantization", "tensorrt", "onnx", "openvino", "tflite", "neural", "llm",
  "camera", "vision", "gateway", "ai accelerator",
  "芯片", "半导体", "传感器", "模组", "推理", "模型部署", "大模型", "机器人",
  "无人机", "电机", "工业控制", "自动化", "汽车电子", "车规", "电源", "电池",
  "射频", "5g", "蓝牙", "视觉", "摄像头", "激光雷达", "毫米波", "存储",
  "算力", "开源硬件", "pcb", "示波器", "仿真", "plc",
];
// 负向词：命中即排除（股市行情 / 人事变动 / 纯资本新闻，非技术内容）
const NEGATIVE_KEYWORDS = [
  "股票", "股市", "股价", "市值", "涨停", "跌停", "收盘", "收跌",
  "财报", "营收", "净利润", "融资", "募资", "估值", "上市",
  "收购", "并购", "裁员", "离职", "任命",
  "stock market", "stock price", "share price", "market cap", "shares rose",
  "earnings", "revenue", "funding round", "venture capital", "valuation",
  "initial public offering",
  "acquires", "acquisition", "merger", "layoff", "appoints", "appointed", "resigns",
];
const SCORE_THRESHOLD = 3; // 纯外围词入选线；命中核心词时得分 >= 2 即可
const MAX_AGE_DAYS = 14; // 只保留最近 14 天的内容，保证"最新"

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
      { name: "InfoQ 中文", url: "https://www.infoq.cn/feed" },
      { name: "开源中国", url: "https://www.oschina.net/news/rss" },
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

    link = UrlPolicy.safeExternalUrl(link);
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

/* ---------- 领域相关性过滤（计分 + 负向词 + 标题近似去重） ---------- */
function topicScore(item) {
  const text = (item.title + " " + (item.summary || "")).toLowerCase();
  // 负向词一票否决
  for (const kw of NEGATIVE_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) return { score: -1, hasCore: false };
  }
  let score = 0;
  let hasCore = false;
  for (const kw of CORE_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) {
      score += 2;
      hasCore = true;
    }
  }
  for (const kw of RELATED_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) score += 1;
  }
  return { score, hasCore };
}

function isTopicRelevant(item) {
  const result = topicScore(item);
  return result.score >= SCORE_THRESHOLD || (result.score >= 2 && result.hasCore);
}

function normalizeTitle(t) {
  return t.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

// 最长公共子串长度（用于判定"同一新闻的不同来源/标题变体"）
function commonSubLen(a, b) {
  const m = b.length;
  const dp = new Array(m + 1).fill(0);
  let max = 0;
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= m; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : 0;
      if (dp[j] > max) max = dp[j];
      prev = tmp;
    }
  }
  return max;
}

function isDuplicateTitle(normTitle, accepted) {
  for (const other of accepted) {
    if (commonSubLen(normTitle, other) >= 12) return true;
  }
  return false;
}

/* ---------- 主流程 ---------- */
function selectBoardItems(items, lang, now = Date.now()) {
  // 按日期倒序、去重（按链接）
  const seen = new Set();
  const sorted = items
    .sort((a, b) => b._ts - a._ts)
    .filter((it) => {
      if (seen.has(it.link)) return false;
      seen.add(it.link);
      return true;
    });
  // 时间窗：只保留最近 MAX_AGE_DAYS 天的内容（无日期的条目保留）
  const maxAgeMs = MAX_AGE_DAYS * 24 * 3600 * 1000;
  const fresh = sorted.filter((it) => it._ts === 0 || now - it._ts <= maxAgeMs);
  const pool = fresh
    .filter(isTopicRelevant)
    .sort((a, b) => b._ts - a._ts);
  console.log(
    "  [FILTER] " + sorted.length + " -> " + pool.length + " items after topic filter"
  );
  // 标题近似去重（同一新闻的不同来源/标题变体只留一条）
  const acceptedTitles = [];
  const picked = [];
  for (const it of pool) {
    const norm = normalizeTitle(it.title);
    if (!norm) continue;
    if (isDuplicateTitle(norm, acceptedTitles)) continue;
    acceptedTitles.push(norm);
    picked.push(it);
    if (picked.length >= ITEMS_PER_BOARD) break;
  }
  return picked.map(({ title, link, source, date, summary }) => ({
    title,
    link,
    source,
    date,
    summary,
    lang,
  }));
}

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
  return selectBoardItems(items, lang);
}

/* ---------- 7 天精选归档 ---------- */
// 归档结构：window.FEED_ARCHIVE = { updatedAt, days: [{ date, boards }] }
// 每天抓取后把当天精选合并进归档（同日覆盖），只保留最近 ARCHIVE_DAYS 天。
function readArchive() {
  try {
    const raw = fs.readFileSync(ARCHIVE_FILE, "utf8");
    const m = raw.match(/window\.FEED_ARCHIVE\s*=\s*([\s\S]*?);\s*$/);
    if (m) {
      const data = JSON.parse(m[1]);
      if (data && Array.isArray(data.days)) return data;
    }
  } catch (e) {
    /* 文件不存在或格式异常时视为空归档 */
  }
  return { days: [] };
}

function updateArchive(boards, updatedAt) {
  const today = updatedAt.slice(0, 10); // UTC 日期，与条目 date 字段同源
  const archive = readArchive();
  // 移除当天的旧记录，插入今日新数据
  const days = archive.days
    .filter((d) => d && d.date && d.date !== today)
    .concat([{ date: today, boards }]);
  // 截止线：今天往前推 (ARCHIVE_DAYS - 1) 天，超过的一律丢弃
  const cutoff = new Date(Date.parse(today + "T00:00:00Z") - (ARCHIVE_DAYS - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  const kept = days
    .filter((d) => d.date >= cutoff)
    .sort((a, b) => (a.date < b.date ? 1 : -1)) // 日期倒序，最新在前
    .slice(0, ARCHIVE_DAYS);

  const payload = { updatedAt, days: kept };
  const js =
    "// Auto-generated by fetch-feeds.js at " +
    updatedAt +
    ". Do not edit manually.\n" +
    "window.FEED_ARCHIVE = " +
    JSON.stringify(payload, null, 2) +
    ";\n";
  fs.writeFileSync(ARCHIVE_FILE, js, "utf8");
  console.log(
    "Archive updated: " + kept.length + " day(s) kept (cutoff " + cutoff + ", file " + ARCHIVE_FILE + ")"
  );
}

async function main() {
  console.log("Fetching daily feeds...");
  const boards = {};
  let total = 0;
  for (const key of Object.keys(BOARDS)) {
    console.log("Board: " + BOARDS[key].label + " (" + BOARDS[key].lang + ")");
    boards[key] = await collectBoard(BOARDS[key].feeds, BOARDS[key].lang);
    total += boards[key].length;
  }

  if (total === 0) {
    throw new Error("No feed items were fetched; existing generated data was preserved.");
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
  updateArchive(boards, payload.updatedAt);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Feed update failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  parseFeed,
  isTopicRelevant,
  selectBoardItems,
};
