import { Attempt, QuizVersion } from '../models/index.js';
import * as quizRepository from '../repositories/quiz.repository.js';
import { ApiError } from '../utils/ApiError.js';
import { parseId, pagination } from '../utils/http.js';
import { iso } from '../utils/dates.js';
import { AttemptStatus } from '../shared/rules.js';
import { liveQuiz } from './quizzes.controller.js';

const quizSummary = (q) => ({ quizId: String(q._id), title: q.title, version: q.version });

async function ownAttempt(id, user) {
  const attempt = await Attempt.findById(parseId(id, 'Este intento no existe o su quiz fue eliminado'));
  if (!attempt) throw ApiError.notFound('Este intento no existe o su quiz fue eliminado');
  if (String(attempt.userId) !== String(user._id)) throw ApiError.forbidden('Este intento es de otra persona');
  return attempt;
}

/**
 * Cierra un intento abierto de forma atómica: solo una petición logra pasar
 * de in_progress a completed, así playCount y attemptCount suben una vez.
 * Devuelve el intento actualizado, o null si ya estaba cerrado.
 */
async function finishAttempt(attempt, { timedOut, finishedAt }) {
  const updated = await Attempt.findOneAndUpdate(
    { _id: attempt._id, status: AttemptStatus.IN_PROGRESS },
    { $set: { status: AttemptStatus.COMPLETED, timedOut, finishedAt } },
    { new: true },
  );
  if (updated) {
    await Promise.all([
      quizRepository.incrementPlays(updated.quizId),
      QuizVersion.updateOne({ _id: updated.versionId }, { $inc: { attemptCount: 1 } }),
    ]);
  }
  return updated;
}

/** Si el tiempo se acabó y nadie lo cerró (por ejemplo, se cayó el navegador), se califica como tiempo agotado. */
async function closeIfExpired(attempt, now = new Date()) {
  if (attempt.status !== AttemptStatus.IN_PROGRESS || !attempt.isPastDeadline(now, Attempt.GRACE_MS)) return attempt;
  return (await finishAttempt(attempt, { timedOut: true, finishedAt: attempt.deadlineAt })) || Attempt.findById(attempt._id);
}

const sessionView = (attempt, version, quiz) => ({
  attemptId: String(attempt._id), quizId: String(quiz._id), quizTitle: quiz.title, version: version.version,
  deadlineAt: iso(attempt.deadlineAt),
  answeredQuestionIds: attempt.answers.map((a) => String(a.questionId)),
  questions: version.toPublic().questions,
});

/** POST /api/quizzes/:id/attempts — inicia con la versión vigente */
export async function start(req, res) {
  const quiz = await liveQuiz(req.params.id);
  const me = req.user;
  const version = await QuizVersion.findById(quiz.currentVersionId);
  const now = new Date();
  // Un intento abierto a la vez por quiz: el anterior queda interrumpido
  await Attempt.updateMany(
    { userId: me._id, quizId: quiz._id, status: AttemptStatus.IN_PROGRESS },
    { $set: { status: AttemptStatus.ABANDONED, finishedAt: now } },
  );
  const attempt = await Attempt.create({
    userId: me._id, quizId: quiz._id, versionId: version._id, version: version.version,
    total: version.questionCount, startedAt: now,
    deadlineAt: version.timeLimit ? new Date(now.getTime() + version.timeLimit * 60000) : null,
  });
  res.status(201).json(sessionView(attempt, version, quiz));
}

/** GET /api/attempts/:id/play — recupera un intento en curso (al recargar la página) */
export async function play(req, res) {
  const attempt = await closeIfExpired(await ownAttempt(req.params.id, req.user));
  if (attempt.status !== AttemptStatus.IN_PROGRESS) throw ApiError.conflict('ATTEMPT_CLOSED', 'Este intento ya terminó');
  const [version, quiz] = await Promise.all([QuizVersion.findById(attempt.versionId), quizRepository.findById(attempt.quizId)]);
  res.json(sessionView(attempt, version, quiz));
}

