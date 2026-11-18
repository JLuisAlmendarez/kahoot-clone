import mongoose from 'mongoose';
import { QuizVersion, Category, Attempt, Like, Comment } from '../models/index.js';
import * as quizRepository from '../repositories/quiz.repository.js';
import { ApiError } from '../utils/ApiError.js';
import { SearchQuery } from '../utils/searchQuery.js';
import { parseId, pagination, validateAll } from '../utils/http.js';
import { iso } from '../utils/dates.js';
import { AttemptStatus, Roles, checkQuizInput } from '../shared/rules.js';

const versionLabel = (t) => (t ? `${t} min` : 'Sin límite');

// ------------------------------------------------------------ ayudantes
/** Quiz existente o 404. */
export async function liveQuiz(id) {
  const quiz = await quizRepository.findById(parseId(id, 'Este quiz no existe o fue eliminado'));
  if (!quiz) throw ApiError.notFound('Este quiz no existe o fue eliminado');
  return quiz;
}

export async function hasCompleted(userId, quizId) {
  if (!userId) return false;
  return !!(await Attempt.exists({ userId, quizId, status: AttemptStatus.COMPLETED }));
}

/** El creador o un administrador pueden gestionar el quiz. */
const canManage = (quiz, user) => !!user && (quiz.isOwnedBy(user._id) || user.role === Roles.ADMIN);

function ownedQuiz(quiz, user, action = 'editar') {
  if (!canManage(quiz, user)) throw ApiError.forbidden(`Solo el creador o un administrador pueden ${action} este quiz`);
}

/** Valida la entrada del editor con las reglas compartidas y la deja limpia. */
function readQuizInput(input = {}) {
  const errors = checkQuizInput(input);
  if (errors.length) throw ApiError.badRequest('Revisa los datos del quiz', errors);
  return {
    title: input.title.trim(),
    description: (input.description || '').trim(),
    categoryId: input.categoryId,
    tagIds: [...new Set(input.tagIds || [])],
    timeLimit: input.timeLimit ?? null,
    questions: input.questions.map((q) => ({
      text: q.text.trim(),
      explanation: q.explanation ? String(q.explanation).trim() || null : null,
      options: q.options.map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect === true })),
    })),
  };
}

/** Convierte categoryId y tagIds en las referencias que se guardan dentro del quiz. */
async function resolveCategoryAndTags(categoryId, tagIds) {
  const categories = await Category.find();
  const category = categories.find((c) => String(c._id) === String(categoryId));
  if (!category) throw ApiError.badRequest('La categoría no existe', [{ path: 'categoryId', message: 'Elige una categoría válida' }]);
  const tags = tagIds.map((id) => {
    for (const c of categories) {
      const t = c.tags.find((x) => String(x._id) === String(id));
      if (t) return { tagId: t._id, name: t.name, slug: t.slug };
    }
    throw ApiError.badRequest('Etiqueta inválida', [{ path: 'tagIds', message: `La etiqueta ${id} no existe` }]);
  });
  return { category: category.toRef(), tags };
}

// ================================================================ catálogo
/** GET /api/quizzes?q=&page=&limit= */
export async function search(req, res) {
  const query = new SearchQuery(req.query.q);
  const { page, limit, skip } = pagination(req.query, { limit: 12 });
  const filter = query.toFilter();
  const [items, total] = await quizRepository.search(filter, query.toSort(), skip, limit);
  res.json({
    items: items.map((q) => q.toCard()), page, totalPages: Math.max(1, Math.ceil(total / limit)), total, ignored: query.ignored,
  });
}

/** GET /api/quizzes/:id — versión vigente y permisos de quien pregunta */
export async function detail(req, res) {
  const quiz = await liveQuiz(req.params.id);
  const me = req.user;
  const [completed, like] = await Promise.all([
    hasCompleted(me?._id, quiz._id),
    me ? Like.exists({ userId: me._id, quizId: quiz._id }) : null,
  ]);
  const isOwner = quiz.isOwnedBy(me?._id);
  res.json({
    ...quiz.toCard(), description: quiz.description, version: quiz.version, createdAt: iso(quiz.createdAt),
    isOwner, canManage: canManage(quiz, me), completed, likedByMe: !!like,
    canLike: !!me && completed && !isOwner, canComment: !!me && (completed || isOwner),
  });
}

