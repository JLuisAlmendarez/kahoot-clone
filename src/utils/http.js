import mongoose from 'mongoose';
import { ApiError } from './ApiError.js';

/** Convierte el id de la URL en ObjectId; si no tiene formato válido, responde 404. */
export function parseId(value, message = 'No encontrado') {
  if (!mongoose.isValidObjectId(value) || !/^[0-9a-f]{24}$/i.test(String(value))) throw ApiError.notFound(message);
  return new mongoose.Types.ObjectId(String(value));
}

/** page y limit de la query, acotados (page ≥ 1, 1 ≤ limit ≤ max). */
export function pagination(query, { limit: defLimit = 10, max = 50 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(max, Math.max(1, parseInt(query.limit, 10) || defLimit));
  return { page, limit, skip: (page - 1) * limit };
}

/** Valida varios documentos de Mongoose y junta todos sus errores en un solo 400. */
export async function validateAll(message, ...docs) {
  const fields = [];
  for (const doc of docs) {
    try {
      await doc.validate();
    } catch (err) {
      if (!(err instanceof mongoose.Error.ValidationError)) throw err;
      Object.values(err.errors).forEach((e) => fields.push({ path: e.path, message: e.message }));
    }
  }
  if (fields.length) throw ApiError.badRequest(message, fields);
}
