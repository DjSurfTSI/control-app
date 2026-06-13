import fs from 'fs';
import path from 'path';

const MAX_EDGE = parseInt(process.env.PHOTO_MAX_EDGE || '1280', 10);
const JPEG_QUALITY = parseInt(process.env.PHOTO_JPEG_QUALITY || '82', 10);
const SKIP_SHARP = process.env.PHOTO_SKIP_SHARP === 'true';
const PASSTHROUGH_MAX_BYTES = parseInt(process.env.PHOTO_PASSTHROUGH_MAX_BYTES || '1800000', 10);

function passthrough(inputPath) {
  const stats = fs.statSync(inputPath);
  if (stats.size > PASSTHROUGH_MAX_BYTES) {
    throw new Error(`Файл слишком большой (${Math.round(stats.size / 1024)} КБ)`);
  }
  return {
    path: inputPath,
    filename: path.basename(inputPath),
    width: 0,
    height: 0,
    bytes: stats.size,
    optimized: false,
  };
}

/**
 * Сжимает фото: sharp на сервере, либо passthrough если уже сжато клиентом / PHOTO_SKIP_SHARP.
 * @param {string} inputPath
 * @param {{ watermark?: string }} [options]
 */
export async function optimizePhoto(inputPath, options = {}) {
  const { watermark } = options;
  const stats = fs.statSync(inputPath);

  if ((SKIP_SHARP || stats.size <= PASSTHROUGH_MAX_BYTES) && !watermark) {
    console.log(`optimizePhoto passthrough: ${path.basename(inputPath)} (${stats.size} bytes)`);
    return passthrough(inputPath);
  }

  const sharp = (await import('sharp')).default;
  sharp.cache(false);
  sharp.concurrency(1);

  const dir = path.dirname(inputPath);
  const stem = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(dir, `${stem}.jpg`);
  const tempPath = path.join(dir, `${stem}.opt.tmp`);

  try {
    let pipeline = sharp(inputPath, {
      failOn: 'none',
      limitInputPixels: 20_000_000,
      animated: false,
    })
      .rotate()
      .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true });

    if (watermark) {
      const meta = await sharp(inputPath).metadata();
      const width = Math.min(meta.width || MAX_EDGE, MAX_EDGE);
      const fontSize = Math.max(14, Math.round(width / 28));
      const svg = `
        <svg width="${width}" height="${fontSize + 16}">
          <style>.t { fill: rgba(255,255,255,0.95); font-size: ${fontSize}px; font-family: Arial, sans-serif; }</style>
          <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.35)"/>
          <text x="8" y="${fontSize + 2}" class="t">${watermark.replace(/[<>&'"]/g, '')}</text>
        </svg>`;
      pipeline = pipeline.composite([{ input: Buffer.from(svg), gravity: 'southwest' }]);
    }

    await pipeline
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: false })
      .toFile(tempPath);

    if (fs.existsSync(outputPath) && outputPath !== tempPath) {
      fs.unlinkSync(outputPath);
    }
    if (inputPath !== outputPath && fs.existsSync(inputPath)) {
      fs.unlinkSync(inputPath);
    }
    fs.renameSync(tempPath, outputPath);

    const meta = await sharp(outputPath, { animated: false }).metadata();
    const bytes = fs.statSync(outputPath).size;

    return {
      path: outputPath,
      filename: path.basename(outputPath),
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      bytes,
      optimized: true,
    };
  } catch (err) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    console.error('optimizePhoto sharp failed, passthrough:', err.message);
    if (stats.size <= PASSTHROUGH_MAX_BYTES * 2) {
      return passthrough(inputPath);
    }
    throw err;
  }
}
