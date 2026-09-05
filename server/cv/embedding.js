import path from 'path';
import { fileURLToPath } from 'url';
import { withTimeout } from './classifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOAD_TIMEOUT_MS = parseInt(process.env.CV_LOAD_TIMEOUT_MS || '60000', 10);

let encoderPromise = null;

/**
 * Визуальный энкодер CLIP. Веса те же, что у zero-shot классификатора,
 * но здесь нужны сами эмбеддинги: на них обучается лёгкий классификатор
 * поверх замороженной модели.
 */
async function getEncoder() {
  if (!encoderPromise) {
    encoderPromise = withTimeout((async () => {
      const { AutoProcessor, CLIPVisionModelWithProjection, env } = await import('@xenova/transformers');
      env.cacheDir = path.join(__dirname, '../../.cache/transformers');
      env.allowLocalModels = true;
      console.log('Загрузка визуального энкодера CLIP...');
      const [processor, model] = await Promise.all([
        AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch32'),
        CLIPVisionModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch32'),
      ]);
      return { processor, model };
    })(), LOAD_TIMEOUT_MS).catch((err) => {
      console.error('CLIP encoder load failed:', err.message);
      encoderPromise = null;
      return null;
    });
  }
  return encoderPromise;
}

export function normalize(vector) {
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vector.map((v) => v / norm);
}

export function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}

/** Возвращает нормированный эмбеддинг изображения (512 чисел) или null. */
export async function embedImage(image) {
  const enc = await getEncoder();
  if (!enc) return null;
  const inputs = await enc.processor(image);
  const out = await enc.model(inputs);
  return normalize(Array.from(out.image_embeds.data));
}

/**
 * Эмбеддинг для источника, который может быть путём или уже прочитанным
 * изображением. Готовый вектор возвращается как есть — чтобы детекторы,
 * работающие в одном проходе, не считали его повторно.
 */
export async function resolveEmbedding(source, embedding, readImage) {
  if (embedding) return embedding;
  const image = typeof source === 'string' ? await readImage(source) : source;
  return embedImage(image);
}

export function serializeEmbedding(vector) {
  return vector ? JSON.stringify(vector.map((v) => Math.round(v * 1e6) / 1e6)) : null;
}

export function parseEmbedding(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}
