import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const MAX_EDGE = parseInt(process.env.PHOTO_MAX_EDGE || '1280', 10);
const JPEG_QUALITY = parseInt(process.env.PHOTO_JPEG_QUALITY || '82', 10);

/**
 * Сжимает фото для фотоотчёта: поворот по EXIF, макс. сторона MAX_EDGE, JPEG.
 * @returns {{ path: string, filename: string, width: number, height: number, bytes: number }}
 */
export async function optimizePhoto(inputPath) {
  const dir = path.dirname(inputPath);
  const stem = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(dir, `${stem}.jpg`);
  const tempPath = path.join(dir, `${stem}.opt.tmp`);

  const pipeline = sharp(inputPath, { failOn: 'none' })
    .rotate()
    .resize(MAX_EDGE, MAX_EDGE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true });

  await pipeline.toFile(tempPath);

  if (fs.existsSync(outputPath) && outputPath !== tempPath) {
    fs.unlinkSync(outputPath);
  }
  if (inputPath !== outputPath && fs.existsSync(inputPath)) {
    fs.unlinkSync(inputPath);
  }
  fs.renameSync(tempPath, outputPath);

  const meta = await sharp(outputPath).metadata();
  const bytes = fs.statSync(outputPath).size;

  return {
    path: outputPath,
    filename: path.basename(outputPath),
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    bytes,
  };
}