/**
 * POST /api/attempts/:id/answers { questionId, selectedOptionIds } — califica y devuelve el feedback.
 * El $push lleva la condición «sigue abierto y esa pregunta no se ha respondido»,
 * así dos clics rápidos no guardan dos respuestas ni suman dos puntos.
 */
export async function answer(req, res) {
  const attempt = await ownAttempt(req.params.id, req.user);
  const { questionId, selectedOptionIds } = req.body ?? {};
  const now = new Date();
  if (attempt.status !== AttemptStatus.IN_PROGRESS) throw ApiError.conflict('ATTEMPT_CLOSED', 'Este intento ya terminó');
  if (attempt.isPastDeadline(now, Attempt.GRACE_MS)) throw ApiError.conflict('TIME_UP', 'Se acabó el tiempo');

  const version = await QuizVersion.findById(attempt.versionId);
  const question = version.question(questionId);
  if (!question) throw new ApiError(400, 'INVALID_QUESTION', 'La pregunta no existe en esta versión');
  const ids = [...new Set(Array.isArray(selectedOptionIds) ? selectedOptionIds.map(String) : [])];
  if (!ids.length) throw new ApiError(400, 'INVALID_OPTION', 'Marca al menos una opción');
  const valid = new Set(question.options.map((o) => String(o._id)));
  if (!ids.every((id) => valid.has(id))) throw new ApiError(400, 'INVALID_OPTION', 'Alguna opción no pertenece a la pregunta');
  if (!question.multiple && ids.length > 1) throw new ApiError(400, 'INVALID_OPTION', 'Esta pregunta tiene una sola respuesta');

  const isCorrect = question.isAnswerCorrect(ids);
  const r = await Attempt.updateOne(
    { _id: attempt._id, status: AttemptStatus.IN_PROGRESS, 'answers.questionId': { $ne: question._id } },
    { $push: { answers: { questionId: question._id, selectedOptionIds: ids, isCorrect, answeredAt: now } }, $inc: { score: isCorrect ? 1 : 0 } },
  );
  if (!r.modifiedCount) {
    const fresh = await Attempt.findById(attempt._id, 'status');
    if (fresh.status !== AttemptStatus.IN_PROGRESS) throw ApiError.conflict('ATTEMPT_CLOSED', 'Este intento ya terminó');
    throw ApiError.conflict('ALREADY_ANSWERED', 'Esta pregunta ya se respondió');
  }
  res.json({
    isCorrect, correctOptionIds: question.correctOptionIds(), explanation: question.explanation,
    answered: attempt.answers.length + 1, total: attempt.total,
  });
}

/** POST /api/attempts/:id/finish { reason?: "timeout" } */
export async function finish(req, res) {
  const attempt = await ownAttempt(req.params.id, req.user);
  const now = new Date();
  const timedOut = req.body?.reason === 'timeout' || attempt.isPastDeadline(now);
  const updated = await finishAttempt(attempt, { timedOut, finishedAt: now });
  if (!updated) throw ApiError.conflict('ATTEMPT_CLOSED', 'Este intento ya terminó');
  res.json({ attemptId: String(updated._id), score: updated.score, total: updated.total, percentage: updated.percentage, timedOut: updated.timedOut });
}

/**
 * POST /api/attempts/:id/abandon — botón Salir, y también navigator.sendBeacon
 * cuando se cierra la pestaña (la cookie de sesión viaja con el beacon).
 */
export async function abandon(req, res) {
  const attempt = await ownAttempt(req.params.id, req.user);
  const r = await Attempt.updateOne(
    { _id: attempt._id, status: AttemptStatus.IN_PROGRESS },
    { $set: { status: AttemptStatus.ABANDONED, finishedAt: new Date() } },
  );
  res.json({ abandoned: r.modifiedCount === 1 });
}

