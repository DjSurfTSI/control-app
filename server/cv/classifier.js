import path from 'path';
import { fileURLToPath } from 'url';
import { isCvEnabledRuntime } from './settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CV_TIMEOUT_MS = parseInt(process.env.CV_TIMEOUT_MS || '25000', 10);
const CLASSIFIER_LOAD_TIMEOUT_MS = parseInt(process.env.CV_LOAD_TIMEOUT_MS || '60000', 10);

let classifierPromise = null;

export function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('CV-проверка превысила лимит времени')), ms);
    }),
  ]);
}

export async function getClassifier() {
  if (!isCvEnabledRuntime()) return null;
  if (!classifierPromise) {
    classifierPromise = withTimeout((async () => {
      const { pipeline, env } = await import('@xenova/transformers');
      env.cacheDir = path.join(__dirname, '../../.cache/transformers');
      env.allowLocalModels = true;
      console.log('Загрузка CV-модели (CLIP)...');
      return pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');
    })(), CLASSIFIER_LOAD_TIMEOUT_MS).catch((err) => {
      console.error('CV model load failed:', err.message);
      classifierPromise = null;
      return null;
    });
  }
  return classifierPromise;
}

export async function readImage(filePath) {
  const { RawImage } = await import('@xenova/transformers');
  return RawImage.read(filePath);
}

/** Один прогон zero-shot классификации. Возвращает null, если модель недоступна. */
export async function classifyImage(image, labels) {
  const classifier = await getClassifier();
  if (!classifier) return null;
  return withTimeout(classifier(image, labels), CV_TIMEOUT_MS);
}

export function scoreFor(results, label) {
  return results.find((r) => r.label === label)?.score ?? 0;
}

export function maxScore(results, labels) {
  return Math.max(...labels.map((l) => scoreFor(results, l)));
}

/**
 * Сумма вероятностей набора промптов — ансамблирование подсказок.
 * Softmax по подмножеству равен перенормировке этих сумм, поэтому суммы
 * можно сравнивать между группами и сводить к попарным вероятностям.
 */
export function sumScore(results, labels) {
  return labels.reduce((acc, l) => acc + scoreFor(results, l), 0);
}

export function bestLabel(results, labels) {
  return labels.reduce((best, label) => (
    scoreFor(results, label) > scoreFor(results, best) ? label : best
  ), labels[0]);
}

export function round3(value) {
  return Math.round(value * 1000) / 1000;
}
