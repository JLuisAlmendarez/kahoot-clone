import mongoose from 'mongoose';
import { LIMITS, initials } from '../shared/rules.js';

const { ObjectId } = mongoose.Schema.Types;

const commentSchema = new mongoose.Schema({
  quizId: { type: ObjectId, ref: 'Quiz', required: true },
  parentId: { type: ObjectId, ref: 'Comment', default: null }, // null = primer nivel; solo hay dos niveles
  author: {
    userId: { type: ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
  },
  body: {
    type: String, trim: true, maxlength: [LIMITS.comment, `El comentario debe tener máximo ${LIMITS.comment} caracteres`],
    // Un comentario eliminado conserva el documento (por sus respuestas) pero sin texto
    required: [function bodyRequired() { return !this.deleted; }, 'El comentario es obligatorio'],
  },
  deleted: { type: Boolean, default: false },
  replyCount: { type: Number, default: 0, min: 0 },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

commentSchema.index({ quizId: 1, parentId: 1, createdAt: -1 });
commentSchema.index({ 'author.userId': 1, createdAt: -1 });

commentSchema.virtual('isReply').get(function isReply() { return this.parentId !== null; });

/** Lo que recibe el foro. El autor de un comentario eliminado no se revela. */
commentSchema.methods.toView = function toView(me, quiz) {
  const mine = !!me && String(this.author.userId) === String(me._id);
  return {
    commentId: String(this._id), parentId: this.parentId ? String(this.parentId) : null,
    author: this.deleted ? null : { userId: String(this.author.userId), username: this.author.username, initials: initials(this.author.username) },
    body: this.deleted ? '' : this.body, deleted: this.deleted, replyCount: this.replyCount,
    isMine: mine && !this.deleted,
    isQuizOwner: !this.deleted && String(this.author.userId) === String(quiz.owner.userId),
    createdAt: this.createdAt.toISOString(),
  };
};

export const Comment = mongoose.model('Comment', commentSchema);
