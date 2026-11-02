import mongoose from 'mongoose';
import { env } from './env.js';

/**
 * Conecta Mongoose a MONGODB_URI (Mongo local, Docker o Atlas).
 * Funciona con un servidor standalone: la app no depende de transacciones,
 * usa operaciones atómicas de un solo documento ($inc, $push, upsert).
 */
export async function connectDB(uri = env.mongoUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  // Crea los índices declarados en los esquemas (únicos y TTL) si no existen
  // syncIndexes también quita los índices que ya no están en los esquemas (los TTL del borrado lógico)
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  await purgeSoftDeleted();
  return mongoose.connection;
}

/**
 * Migración de la versión con borrado lógico: los quizzes que quedaron marcados
 * con deletedAt se borran de verdad junto con sus versiones, intentos, likes y
 * comentarios, y se quitan los campos deletedAt/expiresAt que ya no se usan.
 * Si no hay nada pendiente no hace nada, así que se puede correr en cada arranque.
 * Usa la colección directa porque esos campos ya no existen en los esquemas.
 */
export async function purgeSoftDeleted() {
  const { db } = mongoose.connection;
  const deleted = await db.collection('quizzes').find({ deletedAt: { $ne: null } }, { projection: { _id: 1 } }).toArray();
  const ids = deleted.map((q) => q._id);
  if (ids.length) {
    await Promise.all(['quizversions', 'attempts', 'likes', 'comments'].map((c) => db.collection(c).deleteMany({ quizId: { $in: ids } })));
    await db.collection('quizzes').deleteMany({ _id: { $in: ids } });
    console.log(`[Quiztopia] Se borraron definitivamente ${ids.length} quiz(zes) que estaban en borrado lógico`);
  }
  await Promise.all(['quizzes', 'quizversions', 'attempts', 'likes', 'comments'].map((c) =>
    db.collection(c).updateMany({ $or: [{ deletedAt: { $exists: true } }, { expiresAt: { $exists: true } }] }, { $unset: { deletedAt: '', expiresAt: '' } })));
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
