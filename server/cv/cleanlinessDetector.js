import { getCvSettings } from './settings.js';
import { classifyImage, maxScore, readImage, round3 } from './classifier.js';

export const CLEANLINESS_LEVELS = ['clean', 'dust', 'dirt', 'trash'];

export const CLEANLINESS_LABELS_RU = {
  clean: 'Чисто',
  dust: 'Пыль',
  dirt: 'Грязь',
  trash: 'Мусор',
};

/** Чем выше индекс, тем серьёзнее замечание. */
const SEVERITY = { clean: 0, dust: 1, dirt: 2, trash: 3 };

const CLEANLINESS_PROMPTS = {
  clean: [
    'clean polished ATM machine, spotless screen and keypad, no dirt',
    'well maintained bank terminal after cleaning, shiny surface',
    'чистый банкомат без пыли и грязи, поверхность блестит',
  ],
  dust: [
    'dusty ATM machine with a visible layer of dust on the panel and screen',
    'bank terminal covered with fine dust, dull matte dusty surface',
    'запылённый банкомат, слой пыли на экране и корпусе',
  ],
  dirt: [
    'dirty ATM machine with stains, smudges, grime and fingerprints on the surface',
    'bank terminal with mud streaks and sticky dirt on the body',
    'грязный банкомат с пятнами, разводами и потёками на корпусе',
  ],
  trash: [
    'litter and garbage lying on the floor around the ATM machine',
    'crumpled paper receipts, bottles and trash near the bank terminal',
    'мусор рядом с банкоматом: бумажки, чеки, бутылки на полу',
  ],
};

const ALL_CLEANLINESS_PROMPTS = CLEANLINESS_LEVELS.flatMap((l) => CLEANLINESS_PROMPTS[l]);

export function evaluateCleanliness(results, { threshold = 0.30 } = {}) {
  const raw = Object.fromEntries(
    CLEANLINESS_LEVELS.map((level) => [level, maxScore(results, CLEANLINESS_PROMPTS[level])]),
  );

  const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const scores = Object.fromEntries(
    CLEANLINESS_LEVELS.map((level) => [level, round3(raw[level] / total)]),
  );

  const issues = CLEANLINESS_LEVELS
    .filter((level) => level !== 'clean' && scores[level] >= threshold)
    .sort((a, b) => SEVERITY[b] - SEVERITY[a]);

  const bestLevel = CLEANLINESS_LEVELS.reduce(
    (best, level) => (scores[level] > scores[best] ? level : best),
    'clean',
  );

  // Итоговый вердикт — самое серьёзное замечание выше порога,
  // иначе лидирующая метка.
  const level = issues[0] ?? (bestLevel === 'clean' ? 'clean' : bestLevel);

  return {
    level,
    clean: level === 'clean',
    score: scores.clean,
    confidence: round3(scores[level]),
    issues,
    scores,
    reason: 'ok',
  };
}

/**
 * Оценивает чистоту уборки на фото: пыль, грязь, мусор.
 * @param {string|object} source путь к файлу или RawImage
 */
export async function detectCleanliness(source) {
  const settings = getCvSettings();
  if (!settings.enabled || !settings.cleanliness_check_enabled) {
    return { skipped: true, level: null, clean: null, score: 0, issues: [], reason: 'disabled' };
  }

  try {
    const image = typeof source === 'string' ? await readImage(source) : source;
    const results = await classifyImage(image, ALL_CLEANLINESS_PROMPTS);
    if (!results) {
      return { skipped: true, level: null, clean: null, score: 0, issues: [], reason: 'cv_unavailable' };
    }
    return evaluateCleanliness(results, { threshold: settings.cleanliness_threshold });
  } catch (err) {
    console.error('CV cleanliness detection error:', err.message);
    return { skipped: true, level: null, clean: null, score: 0, issues: [], reason: 'error', error: err.message };
  }
}
