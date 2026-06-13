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
 */
export async function optimizePhoto(inputPath) {
  const stats = fs.statSync(inputPath);

  if (SKIP_SHARP || stats.size <= PASSTHROUGH_MAX_BYTES) {
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
    await sharp(inputPath, {
      failOn: 'none',
      limitInputPixels: 20_000_000,
      animated: false,
    })
      .rotate()
      .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
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