/** GET /api/quizzes/:id/versions */
export async function versions(req, res) {
  const quiz = await liveQuiz(req.params.id);
  const list = await QuizVersion.find({ quizId: quiz._id }).sort({ version: -1 });
  res.json(list.map((v) => ({
    versionId: String(v._id), version: v.version, isCurrent: String(v._id) === String(quiz.currentVersionId),
    createdAt: iso(v.createdAt), changeSummary: v.changeSummary, questionCount: v.questionCount,
    timeLimit: v.timeLimit, timeLimitLabel: versionLabel(v.timeLimit), attemptCount: v.attemptCount,
  })));
}

/** GET /api/versions/:versionId — snapshot; isCorrect solo para el dueño o un admin */
export async function version(req, res) {
  const v = await QuizVersion.findById(parseId(req.params.versionId, 'Esta versión no existe'));
  if (!v) throw ApiError.notFound('Esta versión no existe');
  const quiz = await liveQuiz(v.quizId);
  const owner = canManage(quiz, req.user);
  res.json({
    versionId: String(v._id), version: v.version, isCurrent: String(v._id) === String(quiz.currentVersionId),
    quiz: { quizId: String(quiz._id), title: quiz.title }, createdAt: iso(v.createdAt),
    timeLimit: v.timeLimit, timeLimitLabel: versionLabel(v.timeLimit),
    questionCount: v.questionCount, attemptCount: v.attemptCount,
    questions: v.questions.map((q) => ({
      position: q.position, text: q.text, change: q.change, multiple: q.multiple,
      options: q.options.map((o) => (owner ? { text: o.text, isCorrect: o.isCorrect } : { text: o.text })),
    })),
  });
}

// ================================================================== editor
/** POST /api/quizzes — crea el quiz y su versión 1 */
export async function create(req, res) {
  const data = readQuizInput(req.body);
  const { category, tags } = await resolveCategoryAndTags(data.categoryId, data.tagIds);
  const now = new Date();
  const quizId = new mongoose.Types.ObjectId();
  const version = QuizVersion.build({ quizId, questions: data.questions, timeLimit: data.timeLimit, now });
  const quiz = quizRepository.build({ _id: quizId, owner: req.user.toRef(), title: data.title, description: data.description, category, tags, createdAt: now, updatedAt: now });
  await validateAll('Revisa los datos del quiz', version); // calcula questionCount, multiple…
  quiz.applyVersion(version);
  await validateAll('Revisa los datos del quiz', quiz);

  await version.save();
  try {
    await quizRepository.save(quiz);
  } catch (err) {
    await QuizVersion.deleteOne({ _id: version._id }); // sin transacciones: deshacemos a mano
    throw err;
  }
  res.status(201).json({ quizId: String(quiz._id), version: quiz.version, versionCreated: true });
}

/** GET /api/quizzes/:id/edit — contenido vigente con isCorrect (dueño o admin) */
export async function getForEdit(req, res) {
  const quiz = await liveQuiz(req.params.id);
  ownedQuiz(quiz, req.user);
  const v = await QuizVersion.findById(quiz.currentVersionId);
  res.json({
    quizId: String(quiz._id), version: quiz.version, title: quiz.title, description: quiz.description,
    categoryId: String(quiz.category.categoryId), tagIds: quiz.tags.map((t) => String(t.tagId)), timeLimit: v.timeLimit,
    questions: v.questions.map((q) => ({ text: q.text, explanation: q.explanation || '', options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) })),
  });
}

/**
 * PUT /api/quizzes/:id — crea versión nueva solo si cambió el contenido.
 * Solo se actualizan los campos que el editor controla ($set): los contadores
 * (likesCount, playCount) nunca se sobrescriben, así no se pierden los $inc
 * que lleguen mientras el dueño guarda.
 */
