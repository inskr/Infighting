'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT_DIR = path.join(__dirname, '..');
const SOURCE = path.join(ROOT_DIR, 'assets', 'images', 'hero-ink-source.png');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'assets', 'images');
const WIDTHS = [640, 1280, 1920];
const PNG_FALLBACK_WIDTH = 1920;

async function writeVariant({ source, outputPath, width, format, options }) {
  const { width: outputWidth } = await sharp(source)
    .resize({ width, withoutEnlargement: true })
    [format](options)
    .toFile(outputPath);

  return { path: outputPath, width: outputWidth, format };
}

async function buildHeroImages({ source, outputDir, widths }) {
  fs.mkdirSync(outputDir, { recursive: true });

  const outputs = [];
  for (const width of widths) {
    outputs.push(
      await writeVariant({
        source,
        outputPath: path.join(outputDir, `hero-ink-${width}.avif`),
        width,
        format: 'avif',
        options: { quality: 55 },
      })
    );
    outputs.push(
      await writeVariant({
        source,
        outputPath: path.join(outputDir, `hero-ink-${width}.webp`),
        width,
        format: 'webp',
        options: { quality: 72 },
      })
    );
  }

  outputs.push(
    await writeVariant({
      source,
      outputPath: path.join(outputDir, 'hero-ink-1920.png'),
      width: PNG_FALLBACK_WIDTH,
      format: 'png',
      options: { compressionLevel: 9 },
    })
  );

  return outputs;
}

if (require.main === module) {
  buildHeroImages({ source: SOURCE, outputDir: OUTPUT_DIR, widths: WIDTHS })
    .then((outputs) => {
      console.log(`Generated ${outputs.length} responsive hero images.`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { buildHeroImages };
