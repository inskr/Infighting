'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const test = require('node:test');

const PORT = 39871;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`server start timed out: ${stderr}`));
    }, 5000);

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited before listening (code ${code}): ${stderr}`));
    });
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('server on')) {
        clearTimeout(timer);
        resolve(child);
      }
    });
  });
}

test('server does not publish repository internals', async () => {
  const server = await startServer();
  try {
    for (const pathname of ['/server.js', '/package.json', '/src/db.js', '/data/stats.db']) {
      const response = await fetch(BASE_URL + pathname);
      assert.equal(response.status, 404, `${pathname} must not be publicly downloadable`);
    }
  } finally {
    server.kill();
  }
});
