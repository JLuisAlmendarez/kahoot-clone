import mongoose from 'mongoose';
import { AttemptStatus, LIMITS } from '../shared/rules.js';

const { ObjectId } = mongoose.Schema.Types;

const answerSchema = new mongoose.Schema({
  questionId: { type: ObjectId, required: true },
  selectedOptionIds: { type: [ObjectId], required: true },
  isCorrect: { type: Boolean, required: true },
  answeredAt: { type: Date, default: Date.now },
}, { _id: false });

const attemptSchema = new mongoose.Schema({
  userId: { type: ObjectId, ref: 'User', required: true },
  quizId: { type: ObjectId, ref: 'Quiz', required: true },
  versionId: { type: ObjectId, ref: 'QuizVersion', required: true },
  version: { type: Number, required: true, min: 1 },
  status: { type: String, enum: Object.values(AttemptStatus), default: AttemptStatus.IN_PROGRESS },
  timedOut: { type: Boolean, default: false },
  score: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 1 },
  answers: { type: [answerSchema], default: [] },
  startedAt: { type: Date, default: Date.now },
  deadlineAt: { type: Date, default: null },
  finishedAt: { type: Date, default: null },
}, { versionKey: false });

attemptSchema.index({ userId: 1, quizId: 1, status: 1 });
attemptSchema.index({ userId: 1, startedAt: -1 });

attemptSchema.virtual('isOpen').get(function isOpen() { return this.status === AttemptStatus.IN_PROGRESS; });
attemptSchema.virtual('percentage').get(function percentage() { return this.total ? Math.round((this.score / this.total) * 100) : 0; });

/** ¿Ya pasó la hora límite (más un margen de gracia por la latencia)? */
attemptSchema.methods.isPastDeadline = function isPastDeadline(now = new Date(), grace = 0) {
  return !!this.deadlineAt && now.getTime() > this.deadlineAt.getTime() + grace;
};

attemptSchema.statics.GRACE_MS = LIMITS.graceMs;

export const Attempt = mongoose.model('Attempt', attemptSchema);
