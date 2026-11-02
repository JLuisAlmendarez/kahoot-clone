import { Comment } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { parseId, pagination } from '../utils/http.js';
import { LIMITS } from '../shared/rules.js';
import { liveQuiz, hasCompleted } from './quizzes.controller.js';

/** GET /api/quizzes/:id/comments?page=&limit= — primer nivel, más recientes primero */
export async function list(req, res) {
  const quiz = await liveQuiz(req.params.id);
  const { page, limit, skip } = pagination(req.query, { limit: 3, max: 20 });
  const filter = { quizId: quiz._id, parentId: null };
  const [items, total] = await Promise.all([
    Comment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Comment.countDocuments(filter),
  ]);
  res.json({ items: items.map((c) => c.toView(req.user, quiz)), page, totalPages: Math.max(1, Math.ceil(total / limit)), total });
}

/** GET /api/comments/:id/replies — respuestas en orden cronológico */
export async function replies(req, res) {
  const parent = await Comment.findById(parseId(req.params.id, 'El comentario no existe'));
  if (!parent) throw ApiError.notFound('El comentario no existe');
  const quiz = await liveQuiz(parent.quizId);
  const items = await Comment.find({ parentId: parent._id }).sort({ createdAt: 1 });
  res.json({ items: items.map((c) => c.toView(req.user, quiz)) });
}

/** POST /api/quizzes/:id/comments { body, parentId? } */
export async function create(req, res) {
  const quiz = await liveQuiz(req.params.id);
  const me = req.user;
  if (!quiz.isOwnedBy(me._id) && !(await hasCompleted(me._id, quiz._id))) throw ApiError.forbidden('Completa el quiz para participar en el foro');

  const since = new Date(Date.now() - 60000);
  const recent = await Comment.countDocuments({ 'author.userId': me._id, createdAt: { $gt: since } });
  if (recent >= LIMITS.commentsPerMinute) throw ApiError.tooMany('Vas muy rápido: espera un momento antes de volver a comentar');

  const { body, parentId = null } = req.body ?? {};
  let parent = null;
  if (parentId) {
    parent = await Comment.findById(parseId(parentId, 'El comentario al que respondes no existe'));
    if (!parent || String(parent.quizId) !== String(quiz._id)) throw ApiError.badRequest('El comentario al que respondes no existe');
    if (parent.parentId) parent = await Comment.findById(parent.parentId); // solo dos niveles
    if (!parent || parent.deleted) throw ApiError.badRequest('No se puede responder a un comentario eliminado');
  }
  const saved = await Comment.create({ quizId: quiz._id, parentId: parent?._id ?? null, author: me.toRef(), body });
  if (parent) await Comment.updateOne({ _id: parent._id }, { $inc: { replyCount: 1 } });
  res.status(201).json(saved.toView(me, quiz));
}

/**
 * DELETE /api/comments/:id
 * Si no tiene respuestas se borra; si las tiene queda como «[comentario eliminado]».
 * El borrado lleva la condición replyCount: 0, así una respuesta que llegue al
 * mismo tiempo nunca se queda sin su comentario padre.
 */
export async function remove(req, res) {
  const comment = await Comment.findById(parseId(req.params.id, 'El comentario no existe'));
  if (!comment || comment.deleted) throw ApiError.notFound('El comentario no existe');
  if (String(comment.author.userId) !== String(req.user._id)) throw ApiError.forbidden('Solo puedes borrar tus comentarios');

  const hard = await Comment.deleteOne({ _id: comment._id, replyCount: 0 });
  if (!hard.deletedCount) {
    await Comment.updateOne({ _id: comment._id }, { $set: { deleted: true, body: '' } });
    return res.json({ softDeleted: true });
  }
  if (comment.parentId) {
    const parent = await Comment.findOneAndUpdate({ _id: comment.parentId, replyCount: { $gt: 0 } }, { $inc: { replyCount: -1 } }, { new: true });
    // Si el padre ya estaba eliminado y se quedó sin respuestas, desaparece
    if (parent?.deleted && parent.replyCount === 0) await Comment.deleteOne({ _id: parent._id, replyCount: 0 });
  }
  return res.json({ softDeleted: false });
}
