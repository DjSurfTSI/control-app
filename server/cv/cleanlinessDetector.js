import { getCvSettings } from './settings.js';
import { classifyImage, readImage, round3, sumScore } from './classifier.js';
import { getActiveModel, predictWithModel } from './training.js';
import { resolveEmbedding } from './embedding.js';

export const CLEANLINESS_LEVELS = ['clean', 'dust', 'dirt', 'trash'];
export const CLEANLINESS_ISSUES = ['dust', 'dirt', 'trash'];

export const CLEANLINESS_LABELS_RU = {
  clean: 'Чисто',
  dust: 'Пыль',
  dirt: 'Грязь',
  trash: 'Мусор',
};

/** Чем выше индекс, тем серьёзнее замечание. */
const SEVERITY = { clean: 0, dust: 1, dirt: 2, trash: 3 };

/**
 * Пыль и грязь оцениваются на корпусе банкомата, мусор — на полу вокруг.
 * Промпты про мусор намеренно не упоминают банкомат: иначе CLIP матчит
 * сам терминал, а не мусор, и метка срабатывает на любом снимке.
 */
const BODY_CLEAN_PROMPTS = [
  'clean polished ATM machine, spotless screen and keypad, no dirt',
  'well maintained bank terminal after cleaning, shiny surface',
  'чистый банкомат без пыли и грязи, поверхность блестит',
];

const ISSUE_PROMPTS = {
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
    'scattered garbage, plastic bottles and crumpled paper on the floor',
    'pile of litter and rubbish lying on the ground',
    'разбросанный мусор на полу: бутылки, обёртки, бумажки',
  ],
};

/** Мусор сравнивается с чистым полом, а не с чистым корпусом. */
const FLOOR_CLEAN_PROMPTS = [
  'clean empty floor with nothing lying on it',
  'tidy floor without any litter or objects',
  'чистый пустой пол без мусора',
];

const BASELINE_FOR = {
  dust: BODY_CLEAN_PROMPTS,
  dirt: BODY_CLEAN_PROMPTS,
  trash: FLOOR_CLEAN_PROMPTS,
};

const ALL_PROMPTS = [
  ...BODY_CLEAN_PROMPTS,
  ...FLOOR_CLEAN_PROMPTS,
  ...CLEANLINESS_ISSUES.flatMap((i) => ISSUE_PROMPTS[i]),
];

export function evaluateCleanliness(results, { threshold = 0.65 } = {}) {
  // Для каждого замечания — попарная вероятность «замечание против чистого».
  // Softmax по паре = перенормировка сумм, поэтому хватает одного прогона.
  const scores = {};
  for (const issue of CLEANLINESS_ISSUES) {
    const issueSum = sumScore(results, ISSUE_PROMPTS[issue]);
    const baseSum = sumScore(results, BASELINE_FOR[issue]);
    const total = issueSum + baseSum;
    scores[issue] = total > 0 ? round3(issueSum / total) : 0;
  }

  const issues = CLEANLINESS_ISSUES
    .filter((issue) => scores[issue] >= threshold)
    .sort((a, b) => SEVERITY[b] - SEVERITY[a]);

  const level = issues[0] ?? 'clean';
  const worstScore = Math.max(...CLEANLINESS_ISSUES.map((i) => scores[i]));

  return {
    level,
    clean: level === 'clean',
    score: round3(1 - worstScore),
    confidence: level === 'clean' ? round3(1 - worstScore) : scores[level],
    issues,
    scores: { clean: round3(1 - worstScore), ...scores },
    reason: 'ok',
  };
}

/** Вердикт обученной модели: один класс из clean/dust/dirt/trash. */
function evaluateTrained(prediction, threshold) {
  const scores = Object.fromEntries(
    CLEANLINESS_LEVELS.map((l) => [l, prediction.scores[l] ?? 0]),
  );
  const dirty = prediction.label !== 'clean' && prediction.confidence >= threshold;
  const level = dirty ? prediction.label : 'clean';

  return {
    level,
    clean: !dirty,
    score: round3(scores.clean),
    confidence: prediction.confidence,
    issues: dirty ? [level] : [],
    scores,
    reason: 'ok',
    source: 'trained',
  };
}

/**
 * Оценивает чистоту уборки на фото: пыль и грязь на корпусе, мусор на полу.
 * Если бизнес-администратор обучил модель на своих фото — используется она.
 * @param {string|object} source путь к файлу или RawImage
 * @param {object} [opts]
 * @param {number[]} [opts.embedding] готовый эмбеддинг изображения
 */
export async function detectCleanliness(source, { embedding = null } = {}) {
  const settings = getCvSettings();
  if (!settings.enabled || !settings.cleanliness_check_enabled) {
    return { skipped: true, level: null, clean: null, score: 0, issues: [], reason: 'disabled' };
  }

  try {
    if (getActiveModel('cleanliness')) {
      const vector = await resolveEmbedding(source, embedding, readImage);
      const trained = predictWithModel('cleanliness', vector);
      if (trained) return evaluateTrained(trained, settings.cleanliness_threshold);
    }

    const image = typeof source === 'string' ? await readImage(source) : source;
    const results = await classifyImage(image, ALL_PROMPTS);
    if (!results) {
      return { skipped: true, level: null, clean: null, score: 0, issues: [], reason: 'cv_unavailable' };
    }
    return { ...evaluateCleanliness(results, { threshold: settings.cleanliness_threshold }), source: 'zero-shot' };
  } catch (err) {
    console.error('CV cleanliness detection error:', err.message);
    return { skipped: true, level: null, clean: null, score: 0, issues: [], reason: 'error', error: err.message };
  }
}
