import { getCvSettings } from './settings.js';
import { classifyImage, maxScore, readImage, round3 } from './classifier.js';

export const ANGLE_TYPES = ['left', 'right', 'front', 'top'];

export const ANGLE_LABELS_RU = {
  left: 'Слева',
  right: 'Справа',
  front: 'Спереди',
  top: 'Сверху',
};

/**
 * Ракурсы делятся на группы: сторона (left/right), фронт и вид сверху.
 * CLIP уверенно различает группы, но плохо различает лево/право,
 * поэтому внутри группы «сторона» вердикт выносится только при явном перевесе.
 */
const ANGLE_GROUPS = {
  left: 'side',
  right: 'side',
  front: 'front',
  top: 'top',
};

const ANGLE_PROMPTS = {
  left: [
    'ATM cash machine photographed from its left side, side profile view',
    'bank terminal seen from the left, side panel facing the camera',
    'банкомат снят сбоку слева, виден боковой корпус',
  ],
  right: [
    'ATM cash machine photographed from its right side, side profile view',
    'bank terminal seen from the right, opposite side panel facing the camera',
    'банкомат снят сбоку справа, виден боковой корпус',
  ],
  front: [
    'ATM cash machine photographed straight from the front, screen and keypad facing the camera',
    'frontal view of a bank terminal display and card slot',
    'банкомат снят спереди, экран и клавиатура прямо перед камерой',
  ],
  top: [
    'ATM cash machine photographed from above, high angle looking down at the top panel',
    'top down view of a bank terminal keypad from overhead',
    'банкомат снят сверху, вид на верхнюю панель и клавиатуру',
  ],
};

const ALL_ANGLE_PROMPTS = ANGLE_TYPES.flatMap((t) => ANGLE_PROMPTS[t]);

/** Минимальный перевес лево/право, ниже которого ракурс считается неопределённым. */
const SIDE_DECISION_MARGIN = 0.06;

export function evaluateAngle(results, declaredType, { threshold = 0.30 } = {}) {
  const scores = Object.fromEntries(
    ANGLE_TYPES.map((type) => [type, round3(maxScore(results, ANGLE_PROMPTS[type]))]),
  );

  const groupScores = {
    side: Math.max(scores.left, scores.right),
    front: scores.front,
    top: scores.top,
  };

  const bestGroup = Object.keys(groupScores).reduce(
    (best, g) => (groupScores[g] > groupScores[best] ? g : best),
    'front',
  );
  const bestGroupScore = groupScores[bestGroup];

  const declaredGroup = ANGLE_GROUPS[declaredType] ?? null;
  const sideDelta = Math.abs(scores.left - scores.right);
  const bestSide = scores.left >= scores.right ? 'left' : 'right';

  let angle = bestGroup === 'side'
    ? (sideDelta >= SIDE_DECISION_MARGIN ? bestSide : null)
    : bestGroup;

  // Уверенности не хватает — вердикт не выносим
  if (bestGroupScore < threshold) {
    return {
      angle: null,
      group: bestGroup,
      confidence: round3(bestGroupScore),
      match: null,
      reason: 'low_confidence',
      scores,
    };
  }

  if (!declaredGroup) {
    return {
      angle,
      group: bestGroup,
      confidence: round3(bestGroupScore),
      match: null,
      reason: 'unknown_declared',
      scores,
    };
  }

  if (bestGroup !== declaredGroup) {
    return {
      angle: angle ?? bestGroup,
      group: bestGroup,
      confidence: round3(bestGroupScore),
      match: false,
      reason: 'group_mismatch',
      scores,
    };
  }

  // Группа совпала. Для фронта и вида сверху этого достаточно.
  if (declaredGroup !== 'side') {
    return {
      angle: declaredType,
      group: bestGroup,
      confidence: round3(bestGroupScore),
      match: true,
      reason: 'ok',
      scores,
    };
  }

  // Сторона: лево/право различаем только при явном перевесе.
  if (sideDelta < SIDE_DECISION_MARGIN) {
    return {
      angle: null,
      group: 'side',
      confidence: round3(bestGroupScore),
      match: null,
      reason: 'side_uncertain',
      scores,
    };
  }

  return {
    angle: bestSide,
    group: 'side',
    confidence: round3(scores[bestSide]),
    match: bestSide === declaredType,
    reason: bestSide === declaredType ? 'ok' : 'side_mismatch',
    scores,
  };
}

/**
 * Определяет ракурс съёмки и сверяет его с заявленным типом фото.
 * @param {string|object} source путь к файлу или RawImage
 * @param {string} declaredType left | right | front | top
 */
export async function detectPhotoAngle(source, declaredType) {
  const settings = getCvSettings();
  if (!settings.enabled || !settings.angle_check_enabled) {
    return { skipped: true, angle: null, match: null, confidence: 0, reason: 'disabled' };
  }

  try {
    const image = typeof source === 'string' ? await readImage(source) : source;
    const results = await classifyImage(image, ALL_ANGLE_PROMPTS);
    if (!results) {
      return { skipped: true, angle: null, match: null, confidence: 0, reason: 'cv_unavailable' };
    }
    return evaluateAngle(results, declaredType, { threshold: settings.angle_threshold });
  } catch (err) {
    console.error('CV angle detection error:', err.message);
    return { skipped: true, angle: null, match: null, confidence: 0, reason: 'error', error: err.message };
  }
}
