import { getCvSettings } from './settings.js';
import { classifyImage, readImage, round3, sumScore } from './classifier.js';
import { getActiveModel, predictWithModel } from './training.js';
import { resolveEmbedding } from './embedding.js';

export const ANGLE_TYPES = ['left', 'right', 'front', 'top'];

export const ANGLE_LABELS_RU = {
  left: 'Слева',
  right: 'Справа',
  front: 'Спереди',
  top: 'Сверху',
  before_top: 'До уборки, сверху',
};

/**
 * Модель различает три вида съёмки. Лево и право не различаются:
 * на зеркальных ракурсах CLIP уверенно выдаёт один и тот же ответ,
 * поэтому оба боковых ракурса сведены в общий вид «сбоку».
 */
export const VIEW_TYPES = ['side', 'front', 'top'];

export const VIEW_LABELS_RU = {
  side: 'Сбоку',
  front: 'Спереди',
  top: 'Сверху',
};

const DECLARED_TO_VIEW = {
  left: 'side',
  right: 'side',
  front: 'front',
  top: 'top',
  before_top: 'top',
};

/** По три промпта на вид — наборы сбалансированы, иначе сумма смещается к более крупной группе. */
const VIEW_PROMPTS = {
  side: [
    'ATM cash machine photographed from the side, side profile of the body panel',
    'bank terminal seen from its side, the screen is turned away at an angle',
    'банкомат снят сбоку, виден боковой корпус, экран отвёрнут',
  ],
  front: [
    'ATM cash machine photographed straight from the front, screen and keypad facing the camera',
    'frontal view of a bank terminal display and card slot directly ahead',
    'банкомат снят строго спереди, экран и клавиатура прямо перед камерой',
  ],
  top: [
    'ATM cash machine photographed from above, high angle looking down at the top panel',
    'top down overhead view of a bank terminal keypad',
    'банкомат снят сверху, вид сверху на верхнюю панель',
  ],
};

const ALL_VIEW_PROMPTS = VIEW_TYPES.flatMap((v) => VIEW_PROMPTS[v]);

/** Сводит распределение по видам и заявленный тип к вердикту о совпадении. */
function verdictFrom(scores, declaredType, threshold, source) {
  const known = VIEW_TYPES.filter((v) => scores[v] !== undefined);
  const bestView = known.reduce((a, b) => (scores[a] >= scores[b] ? a : b));
  const bestScore = scores[bestView];
  const expectedView = DECLARED_TO_VIEW[declaredType] ?? null;

  if (bestScore < threshold) {
    return {
      angle: null, view: bestView, confidence: bestScore,
      match: null, reason: 'low_confidence', scores, source,
    };
  }

  if (!expectedView) {
    return {
      angle: bestView, view: bestView, confidence: bestScore,
      match: null, reason: 'unknown_declared', scores, source,
    };
  }

  const match = bestView === expectedView;
  return {
    angle: bestView,
    view: bestView,
    confidence: bestScore,
    match,
    reason: match ? 'ok' : 'view_mismatch',
    scores,
    source,
  };
}

export function evaluateAngle(results, declaredType, { threshold = 0.45 } = {}) {
  // Суммы по группам промптов дают распределение по трём видам (в сумме 1).
  const scores = Object.fromEntries(
    VIEW_TYPES.map((view) => [view, round3(sumScore(results, VIEW_PROMPTS[view]))]),
  );
  return verdictFrom(scores, declaredType, threshold, 'zero-shot');
}

/**
 * Определяет вид съёмки (сбоку / спереди / сверху) и сверяет с заявленным
 * типом фото. Ракурсы «слева» и «справа» считаются одним видом «сбоку».
 * Если бизнес-администратор обучил модель на своих фото — используется она.
 * @param {string|object} source путь к файлу или RawImage
 * @param {string} declaredType left | right | front | top | before_top
 * @param {object} [opts]
 * @param {number[]} [opts.embedding] готовый эмбеддинг изображения
 */
export async function detectPhotoAngle(source, declaredType, { embedding = null } = {}) {
  const settings = getCvSettings();
  if (!settings.enabled || !settings.angle_check_enabled) {
    return { skipped: true, angle: null, match: null, confidence: 0, reason: 'disabled' };
  }

  try {
    if (getActiveModel('view')) {
      const vector = await resolveEmbedding(source, embedding, readImage);
      const trained = predictWithModel('view', vector);
      if (trained) {
        return verdictFrom(trained.scores, declaredType, settings.angle_threshold, 'trained');
      }
    }

    const image = typeof source === 'string' ? await readImage(source) : source;
    const results = await classifyImage(image, ALL_VIEW_PROMPTS);
    if (!results) {
      return { skipped: true, angle: null, match: null, confidence: 0, reason: 'cv_unavailable' };
    }
    return evaluateAngle(results, declaredType, { threshold: settings.angle_threshold });
  } catch (err) {
    console.error('CV angle detection error:', err.message);
    return { skipped: true, angle: null, match: null, confidence: 0, reason: 'error', error: err.message };
  }
}
