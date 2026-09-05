import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { readImage } from './classifier.js';
import { cosine, embedImage, normalize, parseEmbedding, serializeEmbedding } from './embedding.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../uploads');

export const TRAINING_KINDS = ['cleanliness', 'view'];

export const TRAINING_CLASSES = {
  cleanliness: ['clean', 'dust', 'dirt', 'trash'],
  view: ['side', 'front', 'top'],
};

export const TRAINING_CLASS_LABELS = {
  cleanliness: { clean: 'Чисто', dust: 'Пыль', dirt: 'Грязь', trash: 'Мусор' },
  view: { side: 'Сбоку', front: 'Спереди', top: 'Сверху' },
};

export const TRAINING_KIND_LABELS = {
  cleanliness: 'Чистота уборки',
  view: 'Вид съёмки',
};

/** Меньше двух классов или примеров обучать нечего. */
export const MIN_CLASSES = 2;
export const MIN_SAMPLES_PER_CLASS = 2;

/** Косинусы между эмбеддингами CLIP лежат в узком диапазоне — резкость добавляет температура. */
const SOFTMAX_SCALE = 20;

let modelCache = new Map();

export function invalidateModelCache() {
  modelCache = new Map();
}

function photoPath(taskId, filename) {
  return path.join(uploadsDir, String(taskId), filename);
}

/** Считает эмбеддинг фото и кэширует его в строке разметки. */
export async function ensureSampleEmbedding(sample) {
  const cached = parseEmbedding(sample.embedding);
  if (cached) return cached;

  const file = photoPath(sample.task_id, sample.filename);
  if (!fs.existsSync(file)) return null;

  const image = await readImage(file);
  const vector = await embedImage(image);
  if (!vector) return null;

  db.prepare('UPDATE cv_training_samples SET embedding = ? WHERE id = ?')
    .run(serializeEmbedding(vector), sample.id);
  return vector;
}

function loadSamples(kind) {
  return db.prepare(`
    SELECT s.id, s.photo_id, s.task_id, s.kind, s.label, s.embedding, p.filename
    FROM cv_training_samples s
    JOIN task_photos p ON p.id = s.photo_id
    WHERE s.kind = ?
    ORDER BY s.id
  `).all(kind);
}

function centroidsFrom(entries) {
  const byLabel = new Map();
  for (const { label, vector } of entries) {
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(vector);
  }

  const centroids = {};
  for (const [label, vectors] of byLabel) {
    const sum = new Array(vectors[0].length).fill(0);
    for (const v of vectors) {
      for (let i = 0; i < v.length; i += 1) sum[i] += v[i];
    }
    centroids[label] = normalize(sum.map((v) => v / vectors.length));
  }
  return centroids;
}

function classifyWith(centroids, vector) {
  const labels = Object.keys(centroids);
  if (!labels.length) return null;

  const sims = labels.map((l) => cosine(centroids[l], vector));
  const max = Math.max(...sims);
  const exps = sims.map((s) => Math.exp((s - max) * SOFTMAX_SCALE));
  const total = exps.reduce((a, b) => a + b, 0) || 1;

  const scores = {};
  labels.forEach((l, i) => { scores[l] = Math.round((exps[i] / total) * 1000) / 1000; });

  const best = labels.reduce((a, b) => (scores[a] >= scores[b] ? a : b));
  return { label: best, confidence: scores[best], scores };
}

/** Точность leave-one-out: каждый пример по очереди исключается из центроидов. */
function leaveOneOutAccuracy(entries) {
  if (entries.length < 2) return null;
  let correct = 0;
  let scored = 0;

  for (let i = 0; i < entries.length; i += 1) {
    const rest = entries.filter((_, j) => j !== i);
    const labels = new Set(rest.map((e) => e.label));
    if (labels.size < 2) continue;

    const prediction = classifyWith(centroidsFrom(rest), entries[i].vector);
    if (!prediction) continue;
    scored += 1;
    if (prediction.label === entries[i].label) correct += 1;
  }

  return scored ? Math.round((correct / scored) * 1000) / 1000 : null;
}

