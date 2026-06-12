import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ATM_LABELS = [
  'bank ATM machine',
  'automated teller machine',
  'cash dispenser ATM outdoor',
];

const OTHER_LABELS = [
  'empty wall',
  'floor surface',
  'person portrait',
  'office room interior',
  'street without ATM',
  'paper document',
];

const THRESHOLD = parseFloat(process.env.CV_ATM_THRESHOLD || '0.18');
const CV_ENABLED = process.env.CV_ENABLED !== 'false';

let classifierPromise = null;

export function isCvEnabled() {
  return CV_ENABLED;
}

async function getClassifier() {
  if (!CV_ENABLED) return null;
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const { pipeline, env } = await import('@xenova/transformers');
      env.cacheDir = path.join(__dirname, '../../.cache/transformers');
      env.allowLocalModels = true;
      console.log('Загрузка CV-модели (CLIP)...');
      return pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');
    })().catch((err) => {
      console.error('CV model load failed:', err.message);
      classifierPromise = null;
      return null;
    });
  }
  return classifierPromise;
}

/**
 * @returns {{ detected: boolean, confidence: number, skipped?: boolean, topLabel?: string }}
 */
export async function detectAtmInPhoto(filePath) {
  if (!CV_ENABLED) {
    return { detected: true, confidence: 1, skipped: true };
  }

  const classifier = await getClassifier();
  if (!classifier) {
    return { detected: true, confidence: 0, skipped: true };
  }

  const { RawImage } = await import('@xenova/transformers');
  const image = await RawImage.read(filePath);
  const labels = [...ATM_LABELS, ...OTHER_LABELS];
  const results = await classifier(image, labels);

  const scoreFor = (label) => results.find((r) => r.label === label)?.score ?? 0;
  const atmBest = Math.max(...ATM_LABELS.map(scoreFor));
  const otherBest = Math.max(...OTHER_LABELS.map(scoreFor));
  const top = results[0];

  const detected = atmBest >= THRESHOLD && atmBest >= otherBest;

  return {
    detected,
    confidence: Math.round(atmBest * 1000) / 1000,
    topLabel: top?.label,
    atmBest,
    otherBest,
  };
}

export async function warmupCvModel() {
  if (!CV_ENABLED) return;
  await getClassifier();
}
