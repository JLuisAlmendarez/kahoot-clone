import mongoose from 'mongoose';
import { LIMITS, QuestionChange, questionKey } from '../shared/rules.js';

/* Snapshot inmutable del contenido de un quiz. Cada edición de preguntas,
   opciones o límite de tiempo crea una versión nueva; los intentos guardan
   el versionId con el que se jugaron y se revisan siempre contra él. */

const optionSchema = new mongoose.Schema({
  position: { type: Number, required: true, min: 1 },
  text: { type: String, required: [true, 'El texto de la opción es obligatorio'], trim: true, maxlength: LIMITS.optionText },
  isCorrect: { type: Boolean, default: false },
});

const questionSchema = new mongoose.Schema({
  position: { type: Number, required: true, min: 1 },
  text: { type: String, required: [true, 'El enunciado es obligatorio'], trim: true, maxlength: LIMITS.questionText },
  explanation: { type: String, default: null, trim: true, maxlength: LIMITS.explanation },
  change: { type: String, enum: Object.values(QuestionChange), default: QuestionChange.NEW },
  multiple: { type: Boolean, default: false },
  options: {
    type: [optionSchema],
    validate: [
      { validator: (v) => v.length >= LIMITS.options[0] && v.length <= LIMITS.options[1], message: `Debe tener de ${LIMITS.options[0]} a ${LIMITS.options[1]} opciones` },
      { validator: (v) => v.some((o) => o.isCorrect), message: 'Marca al menos una opción correcta' },
      { validator: (v) => new Set(v.map((o) => o.text.toLowerCase())).size === v.length, message: 'Hay opciones repetidas' },
    ],
  },
});

questionSchema.methods.correctOptionIds = function correctOptionIds() {
  return this.options.filter((o) => o.isCorrect).map((o) => String(o._id));
};

/** Regla «todo o nada»: el conjunto marcado debe ser igual al conjunto correcto. */
questionSchema.methods.isAnswerCorrect = function isAnswerCorrect(selectedIds) {
  const correct = new Set(this.correctOptionIds());
  const chosen = new Set(selectedIds.map(String));
  return chosen.size === correct.size && [...chosen].every((id) => correct.has(id));
};

const quizVersionSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  version: { type: Number, required: true, min: 1 },
  timeLimit: { type: Number, default: null, min: LIMITS.timeLimit[0], max: LIMITS.timeLimit[1] },
  questions: {
    type: [questionSchema],
    validate: { validator: (v) => v.length >= LIMITS.questions[0] && v.length <= LIMITS.questions[1], message: `Debe tener de ${LIMITS.questions[0]} a ${LIMITS.questions[1]} preguntas` },
  },
  changeSummary: { type: String, default: 'Versión original' },
  attemptCount: { type: Number, default: 0, min: 0 },
  questionCount: { type: Number, default: 0 },
  hasMultiple: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

quizVersionSchema.index({ quizId: 1, version: 1 }, { unique: true });

// Derivados: se guardan para no recalcularlos en cada lectura
quizVersionSchema.pre('validate', function derive() {
  this.questions.forEach((q, i) => {
    q.position = i + 1;
    q.options.forEach((o, j) => { o.position = j + 1; });
    q.multiple = q.options.filter((o) => o.isCorrect).length > 1;
  });
  this.questionCount = this.questions.length;
  this.hasMultiple = this.questions.some((q) => q.multiple);
});

quizVersionSchema.methods.question = function question(questionId) {
  return this.questions.find((q) => String(q._id) === String(questionId)) || null;
};

/** Lo que ve el jugador: sin isCorrect ni explicación (llegan al responder). */
quizVersionSchema.methods.toPublic = function toPublic() {
  return {
    versionId: String(this._id), version: this.version, timeLimit: this.timeLimit,
    questions: this.questions.map((q) => ({
      questionId: String(q._id), position: q.position, text: q.text, multiple: q.multiple,
      options: q.options.map((o) => ({ optionId: String(o._id), text: o.text })),
    })),
  };
};

/** ¿El contenido de entrada es igual al de esta versión? (decide si hay versión nueva) */
quizVersionSchema.methods.sameContentAs = function sameContentAs(questionsInput, timeLimit) {
  if ((this.timeLimit ?? null) !== (timeLimit ?? null)) return false;
  if (questionsInput.length !== this.questions.length) return false;
  return questionsInput.every((q, i) => questionKey(q) === questionKey(this.questions[i]));
};

/**
 * Construye la siguiente versión a partir de las preguntas del editor.
 * Marca cada pregunta como new / modified / unchanged y redacta changeSummary.
 */
quizVersionSchema.statics.build = function build({ quizId, previous = null, questions, timeLimit = null, now = new Date() }) {
  const prevQs = previous ? previous.questions : [];
  const built = questions.map((input, i) => {
    const old = prevQs[i];
    const change = !previous || !old ? QuestionChange.NEW
      : questionKey(old) === questionKey(input) ? QuestionChange.UNCHANGED : QuestionChange.MODIFIED;
    return {
      position: i + 1, text: input.text, explanation: input.explanation ? String(input.explanation).trim() || null : null, change,
      options: (input.options || []).map((o, j) => ({ position: j + 1, text: o.text, isCorrect: !!o.isCorrect })),
    };
  });
  return new this({
    quizId, version: previous ? previous.version + 1 : 1, timeLimit, questions: built, createdAt: now,
    changeSummary: previous ? describeChanges(previous, built, timeLimit) : 'Versión original',
  });
};

/** "Cambió la pregunta 1 y agregó la pregunta 10 · Límite de tiempo: 20 → 30 min" */
function describeChanges(previous, questions, timeLimit) {
  const list = (nums) => (nums.length === 1 ? `la pregunta ${nums[0]}` : `las preguntas ${nums.slice(0, -1).join(', ')} y ${nums[nums.length - 1]}`);
  const modified = questions.filter((q) => q.change === QuestionChange.MODIFIED).map((q) => q.position);
  const added = questions.filter((q) => q.change === QuestionChange.NEW).map((q) => q.position);
  const removed = Math.max(previous.questions.length - questions.length, 0);
  const parts = [];
  if (modified.length) parts.push(`cambió ${list(modified)}`);
  if (added.length) parts.push(`agregó ${list(added)}`);
  if (removed) parts.push(`quitó ${removed === 1 ? '1 pregunta' : `${removed} preguntas`}`);
  let text = parts.join(' y ');
  text = text ? text[0].toUpperCase() + text.slice(1) : '';
  const label = (t) => (t ? `${t} min` : 'sin límite');
  if ((previous.timeLimit ?? null) !== (timeLimit ?? null)) {
    text += `${text ? ' · ' : ''}Límite de tiempo: ${label(previous.timeLimit)} → ${label(timeLimit)}`;
  }
  return text || 'Reordenó el contenido';
}

export const QuizVersion = mongoose.model('QuizVersion', quizVersionSchema);