export function getTrainingSummary(kind) {
  const rows = db.prepare(
    'SELECT label, COUNT(*) AS count FROM cv_training_samples WHERE kind = ? GROUP BY label'
  ).all(kind);

  const counts = Object.fromEntries(TRAINING_CLASSES[kind].map((c) => [c, 0]));
  let total = 0;
  for (const r of rows) {
    if (counts[r.label] !== undefined) counts[r.label] = r.count;
    total += r.count;
  }

  const usableClasses = Object.values(counts).filter((c) => c >= MIN_SAMPLES_PER_CLASS).length;
  const model = db.prepare(
    'SELECT id, samples_count, accuracy, trained_at, trained_by FROM cv_models WHERE kind = ? AND active = 1 ORDER BY id DESC LIMIT 1'
  ).get(kind);

  return {
    kind,
    label: TRAINING_KIND_LABELS[kind],
    classes: TRAINING_CLASSES[kind],
    class_labels: TRAINING_CLASS_LABELS[kind],
    counts,
    total,
    can_train: usableClasses >= MIN_CLASSES,
    min_samples_per_class: MIN_SAMPLES_PER_CLASS,
    model: model || null,
  };
}

export async function trainModel(kind, userId) {
  if (!TRAINING_KINDS.includes(kind)) throw new Error('Неизвестный тип модели');

  const samples = loadSamples(kind);
  const entries = [];
  for (const sample of samples) {
    const vector = await ensureSampleEmbedding(sample);
    if (vector) entries.push({ label: sample.label, vector });
  }

  const byLabel = new Map();
  for (const e of entries) byLabel.set(e.label, (byLabel.get(e.label) || 0) + 1);
  const usable = [...byLabel.values()].filter((c) => c >= MIN_SAMPLES_PER_CLASS).length;

  if (usable < MIN_CLASSES) {
    throw new Error(
      `Нужно минимум ${MIN_CLASSES} класса по ${MIN_SAMPLES_PER_CLASS} размеченных фото. Сейчас подходящих классов: ${usable}`
    );
  }

  // Классы с одним примером в центроиды не берём — они дают неустойчивые прототипы.
  const kept = entries.filter((e) => byLabel.get(e.label) >= MIN_SAMPLES_PER_CLASS);
  const centroids = centroidsFrom(kept);
  const accuracy = leaveOneOutAccuracy(kept);

  db.prepare('UPDATE cv_models SET active = 0 WHERE kind = ?').run(kind);
  const result = db.prepare(`
    INSERT INTO cv_models (kind, payload, samples_count, accuracy, active, trained_at, trained_by)
    VALUES (?, ?, ?, ?, 1, datetime('now'), ?)
  `).run(kind, JSON.stringify({ centroids }), kept.length, accuracy, userId ?? null);

  invalidateModelCache();

  return {
    id: result.lastInsertRowid,
    kind,
    samples_count: kept.length,
    accuracy,
    classes: Object.keys(centroids),
  };
}

export function getActiveModel(kind) {
  if (modelCache.has(kind)) return modelCache.get(kind);

  const row = db.prepare(
    'SELECT id, payload, samples_count, accuracy, trained_at FROM cv_models WHERE kind = ? AND active = 1 ORDER BY id DESC LIMIT 1'
  ).get(kind);

  let model = null;
  if (row) {
    try {
      const payload = JSON.parse(row.payload);
      if (payload?.centroids && Object.keys(payload.centroids).length >= MIN_CLASSES) {
        model = {
          id: row.id,
          centroids: payload.centroids,
          samples_count: row.samples_count,
          accuracy: row.accuracy,
          trained_at: row.trained_at,
        };
      }
    } catch {
      model = null;
    }
  }

  modelCache.set(kind, model);
  return model;
}

/** Прогноз обученной модели. Возвращает null, если активной модели нет. */
export function predictWithModel(kind, vector) {
  const model = getActiveModel(kind);
  if (!model || !vector) return null;
  const prediction = classifyWith(model.centroids, vector);
  if (!prediction) return null;
  return { ...prediction, model_id: model.id, accuracy: model.accuracy, source: 'trained' };
}

export function deactivateModel(kind) {
  db.prepare('UPDATE cv_models SET active = 0 WHERE kind = ?').run(kind);
  invalidateModelCache();
}
