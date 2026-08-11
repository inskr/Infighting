'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');
const { buildHeroImages } = require('../scripts/build-images');

sharp.cache(false);

test('writes bounded responsive hero variants', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-images-'));
  const source = path.join(root, 'hero-source.png');
  const outputDir = path.join(root, 'output');

  try {
    await sharp({
      create: {
        width: 2000,
        height: 1200,
        channels: 4,
        background: { r: 21, g: 31, b: 42, alpha: 1 },
      },
    })
      .png()
      .toFile(source);

    const outputs = await buildHeroImages({
      source,
      outputDir,
      widths: [640, 1280, 1920],
    });

    assert.equal(outputs.length, 7);
    for (const output of outputs) {
      const metadata = await sharp(output.path).metadata();
      assert.ok(metadata.width <= 1920);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
