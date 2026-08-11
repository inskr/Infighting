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
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'hero-ink-320.webp'), 'stale', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'hero-ink.png'), 'legacy', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'keep-me.txt'), 'unrelated', 'utf8');
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
    assert.equal(fs.existsSync(path.join(outputDir, 'hero-ink-320.webp')), false);
    assert.equal(fs.existsSync(path.join(outputDir, 'hero-ink.png')), false);
    assert.equal(fs.existsSync(path.join(outputDir, 'keep-me.txt')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('keeps actual Hero source outputs within generous byte budgets', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-budget-'));
  const source = path.join(__dirname, '..', 'assets', 'images', 'hero-ink-source.png');
  const outputDir = path.join(root, 'output');
  const perFileByteCeilings = {
    'hero-ink-640.avif': 200_000,
    'hero-ink-640.webp': 200_000,
    'hero-ink-1280.avif': 400_000,
    'hero-ink-1280.webp': 400_000,
    'hero-ink-1920.avif': 750_000,
    'hero-ink-1920.webp': 750_000,
    'hero-ink-1920.png': 1_500_000
  };

  try {
    await buildHeroImages({
      source,
      outputDir,
      widths: [640, 1280, 1920]
    });

    for (const [filename, ceiling] of Object.entries(perFileByteCeilings)) {
      const bytes = fs.statSync(path.join(outputDir, filename)).size;
      assert.ok(bytes <= ceiling, `${filename}: ${bytes} bytes exceeds ${ceiling}`);
    }

    const mobileBytes =
      fs.statSync(path.join(outputDir, 'hero-ink-640.avif')).size +
      fs.statSync(path.join(outputDir, 'hero-ink-640.webp')).size;
    assert.ok(
      mobileBytes <= 300_000,
      `640px AVIF+WebP total: ${mobileBytes} bytes exceeds 300000`
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
