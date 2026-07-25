// QA 并发准确性验证脚本（独立验证，不修改业务源码）
// 用法: node tests/qa_concurrency.test.mjs
// 默认目标 http://localhost:3210，可用 BASE_URL 覆盖。
// 证明：N 个并发 view/like 请求后，计数累加准确（不丢数 / 无 lost update）。
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

async function postJSON(path) {
  const res = await fetch(BASE + path, { method: 'POST' });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* ignore */ }
  return { status: res.status, json };
}

async function getStats(id) {
  const res = await fetch(BASE + '/api/content/' + encodeURIComponent(id) + '/stats');
  const json = await res.json();
  return json.data;
}

// 并发发 N 个 view 请求
async function concurrentViews(id, n) {
  const reqs = [];
  for (let i = 0; i < n; i++) reqs.push(postJSON('/api/content/' + encodeURIComponent(id) + '/view'));
  return Promise.all(reqs);
}

// 并发发 N 个 like 请求
async function concurrentLikes(id, n) {
  const reqs = [];
  for (let i = 0; i < n; i++) reqs.push(postJSON('/api/content/' + encodeURIComponent(id) + '/like'));
  return Promise.all(reqs);
}

async function main() {
  console.log('\n====== [并发准确性测试] BASE=' + BASE + ' ======');

  const id = 'concurrent-1';

  // 第一轮：并发 100 view + 100 like
  console.log('\n[Round 1] 并发 100 view + 100 like (Promise.all 真实并发)');
  const [views1, likes1] = await Promise.all([
    concurrentViews(id, 100),
    concurrentLikes(id, 100)
  ]);
  // 检查每个请求都成功返回
  const vOk = views1.every(r => r.status === 200 && r.json && r.json.code === 0);
  const lOk = likes1.every(r => r.status === 200 && r.json && r.json.code === 0);
  ok(vOk, '100 个 view 请求全部 HTTP 200 / code=0', '失败数=' + views1.filter(r => !(r.status === 200 && r.json && r.json.code === 0)).length);
  ok(lOk, '100 个 like 请求全部 HTTP 200 / code=0', '失败数=' + likes1.filter(r => !(r.status === 200 && r.json && r.json.code === 0)).length);

  let s1 = await getStats(id);
  ok(s1 && s1.viewCount === 100, 'Round1 viewCount === 100', JSON.stringify(s1));
  ok(s1 && s1.likeCount === 100, 'Round1 likeCount === 100', JSON.stringify(s1));

  // 第二轮：再并发 50 view + 50 like，累加到 150
  console.log('\n[Round 2] 再并发 50 view + 50 like (累加)');
  const [views2, likes2] = await Promise.all([
    concurrentViews(id, 50),
    concurrentLikes(id, 50)
  ]);
  const vOk2 = views2.every(r => r.status === 200 && r.json && r.json.code === 0);
  const lOk2 = likes2.every(r => r.status === 200 && r.json && r.json.code === 0);
  ok(vOk2, '50 个 view 请求全部成功', '失败数=' + views2.filter(r => !(r.status === 200 && r.json && r.json.code === 0)).length);
  ok(lOk2, '50 个 like 请求全部成功', '失败数=' + likes2.filter(r => !(r.status === 200 && r.json && r.json.code === 0)).length);

  let s2 = await getStats(id);
  ok(s2 && s2.viewCount === 150, 'Round2 viewCount === 150', JSON.stringify(s2));
  ok(s2 && s2.likeCount === 150, 'Round2 likeCount === 150', JSON.stringify(s2));

  console.log('\n========== [并发准确性测试] 汇总 ==========');
  console.log('PASS ' + PASS + ' / FAIL ' + FAIL);
  if (failures.length) {
    console.log('失败项:');
    failures.forEach(f => console.log('  - ' + f));
  }
  process.exit(FAIL === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('并发测试脚本异常:', err);
  process.exit(2);
});
