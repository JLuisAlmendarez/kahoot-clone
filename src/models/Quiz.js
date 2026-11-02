import mongoose from 'mongoose';
import { LIMITS, normalize, initials } from '../shared/rules.js';

const { ObjectId } = mongoose.Schema.Types;

/* Referencias extendidas: copiamos los datos que se muestran en las tarjetas
   (nombre de usuario, categoría, etiquetas) para no hacer joins al listar. */
const userRefSchema = new mongoose.Schema({ userId: { type: ObjectId, ref: 'User', required: true }, username: { type: String, required: true } }, { _id: false });
const categoryRefSchema = new mongoose.Schema({ categoryId: { type: ObjectId, required: true }, name: String, slug: String }, { _id: false });
const tagRefSchema = new mongoose.Schema({ tagId: { type: ObjectId, required: true }, name: String, slug: String }, { _id: false });

const quizSchema = new mongoose.Schema({
  owner: { type: userRefSchema, required: true },
  title: {
    type: String, required: [true, 'El título es obligatorio'], trim: true,
    minlength: [LIMITS.title[0], `El título debe tener al menos ${LIMITS.title[0]} caracteres`],
    maxlength: [LIMITS.title[1], `El título debe tener máximo ${LIMITS.title[1]} caracteres`],
  },
  description: { type: String, default: '', maxlength: [LIMITS.description, `La descripción debe tener máximo ${LIMITS.description} caracteres`] },
  category: { type: categoryRefSchema, required: [true, 'La categoría es obligatoria'] },
  tags: {
    type: [tagRefSchema], default: [],
    validate: { validator: (v) => v.length <= LIMITS.tags, message: `Máximo ${LIMITS.tags} etiquetas` },
  },
  // Copia de los datos de la versión vigente (se actualizan al publicar una versión)
  currentVersionId: { type: ObjectId, ref: 'QuizVersion', default: null },
  version: { type: Number, default: 0 },
  timeLimit: { type: Number, default: null },
  questionCount: { type: Number, default: 0 },
  hasMultiple: { type: Boolean, default: false },
  // Contadores: solo se modifican con $inc para no perder actualizaciones concurrentes
  likesCount: { type: Number, default: 0, min: 0 },
  playCount: { type: Number, default: 0, min: 0 },
  searchText: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

quizSchema.index({ createdAt: -1 });
quizSchema.index({ likesCount: -1 });
quizSchema.index({ 'owner.userId': 1 });

/** Texto sin acentos para la búsqueda: título + descripción + etiquetas. */
quizSchema.statics.searchTextFor = ({ title = '', description = '', tags = [] }) =>
  normalize([title, description, ...tags.map((t) => t.name)].join(' '));

quizSchema.pre('validate', function setSearchText() {
  this.searchText = this.constructor.searchTextFor(this);
});

quizSchema.methods.isOwnedBy = function isOwnedBy(userId) {
  return !!userId && String(this.owner.userId) === String(userId);
};

/** Apunta el quiz a una versión nueva y copia sus datos derivados. */
quizSchema.methods.applyVersion = function applyVersion(version) {
  this.currentVersionId = version._id;
  this.version = version.version;
  this.timeLimit = version.timeLimit;
  this.questionCount = version.questionCount;
  this.hasMultiple = version.hasMultiple;
  return this;
};

quizSchema.methods.toCard = function toCard() {
  return {
    quizId: String(this._id), title: this.title,
    category: { categoryId: String(this.category.categoryId), name: this.category.name, slug: this.category.slug },
    owner: { userId: String(this.owner.userId), username: this.owner.username, initials: initials(this.owner.username) },
    tags: this.tags.map((t) => ({ tagId: String(t.tagId), name: t.name, slug: t.slug })),
    timeLimit: this.timeLimit, questionCount: this.questionCount, likesCount: this.likesCount,
    playCount: this.playCount, hasMultiple: this.hasMultiple,
  };
};

export const Quiz = mongoose.model('Quiz', quizSchema);
