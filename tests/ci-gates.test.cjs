'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const lighthouseConfigPath = path.join(rootDir, '.lighthouserc.cjs');
const workflowPath = path.join(rootDir, '.github', 'workflows', 'deploy.yml');
const cleanupRetryPath = path.join(
  rootDir,
  'scripts',
  'lighthouse-windows-rm-retry.cjs'
);
const lighthouseRunnerPath = path.join(rootDir, 'scripts', 'run-lighthouse.cjs');

function readPackageJson() {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

function loadLighthouseConfig() {
  assert.equal(
    fs.existsSync(lighthouseConfigPath),
    true,
    '.lighthouserc.cjs must exist'
  );
  delete require.cache[lighthouseConfigPath];
  return require(lighthouseConfigPath);
}

function unquote(value) {
  const trimmed = value.trim();
  if (/^(['"]).*\1$/.test(trimmed)) return trimmed.slice(1, -1);
  return trimmed;
}

function parseStepBlocks(source) {
  const lines = source.split(/\r?\n/);
  const steps = [];
  let current = null;

  for (let index = 0; index < lines.length; index += 1) {
    const nameMatch = /^ {6}- name:\s*(.+)$/.exec(lines[index]);
    if (nameMatch) {
      current = { name: unquote(nameMatch[1]), with: Object.create(null) };
      steps.push(current);
      continue;
    }
    if (!current) continue;

    const propertyMatch = /^ {8}(uses|run|id|continue-on-error):\s*(.*)$/.exec(lines[index]);
    if (propertyMatch) {
      const [, key, rawValue] = propertyMatch;
      if (key === 'run' && rawValue.trim() === '|') {
        const commandLines = [];
        while (index + 1 < lines.length && /^ {10}/.test(lines[index + 1])) {
          index += 1;
          commandLines.push(lines[index].slice(10));
        }
        current.run = commandLines.join('\n').trim();
      } else {
        current[key] = unquote(rawValue);
      }
      continue;
    }

    if (/^ {8}with:\s*$/.test(lines[index])) {
      while (index + 1 < lines.length) {
        const withMatch = /^ {10}([^:#]+):\s*(.+)$/.exec(lines[index + 1]);
        if (!withMatch) break;
        index += 1;
        current.with[withMatch[1].trim()] = unquote(withMatch[2]);
      }
    }
  }

  return steps;
}

function parseRootMapping(source, key) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `${key}:`);
  assert.notEqual(start, -1, `workflow must contain ${key}`);
  const mapping = Object.create(null);
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\S/.test(lines[index])) break;
    const match = /^ {2}([^:#]+):\s*(.+)$/.exec(lines[index]);
    if (match) mapping[match[1].trim()] = unquote(match[2]);
  }
  return mapping;
}

function findStepIndex(steps, predicate, description) {
  const index = steps.findIndex(predicate);
  assert.notEqual(index, -1, `workflow must contain ${description}`);
  return index;
}

test('package pins Lighthouse CI and exposes its gate script', () => {
  const packageJson = readPackageJson();
  assert.match(
    packageJson.devDependencies['@lhci/cli'] || '',
    /^\d+\.\d+\.\d+$/,
    '@lhci/cli must be pinned to an exact version'
  );
  assert.equal(
    packageJson.scripts['test:lighthouse'],
    'node scripts/run-lighthouse.cjs'
  );
});

test('Lighthouse runner propagates cleanup preload through NODE_OPTIONS', () => {
  assert.equal(fs.existsSync(lighthouseRunnerPath), true, 'Lighthouse runner must exist');
  const { createLighthouseEnvironment } = require(lighthouseRunnerPath);
  const parentEnvironment = {
    PATH: process.env.PATH,
    NODE_OPTIONS: '--trace-warnings'
  };
  const childEnvironment = createLighthouseEnvironment(parentEnvironment);

  assert.equal(parentEnvironment.NODE_OPTIONS, '--trace-warnings');
  assert.equal(
    childEnvironment.NODE_OPTIONS,
    '--trace-warnings --require=./scripts/lighthouse-windows-rm-retry.cjs'
  );

  const child = require('node:child_process').spawnSync(
    process.execPath,
    ['-p', 'process.env.NODE_OPTIONS'],
    { cwd: rootDir, encoding: 'utf8', env: childEnvironment }
  );
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), childEnvironment.NODE_OPTIONS);
});

test('Lighthouse runner defaults to the full gate and accepts an explicit scoped collect command', () => {
  const { createLighthouseArguments } = require(lighthouseRunnerPath);
  assert.deepEqual(
    createLighthouseArguments([]),
    ['autorun', '--config=.lighthouserc.cjs']
  );
  const scoped = [
    'collect',
    '--config=.lighthouserc.cjs',
    '--url=http://127.0.0.1:4173/search.html?q=STM32',
    '--numberOfRuns=1'
  ];
  assert.deepEqual(createLighthouseArguments(scoped), scoped);
  assert.notEqual(createLighthouseArguments(scoped), scoped);
});

test('generated Lighthouse reports stay outside version control', () => {
  const ignored = require('node:child_process').spawnSync(
    'git',
    ['check-ignore', '-q', '.lighthouseci/probe.json'],
    { cwd: rootDir }
  );
  assert.equal(ignored.status, 0, '.lighthouseci/ must be ignored');
});

test('Windows Lighthouse cleanup retries only its measured temporary-profile EPERM', () => {
  assert.equal(fs.existsSync(cleanupRetryPath), true, 'cleanup retry preload must exist');
  const { createRetryingRmSync } = require(cleanupRetryPath);
  const target = path.join(path.resolve(require('node:os').tmpdir()), 'lighthouse.12345');
  const options = { recursive: true, force: true, maxRetries: 10 };
  const calls = [];
  const delays = [];
  const expected = Symbol('removed');
  const retryingRmSync = createRetryingRmSync({
    tempRoot: path.resolve(require('node:os').tmpdir()),
    rmSync(filePath, receivedOptions) {
      calls.push({ filePath, receivedOptions });
      if (calls.length < 3) {
        const error = new Error('profile is still locked');
        error.code = 'EPERM';
        throw error;
      }
      return expected;
    },
    sleep(milliseconds) {
      delays.push(milliseconds);
    }
  });

  assert.equal(retryingRmSync(target, options), expected);
  assert.equal(calls.length, 3);
  assert.deepEqual(delays, [100, 100]);
  assert.ok(calls.every((call) => call.filePath === target));
  assert.ok(calls.every((call) => call.receivedOptions === options));
});

test('Windows Lighthouse cleanup retry stays bounded and does not mask other deletes', () => {
  assert.equal(fs.existsSync(cleanupRetryPath), true, 'cleanup retry preload must exist');
  const { createRetryingRmSync } = require(cleanupRetryPath);
  const tempRoot = path.resolve(require('node:os').tmpdir());
  const delays = [];
  let calls = 0;
  const retryingRmSync = createRetryingRmSync({
    tempRoot,
    maxRetries: 2,
    rmSync() {
      calls += 1;
      const error = new Error('still locked');
      error.code = 'EPERM';
      throw error;
    },
    sleep(milliseconds) {
      delays.push(milliseconds);
    }
  });

  assert.throws(
    () => retryingRmSync(path.join(tempRoot, 'lighthouse.9876'), { recursive: true }),
    { code: 'EPERM' }
  );
  assert.equal(calls, 3);
  assert.deepEqual(delays, [100, 100]);

  calls = 0;
  delays.length = 0;
  assert.throws(
    () => retryingRmSync(path.join(rootDir, 'lighthouse.9876'), { recursive: true }),
    { code: 'EPERM' }
  );
  assert.equal(calls, 1);
  assert.deepEqual(delays, []);
});

test('Lighthouse collection uses the simulated mobile baseline for three runs on fixed URLs', async () => {
  const config = loadLighthouseConfig();
  const collect = config.ci.collect;
  const { chromium } = require('@playwright/test');
  const { determineChromePath } = require('@lhci/cli/src/utils.js');
  const lighthouseConfigUrl = pathToFileURL(
    path.join(rootDir, 'node_modules', 'lighthouse', 'core', 'config', 'config.js')
  );
  const { initializeConfig } = await import(lighthouseConfigUrl.href);

  assert.equal(collect.startServerCommand, 'node tests/browser/test-server.cjs');
  assert.equal(collect.numberOfRuns, 3);
  assert.deepEqual(
    collect.url.map((value) => {
      const url = new URL(value);
      return `${url.pathname}${url.search}`;
    }),
    ['/', '/search.html?q=STM32', '/posts/stm32-baremetal-scheduler.html']
  );
  assert.equal(collect.settings.formFactor, 'mobile');
  assert.equal(collect.settings.throttlingMethod, undefined);
  assert.equal(collect.chromePath, chromium.executablePath());
  assert.equal(determineChromePath(collect), chromium.executablePath());

  const { resolvedConfig } = await initializeConfig(
    'navigation',
    undefined,
    collect.settings
  );
  assert.equal(resolvedConfig.settings.formFactor, 'mobile');
  assert.equal(resolvedConfig.settings.throttlingMethod, 'simulate');
  assert.equal(resolvedConfig.settings.screenEmulation.mobile, true);
});

test('Lighthouse assertions keep every performance and accessibility failure blocking', () => {
  const config = loadLighthouseConfig();
  assert.equal(config.ci.assert.aggregationMethod, 'median-run');
  assert.deepEqual(config.ci.assert.assertions, {
    'categories:performance': ['error', { minScore: 0.9 }],
    'categories:accessibility': ['error', { minScore: 0.95 }],
    'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
    'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
    'total-blocking-time': ['error', { maxNumericValue: 200 }]
  });
});

test('deployment preserves Pages settings and runs every gate before volatile feeds and upload', () => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  const steps = parseStepBlocks(source);
  const permissions = parseRootMapping(source, 'permissions');
  const concurrency = parseRootMapping(source, 'concurrency');

  assert.deepEqual({ ...permissions }, {
    contents: 'write',
    pages: 'write',
    'id-token': 'write'
  });
  assert.deepEqual({ ...concurrency }, {
    group: 'pages',
    'cancel-in-progress': 'true'
  });

  const build = findStepIndex(steps, (step) => step.run === 'npm run build', 'site build');
  const chromium = findStepIndex(
    steps,
    (step) => step.run === 'npx playwright install --with-deps chromium',
    'Playwright Chromium installation'
  );
  const unit = findStepIndex(steps, (step) => step.run === 'npm test', 'unit gate');
  const axe = findStepIndex(steps, (step) => step.run === 'npm run test:a11y', 'axe gate');
  const lighthouse = findStepIndex(
    steps,
    (step) => step.run === 'npm run test:lighthouse',
    'Lighthouse gate'
  );
  const feeds = findStepIndex(
    steps,
    (step) => step.run === 'node scripts/fetch-feeds.js',
    'volatile feed fetch'
  );
  const configure = findStepIndex(
    steps,
    (step) => step.uses === 'actions/configure-pages@v5',
    'Pages configuration'
  );
  const upload = findStepIndex(
    steps,
    (step) => step.uses === 'actions/upload-pages-artifact@v3',
    'Pages artifact upload'
  );
  const deploy = findStepIndex(
    steps,
    (step) => step.uses === 'actions/deploy-pages@v4',
    'Pages deployment'
  );

  assert.deepEqual(
    [chromium, unit, axe, lighthouse],
    [build + 1, build + 2, build + 3, build + 4],
    'Chromium and all three gates must immediately follow the build'
  );
  assert.ok(lighthouse < feeds, 'feed fetching must happen after verification');
  assert.ok(feeds < configure && configure < upload && upload < deploy);
  assert.equal(steps[upload].with.path, 'public');
  assert.equal(steps[deploy].id, 'deployment');
  assert.equal(steps[deploy].with.enablement, 'true');
});
