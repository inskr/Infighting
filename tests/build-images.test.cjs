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

    const expectedOutputs = [
      {
        filename: 'hero-ink-640.avif',
        declaredWidth: 640,
        declaredFormat: 'avif',
        metadataWidth: 640,
        metadataFormat: 'heif',
      },
      {
        filename: 'hero-ink-640.webp',
        declaredWidth: 640,
        declaredFormat: 'webp',
        metadataWidth: 640,
        metadataFormat: 'webp',
      },
      {
        filename: 'hero-ink-1280.avif',
        declaredWidth: 1280,
        declaredFormat: 'avif',
        metadataWidth: 1280,
        metadataFormat: 'heif',
      },
      {
        filename: 'hero-ink-1280.webp',
        declaredWidth: 1280,
        declaredFormat: 'webp',
        metadataWidth: 1280,
        metadataFormat: 'webp',
      },
      {
        filename: 'hero-ink-1920.avif',
        declaredWidth: 1920,
        declaredFormat: 'avif',
        metadataWidth: 1920,
        metadataFormat: 'heif',
      },
      {
        filename: 'hero-ink-1920.webp',
        declaredWidth: 1920,
        declaredFormat: 'webp',
        metadataWidth: 1920,
        metadataFormat: 'webp',
      },
      {
        filename: 'hero-ink-1920.png',
        declaredWidth: 1920,
        declaredFormat: 'png',
        metadataWidth: 1920,
        metadataFormat: 'png',
      },
    ];

    const actualOutputs = [];
    for (const output of outputs) {
      const metadata = await sharp(output.path).metadata();
      actualOutputs.push({
        filename: path.basename(output.path),
        declaredWidth: output.width,
        declaredFormat: output.format,
        metadataWidth: metadata.width,
        metadataFormat: metadata.format,
      });
    }

    assert.deepEqual(actualOutputs, expectedOutputs);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
