import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const likeSchema = new mongoose.Schema({
  userId: { type: ObjectId, ref: 'User', required: true },
  quizId: { type: ObjectId, ref: 'Quiz', required: true },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

// Un like por persona y quiz: el índice único es lo que impide likes dobles
likeSchema.index({ userId: 1, quizId: 1 }, { unique: true });

export const Like = mongoose.model('Like', likeSchema);