/** GET /api/attempts/:id — revisión con la versión que se jugó */
export async function review(req, res) {
  const attempt = await closeIfExpired(await ownAttempt(req.params.id, req.user));
  if (attempt.status === AttemptStatus.IN_PROGRESS) throw ApiError.conflict('ATTEMPT_OPEN', 'Este intento sigue en curso');
  if (attempt.status === AttemptStatus.ABANDONED) throw ApiError.conflict('ATTEMPT_ABANDONED', 'Los intentos interrumpidos no tienen revisión');
  const [version, quiz] = await Promise.all([QuizVersion.findById(attempt.versionId), quizRepository.findById(attempt.quizId)]);
  if (!version || !quiz) throw ApiError.notFound('Este intento no existe o su quiz fue eliminado');
  const byQuestion = new Map(attempt.answers.map((a) => [String(a.questionId), a]));
  const duration = Math.max(0, Math.round(((attempt.finishedAt || new Date()) - attempt.startedAt) / 60000));
  res.json({
    attemptId: String(attempt._id), version: attempt.version, isCurrentVersion: String(quiz.currentVersionId) === String(attempt.versionId),
    quiz: quizSummary(quiz),
    status: attempt.status, timedOut: attempt.timedOut, score: attempt.score, total: attempt.total, percentage: attempt.percentage,
    startedAt: iso(attempt.startedAt), finishedAt: iso(attempt.finishedAt),
    durationLabel: duration < 1 ? 'menos de 1 min' : `${duration} min`,
    questions: version.questions.map((q) => {
      const a = byQuestion.get(String(q._id));
      const selected = new Set(a ? a.selectedOptionIds.map(String) : []);
      return {
        position: q.position, text: q.text, explanation: q.explanation, multiple: q.multiple,
        status: !a ? 'unanswered' : a.isCorrect ? 'correct' : 'wrong',
        options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, selected: selected.has(String(o._id)) })),
      };
    }),
  });
}

/** GET /api/attempts?quizId=&page=&limit= — historial agrupado por quiz */
export async function history(req, res) {
  const me = req.user;
  const now = new Date();
  // Primero se califican los intentos que se quedaron abiertos con el tiempo vencido
  const stale = await Attempt.find({ userId: me._id, status: AttemptStatus.IN_PROGRESS, deadlineAt: { $lt: new Date(now - Attempt.GRACE_MS) } });
  await Promise.all(stale.map((a) => closeIfExpired(a, now)));

  const { page, limit, skip } = pagination(req.query, { limit: 10 });
  const target = req.query.quizId ? parseId(req.query.quizId) : null;
  const mineList = await Attempt.find({ userId: me._id, status: { $ne: AttemptStatus.IN_PROGRESS } }).sort({ startedAt: -1 });
  const quizIds = [...new Set(mineList.map((a) => String(a.quizId)))];
  const quizzes = new Map((await quizRepository.findByIds(quizIds)).map((q) => [String(q._id), q]));

  const groups = [];
  const byQuiz = new Map();
  for (const a of mineList) {
    const id = String(a.quizId);
    const q = quizzes.get(id);
    if (!q || (target && id !== String(target))) continue;
    if (!byQuiz.has(id)) {
      const g = { quiz: quizSummary(q), attempts: [] };
      byQuiz.set(id, g);
      groups.push(g);
    }
    byQuiz.get(id).attempts.push({
      attemptId: String(a._id), status: a.status, timedOut: a.timedOut, score: a.score, total: a.total, version: a.version, startedAt: iso(a.startedAt),
    });
  }
  const played = quizIds.filter((id) => quizzes.has(id));
  res.json({
    groups: groups.slice(skip, skip + limit), page, totalPages: Math.max(1, Math.ceil(groups.length / limit)),
    totalQuizzes: played.length,
    totalAttempts: mineList.filter((a) => quizzes.has(String(a.quizId))).length,
    playedQuizzes: played.map((id) => ({ quizId: id, title: quizzes.get(id).title })),
  });
}
