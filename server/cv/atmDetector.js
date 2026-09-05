import { getCvSettings, isCvEnabledRuntime } from './settings.js';
import {
  bestLabel,
  classifyImage,
  getClassifier,
  maxScore,
  readImage,
  round3,
} from './classifier.js';

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

const FLOOR_LABELS = [
  'floor tiles or concrete ground close-up photograph',
  'dirty indoor floor pavement without any machine',
  'empty asphalt street ground no ATM',
  'grass lawn outdoor ground',
];

export function isCvEnabled() {
  return isCvEnabledRuntime();
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
    confidence: round3(atmBest),
    topLabel: top?.label,
    bestAtmLabel,
    bestRejectLabel,
    atmBest: round3(atmBest),
    rejectBest: round3(rejectBest),
    floorBest: round3(floorBest),
    reason,
    threshold,
    margin,
  };
}

/**
 * Проверка наличия банкомата на фото.
 * @param {string|object} source путь к файлу или уже прочитанный RawImage
 */
export async function detectAtmInPhoto(source) {
  const settings = getCvSettings();
  if (!settings.enabled) {
    return { detected: true, confidence: 1, skipped: true };
  }

  try {
    const image = typeof source === 'string' ? await readImage(source) : source;
    const results = await classifyImage(image, [...ATM_LABELS, ...REJECT_LABELS]);
    if (!results) {
      return { detected: true, confidence: 0, skipped: true };
    }

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
