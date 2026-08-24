'use strict';

const { spawnSync } = require('node:child_process');

const cleanupPreload = '--require=./scripts/lighthouse-windows-rm-retry.cjs';

function createLighthouseEnvironment(environment = process.env) {
  return {
    ...environment,
    NODE_OPTIONS: [environment.NODE_OPTIONS, cleanupPreload].filter(Boolean).join(' ')
  };
}

function createLighthouseArguments(argumentsList = process.argv.slice(2)) {
  return argumentsList.length
    ? [...argumentsList]
    : ['autorun', '--config=.lighthouserc.cjs'];
}

function run() {
  const cliPath = require.resolve('@lhci/cli/src/cli.js');
  const result = spawnSync(
    process.execPath,
    [cliPath, ...createLighthouseArguments()],
    {
      cwd: process.cwd(),
      env: createLighthouseEnvironment(),
      stdio: 'inherit'
    }
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (require.main === module) run();

module.exports = { createLighthouseArguments, createLighthouseEnvironment };
