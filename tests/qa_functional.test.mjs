// QA 功能验证脚本（独立验证，不修改业务源码）
// 用法: node tests/qa_functional.test.mjs
// 默认目标 http://localhost:3210，可用 BASE_URL 覆盖。
'use strict';

const BASE = process.env.BASE_URL || 'http://localhost:3210';

let PASS = 0;
let FAIL = 0;
const failures = [];

function ok(cond, name, detail) {
  if (cond) {
    PASS++;
    console.log('  ✅ PASS  ' + name);
  } else {
    FAIL++;
    const msg = name + (detail ? '  -> ' + detail : '');
    failures.push(msg);
    console.log('  ❌ FAIL  ' + msg);
  }
}

async function getJSON(path) {
  const res = await fetch(BASE + path);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* 非 JSON（静态文件） */ }
  return { status: res.status, json, text, contentType: res.headers.get('content-type') || '' };
}

async function postJSON(path) {
  const res = await fetch(BASE + path, { method: 'POST' });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* 非 JSON */ }
  return { status: res.status, json, text };
}

async function main() {
  console.log('\n====== [功能测试] BASE=' + BASE + ' ======');

  // 1. 初始批量统计应为空 map
  console.log('\n[1] GET /api/content/stats 初始为空');
  let r = await getJSON('/api/content/stats');
  ok(r.status === 200, '批量 stats HTTP 200', 'got ' + r.status);
  ok(r.json && r.json.code === 0, '批量 stats code=0', JSON.stringify(r.json));
  ok(r.json && r.json.data && Object.keys(r.json.data).length === 0,
     '批量 stats 初始为空 map', JSON.stringify(r.json && r.json.data));

  // 2. test-1 view 累加
  console.log('\n[2] POST /api/content/test-1/view 累加');
  let v1 = await postJSON('/api/content/test-1/view');
  ok(v1.json && v1.json.data && v1.json.data.viewCount === 1, 'view 第1次 -> 1', JSON.stringify(v1.json));
  let v2 = await postJSON('/api/content/test-1/view');
  ok(v2.json && v2.json.data && v2.json.data.viewCount === 2, 'view 第2次 -> 2', JSON.stringify(v2.json));

  // 3. test-1 like 累加
  console.log('\n[3] POST /api/content/test-1/like 累加');
  let l1 = await postJSON('/api/content/test-1/like');
  ok(l1.json && l1.json.data && l1.json.data.likeCount === 1, 'like 第1次 -> 1', JSON.stringify(l1.json));
  let l2 = await postJSON('/api/content/test-1/like');
  ok(l2.json && l2.json.data && l2.json.data.likeCount === 2, 'like 第2次 -> 2', JSON.stringify(l2.json));

  // 4. 单条 stats
  console.log('\n[4] GET /api/content/test-1/stats');
  let s = await getJSON('/api/content/test-1/stats');
  ok(s.json && s.json.data && s.json.data.viewCount === 2 && s.json.data.likeCount === 2,
     'test-1 {viewCount:2, likeCount:2}', JSON.stringify(s.json && s.json.data));

  // 5. 未知 id 兜底全 0
  console.log('\n[5] GET /api/content/unknown-id/stats 兜底全0');
  let u = await getJSON('/api/content/unknown-id/stats');
  ok(u.json && u.json.data && u.json.data.viewCount === 0 && u.json.data.likeCount === 0,
     'unknown-id {viewCount:0, likeCount:0}', JSON.stringify(u.json && u.json.data));

  // 6. 静态托管
  console.log('\n[6] 静态托管');
  let idx = await getJSON('/');
  ok(idx.status === 200 && /html/i.test(idx.contentType) && /<html/i.test(idx.text),
     'GET / 返回 index.html', 'status=' + idx.status + ' ct=' + idx.contentType);
  let js = await getJSON('/assets/js/stats.js');
  ok(js.status === 200 && /javascript/.test(js.contentType) && /formatCount/.test(js.text),
     'GET /assets/js/stats.js 返回 JS', 'status=' + js.status + ' ct=' + js.contentType);

  console.log('\n========== [功能测试] 汇总 ==========');
  console.log('PASS ' + PASS + ' / FAIL ' + FAIL);
  if (failures.length) {
    console.log('失败项:');
    failures.forEach(f => console.log('  - ' + f));
  }
  process.exit(FAIL === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('功能测试脚本异常:', err);
  process.exit(2);
});
