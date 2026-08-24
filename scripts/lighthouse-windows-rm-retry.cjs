'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { syncBuiltinESMExports } = require('node:module');

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function createRetryingRmSync({
  rmSync,
  tempRoot,
  sleep: wait = sleep,
  maxRetries = 10,
  retryDelay = 100
}) {
  const resolvedTempRoot = path.resolve(tempRoot);

  return function retryingRmSync(target, options) {
    const resolvedTarget = path.resolve(String(target));
    const isLighthouseProfile =
      options?.recursive === true &&
      path.dirname(resolvedTarget) === resolvedTempRoot &&
      /^lighthouse\.\d+$/.test(path.basename(resolvedTarget));

    for (let attempt = 0; ; attempt += 1) {
      try {
        return rmSync(target, options);
      } catch (error) {
        if (!isLighthouseProfile || error?.code !== 'EPERM' || attempt >= maxRetries) {
          throw error;
        }
        wait(retryDelay);
      }
    }
  };
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (process.platform === 'win32' && nodeMajor >= 24) {
  fs.rmSync = createRetryingRmSync({
    rmSync: fs.rmSync.bind(fs),
    tempRoot: os.tmpdir()
  });
  syncBuiltinESMExports();
}

module.exports = { createRetryingRmSync };