export async function update(req, res) {
  const quiz = await liveQuiz(req.params.id);
  ownedQuiz(quiz, req.user);
  const data = readQuizInput(req.body);
  const { category, tags } = await resolveCategoryAndTags(data.categoryId, data.tagIds);
  const current = await QuizVersion.findById(quiz.currentVersionId);
  const contentChanged = !current.sameContentAs(data.questions, data.timeLimit);
  const now = new Date();

  const set = {
    title: data.title, description: data.description, category, tags, updatedAt: now,
    searchText: quizRepository.searchTextFor({ title: data.title, description: data.description, tags }),
  };
  let next = null;
  if (contentChanged) {
    next = QuizVersion.build({ quizId: quiz._id, previous: current, questions: data.questions, timeLimit: data.timeLimit, now });
    await validateAll('Revisa los datos del quiz', next);
    try {
      await next.save(); // índice único (quizId, version): dos ediciones simultáneas no crean la misma versión
    } catch (err) {
      if (err.code === 11000) throw ApiError.conflict('VERSION_CONFLICT', 'Alguien guardó cambios a este quiz al mismo tiempo. Recarga e inténtalo de nuevo.');
      throw err;
    }
    Object.assign(set, {
      currentVersionId: next._id, version: next.version, timeLimit: next.timeLimit,
      questionCount: next.questionCount, hasMultiple: next.hasMultiple,
    });
  }

  // Si se publicó versión, la condición version: current.version evita pisar otra edición
  const filter = { _id: quiz._id, ...(contentChanged ? { version: current.version } : {}) };
  const updated = await quizRepository.updateEditable(filter, set);
  if (!updated) {
    if (next) await QuizVersion.deleteOne({ _id: next._id });
    throw ApiError.conflict('VERSION_CONFLICT', 'El quiz cambió mientras lo editabas. Recarga e inténtalo de nuevo.');
  }
  res.json({ quizId: String(updated._id), version: updated.version, versionCreated: contentChanged });
}

/**
 * DELETE /api/quizzes/:id — borrado definitivo (el creador o un admin).
 * Primero se borra el quiz: desde ese momento cualquier petición nueva sobre él
 * (jugar, like, comentar) responde 404. Después se borra todo lo relacionado.
 */
export async function remove(req, res) {
  const quiz = await liveQuiz(req.params.id);
  ownedQuiz(quiz, req.user, 'borrar');
  const r = await quizRepository.deleteById(quiz._id);
  if (!r.deletedCount) throw ApiError.notFound('Este quiz no existe o fue eliminado');

  const byQuiz = { quizId: quiz._id };
  const [versions, attempts, likes, comments] = await Promise.all([
    QuizVersion.deleteMany(byQuiz),
    Attempt.deleteMany(byQuiz),
    Like.deleteMany(byQuiz),
    Comment.deleteMany(byQuiz),
  ]);
  res.json({
    quizId: String(quiz._id),
    deleted: true,
    removed: { versions: versions.deletedCount, attempts: attempts.deletedCount, likes: likes.deletedCount, comments: comments.deletedCount },
  });
}

/** GET /api/users/me/quizzes */
export async function mine(req, res) {
  const list = await quizRepository.findByOwner(req.user._id);
  res.json(list.map((q) => ({ ...q.toCard(), version: q.version, updatedAt: iso(q.updatedAt) })));
}

// =================================================================== likes
/**
 * POST /api/quizzes/:id/likes
 * El upsert sobre el índice único (userId, quizId) decide quién crea el like:
 * solo esa petición incrementa el contador, aunque lleguen dos a la vez.
 */
export async function like(req, res) {
  const quiz = await liveQuiz(req.params.id);
  const me = req.user;
  if (quiz.isOwnedBy(me._id)) throw ApiError.forbidden('No puedes dar like a tu propio quiz');
  if (!(await hasCompleted(me._id, quiz._id))) throw ApiError.forbidden('Completa el quiz para poder darle like');
  try {
    const r = await Like.updateOne({ userId: me._id, quizId: quiz._id }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true });
    if (r.upsertedCount === 1) await quizRepository.incrementLikes(quiz._id);
  } catch (err) {
    if (err.code !== 11000) throw err; // otra petición lo creó primero: ya cuenta
  }
  const fresh = await quizRepository.findById(quiz._id, 'likesCount');
  res.json({ likesCount: fresh.likesCount, likedByMe: true });
}

/** DELETE /api/quizzes/:id/likes — solo resta si de verdad borró un like */
export async function unlike(req, res) {
  const quiz = await liveQuiz(req.params.id);
  const r = await Like.deleteOne({ userId: req.user._id, quizId: quiz._id });
  if (r.deletedCount === 1) await quizRepository.decrementLikes(quiz._id);
  const fresh = await quizRepository.findById(quiz._id, 'likesCount');
  res.json({ likesCount: fresh.likesCount, likedByMe: false });
}
