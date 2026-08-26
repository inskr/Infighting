'use strict';

const { chromium } = require('@playwright/test');

const baseUrl = 'http://127.0.0.1:4173';
const githubActionsChromeFlags = process.env.GITHUB_ACTIONS === 'true'
  ? '--no-sandbox'
  : undefined;

module.exports = {
  ci: {
    collect: {
      startServerCommand: 'node tests/browser/test-server.cjs',
      startServerReadyPattern: 'Browser test server listening',
      numberOfRuns: 3,
      url: [
        `${baseUrl}/`,
        `${baseUrl}/search.html?q=STM32`,
        `${baseUrl}/posts/stm32-baremetal-scheduler.html`
      ],
      chromePath: chromium.executablePath(),
      settings: {
        // Lighthouse's supported mobile profile is its default form factor;
        // there is no valid `preset: 'mobile'` CLI value.
        formFactor: 'mobile',
        ...(githubActionsChromeFlags ? { chromeFlags: githubActionsChromeFlags } : {})
      }
    },
    assert: {
      aggregationMethod: 'median-run',
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }]
      }
    }
  }
};
