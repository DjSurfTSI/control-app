import path from 'path';
import { fileURLToPath } from 'url';
import { getCvSettings, isCvEnabledRuntime } from './settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Банкоматы Сбербанка — зелёные и серые корпуса, экран, клавиатура */
const ATM_LABELS = [
  'green Sberbank ATM terminal with screen and card slot',
  'gray Sberbank ATM terminal with screen and card slot',
  'Сбербанк зелёный банкомат с экраном и клавиатурой',
  'Сбербанк серый банкомат с экраном и клавиатурой',
  'Sberbank outdoor cash machine green branded kiosk',
  'Sberbank outdoor cash machine gray silver kiosk',
  'Russian Sberbank bank ATM with keypad and display',
  'green automated teller machine Sberbank street',
  'gray silver automated teller machine Sberbank street',
];

const REJECT_LABELS = [
  'floor tiles or concrete ground close-up photograph',
  'dirty indoor floor pavement without any machine',
  'empty asphalt street ground no ATM',
  'blank wall or ceiling surface',
  'person face portrait selfie',
  'office desk chair furniture interior',
  'paper document on table',
  'car vehicle on road',
  'grass lawn outdoor ground',
  'building facade without ATM',
];

const CV_TIMEOUT_MS = parseInt(process.env.CV_TIMEOUT_MS || '45000', 10);

const FLOOR_LABELS = [
  'floor tiles or concrete ground close-up photograph',
  'dirty indoor floor pavement without any machine',
  'empty asphalt street ground no ATM',
  'grass lawn outdoor ground',
];

let classifierPromise = null;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('CV-проверка превысила лимит времени')), ms);
    }),
  ]);
}

export function isCvEnabled() {
  return isCvEnabledRuntime();
}

async function getClassifier() {
  if (!isCvEnabledRuntime()) return null;
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

function scoreFor(results, label) {
  return results.find((r) => r.label === label)?.score ?? 0;
}

function maxScore(results, labels) {
  return Math.max(...labels.map((l) => scoreFor(results, l)));
}

function bestLabel(results, labels) {
  return labels.reduce((best, label) => (
    scoreFor(results, label) > scoreFor(results, best) ? label : best
  ), labels[0]);
}

export function evaluateDetection(results, { threshold = 0.30, margin = 0.12 } = {}) {
  const atmBest = maxScore(results, ATM_LABELS);
  const rejectBest = maxScore(results, REJECT_LABELS);
  const floorBest = maxScore(results, FLOOR_LABELS);
  const top = results[0];
  const bestAtmLabel = bestLabel(results, ATM_LABELS);
  const bestRejectLabel = bestLabel(results, REJECT_LABELS);

  const thresholdOk = atmBest >= threshold;
  const marginOk = atmBest >= rejectBest + margin;
  const topIsAtm = ATM_LABELS.includes(top?.label);
  const floorNotCompeting = floorBest < atmBest - 0.08;

  let detected = thresholdOk && marginOk && floorNotCompeting && (topIsAtm || atmBest >= rejectBest + margin * 1.5);

  let reason = 'ok';
  if (!thresholdOk) reason = 'low_confidence';
  else if (!marginOk) reason = 'reject_higher';
  else if (!floorNotCompeting) reason = 'floor_like';
  else if (!topIsAtm && atmBest < rejectBest + margin * 1.5) reason = 'top_not_atm';

  if (!detected && floorBest >= atmBest) reason = 'floor_like';

  return {
    detected,
    confidence: Math.round(atmBest * 1000) / 1000,
    topLabel: top?.label,
    bestAtmLabel,
    bestRejectLabel,
    atmBest: Math.round(atmBest * 1000) / 1000,
    rejectBest: Math.round(rejectBest * 1000) / 1000,
    floorBest: Math.round(floorBest * 1000) / 1000,
    reason,
    threshold,
    margin,
  };
}

export async function detectAtmInPhoto(filePath) {
  const settings = getCvSettings();
  if (!settings.enabled) {
    return { detected: true, confidence: 1, skipped: true };
  }

  try {
    const classifier = await getClassifier();
    if (!classifier) {
      return { detected: true, confidence: 0, skipped: true };
    }

    const { RawImage } = await import('@xenova/transformers');
    const image = await RawImage.read(filePath);
    const labels = [...ATM_LABELS, ...REJECT_LABELS];

    const results = await withTimeout(classifier(image, labels), CV_TIMEOUT_MS);
    const evaluation = evaluateDetection(results, {
      threshold: settings.threshold,
      margin: settings.margin,
    });

    if (!evaluation.detected) {
      console.log(
        `CV reject [${evaluation.reason}]: atm=${evaluation.atmBest} reject=${evaluation.rejectBest} floor=${evaluation.floorBest} top=${evaluation.topLabel}`
      );
    }

    return {
      detected: evaluation.detected,
      confidence: evaluation.confidence,
      topLabel: evaluation.topLabel,
      reason: evaluation.reason,
      atmBest: evaluation.atmBest,
      rejectBest: evaluation.rejectBest,
    };
  } catch (err) {
    console.error('CV detection error:', err.message);
    return {
      detected: true,
      confidence: 0,
      skipped: true,
      error: err.message,
    };
  }
}

export async function warmupCvModel() {
  if (!isCvEnabledRuntime()) return;
  await getClassifier();
}
