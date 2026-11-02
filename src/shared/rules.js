/* ============================================================================
   shared/rules.js — Reglas de validación compartidas por el servidor y el
   navegador. El editor las usa para mostrar errores antes de enviar y la API
   las vuelve a aplicar al recibir los datos: el usuario ve exactamente los
   mismos mensajes en los dos lados.

   Es un módulo ES sin dependencias: Node lo importa desde src/ y el navegador
   lo descarga desde /shared/rules.js.
   ========================================================================== */

export const LIMITS = Object.freeze({
  username: [3, 20], password: [8, 128], email: 254,
  title: [3, 100], description: 2000,
  questions: [1, 50], options: [2, 10],
  questionText: 1000, explanation: 1000, optionText: 300,
  tags: 5, timeLimit: [1, 300], comment: 1000, categoryName: [2, 20], tagName: [2, 30],
  graceMs: 5000, commentsPerMinute: 10,
});

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const USERNAME = /^[A-Za-z0-9_]+$/;
export const OBJECT_ID = /^[0-9a-f]{24}$/;

export const Roles = Object.freeze({ USER: 'user', ADMIN: 'admin' });
export const AttemptStatus = Object.freeze({ IN_PROGRESS: 'in_progress', COMPLETED: 'completed', ABANDONED: 'abandoned' });
export const QuestionChange = Object.freeze({ UNCHANGED: 'unchanged', MODIFIED: 'modified', NEW: 'new' });

/** Quita acentos y pasa a minúsculas: "Química" → "quimica". */
export const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "Química básica" → "quimica-basica" */
export const slugify = (text) => normalize(text).trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Iniciales para el avatar: "ana_dev" → "AN". */
export const initials = (username = '') => String(username).replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase();

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * Acumula errores { path, message } campo por campo, como un esquema.
 * Las rutas (questions.1.options.0.text) son las mismas que usa Mongoose,
 * así el editor puede llevar al usuario directo al campo con el error.
 */
export class Checker {
  constructor() { this.errors = []; }
  add(path, message) { this.errors.push({ path, message }); return this; }
  get ok() { return this.errors.length === 0; }

  string(value, path, { min = 0, max = Infinity, required = true, pattern, label = path, patternMessage } = {}) {
    if (isBlank(value)) {
      if (required) this.add(path, `${label} es obligatorio`);
      return this;
    }
    if (typeof value !== 'string') return this.add(path, `${label} debe ser texto`);
    if (value.trim().length < min) this.add(path, `${label} debe tener al menos ${min} caracteres`);
    if (value.length > max) this.add(path, `${label} debe tener máximo ${max} caracteres`);
    if (pattern && !pattern.test(value)) this.add(path, patternMessage || `${label} tiene un formato inválido`);
    return this;
  }
  integer(value, path, { min = -Infinity, max = Infinity, label = path } = {}) {
    if (!Number.isInteger(value)) return this.add(path, `${label} debe ser un número entero`);
    if (value < min || value > max) this.add(path, `${label} debe estar entre ${min} y ${max}`);
    return this;
  }
  objectId(value, path, { label = path } = {}) {
    if (isBlank(value)) return this.add(path, `${label} es obligatoria`);
    if (!OBJECT_ID.test(String(value))) this.add(path, `${label} no es válida`);
    return this;
  }
  array(value, path, { min = 0, max = Infinity, label = path } = {}) {
    if (!Array.isArray(value)) return this.add(path, `${label} debe ser una lista`);
    if (value.length < min) this.add(path, `${label} necesita al menos ${min} elemento(s)`);
    if (value.length > max) this.add(path, `${label} admite máximo ${max} elemento(s)`);
    return this;
  }
}

/** Reglas de una pregunta del editor: enunciado, 2–10 opciones distintas y al menos una correcta. */
export function checkQuestion(q, i, c = new Checker()) {
  const p = `questions.${i}`;
  c.string(q?.text, `${p}.text`, { min: 1, max: LIMITS.questionText, label: 'El enunciado' })
    .string(q?.explanation, `${p}.explanation`, { required: false, max: LIMITS.explanation, label: 'La explicación' });
  const options = Array.isArray(q?.options) ? q.options : [];
  c.array(q?.options, `${p}.options`, { min: LIMITS.options[0], max: LIMITS.options[1], label: 'Las opciones' });
  options.forEach((o, j) => c.string(o?.text, `${p}.options.${j}.text`, { min: 1, max: LIMITS.optionText, label: 'El texto de la opción' }));
  if (options.length && !options.some((o) => o?.isCorrect === true)) c.add(`${p}.options`, 'Marca al menos una opción correcta');
  const texts = options.map((o) => (typeof o?.text === 'string' ? o.text.trim().toLowerCase() : '')).filter(Boolean);
  if (new Set(texts).size !== texts.length) c.add(`${p}.options`, 'Hay opciones repetidas');
  return c;
}

/**
 * Valida la entrada completa del editor (POST/PUT /api/quizzes).
 * Devuelve la lista de errores; vacía significa que es válida.
 */
export function checkQuizInput(input = {}) {
  const c = new Checker();
  c.string(input.title, 'title', { min: LIMITS.title[0], max: LIMITS.title[1], label: 'El título' })
    .string(input.description, 'description', { required: false, max: LIMITS.description, label: 'La descripción' })
    .objectId(input.categoryId, 'categoryId', { label: 'La categoría' })
    .array(input.tagIds ?? [], 'tagIds', { max: LIMITS.tags, label: 'Las etiquetas' });
  if (input.timeLimit !== null && input.timeLimit !== undefined) {
    c.integer(input.timeLimit, 'timeLimit', { min: LIMITS.timeLimit[0], max: LIMITS.timeLimit[1], label: 'El límite de tiempo' });
  }
  c.array(input.questions, 'questions', { min: LIMITS.questions[0], max: LIMITS.questions[1], label: 'Las preguntas' });
  if (Array.isArray(input.questions)) input.questions.forEach((q, i) => checkQuestion(q, i, c));
  return c.errors;
}

/** Huella del contenido de una pregunta: si cambia, el quiz necesita versión nueva. */
export const questionKey = (q) =>
  JSON.stringify([String(q.text ?? '').trim(), String(q.explanation ?? '').trim(), (q.options || []).map((o) => [String(o.text ?? '').trim(), !!o.isCorrect])]);
