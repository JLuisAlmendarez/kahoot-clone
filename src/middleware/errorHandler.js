import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

const DUPLICATE_MESSAGES = {
  username: 'Ese nombre de usuario ya está en uso',
  email: 'Ya existe una cuenta con ese correo',
  slug: 'Ya existe una categoría con ese nombre',
};
/** El índice único de categories es el slug, pero el usuario escribió el nombre. */
const DUPLICATE_PATH = { slug: 'name' };

/** Traduce cualquier error a un ApiError con su status HTTP. */
export function toApiError(err) {
  if (err instanceof ApiError) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    const fields = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    return ApiError.badRequest('Los datos no son válidos', fields);
  }
  if (err instanceof mongoose.Error.CastError) return ApiError.notFound();

  if (err?.code === 11000) { // índice único repetido
    const field = Object.keys(err.keyPattern || err.keyValue || {}).pop() || 'valor';
    const message = DUPLICATE_MESSAGES[field] || `Ese ${field} ya está en uso`;
    return ApiError.conflict('DUPLICATE', message, [{ path: DUPLICATE_PATH[field] || field, message }]);
  }
  if (err?.type === 'entity.parse.failed') return ApiError.badRequest('El cuerpo de la petición no es JSON válido');
  if (err?.type === 'entity.too.large') return new ApiError(413, 'TOO_LARGE', 'La petición es demasiado grande');

  const e = new ApiError(500, 'INTERNAL', env.isProduction ? 'Error inesperado' : err?.message || 'Error inesperado');
  e.cause = err;
  return e;
}

/** Último middleware de Express: responde { success: false, error } con el status correcto. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const apiError = toApiError(err);
  if (apiError.status >= 500 && !env.isTest) console.error('[Quiztopia]', err);
  res.status(apiError.status).json(apiError.toJSON());
}

/** 404 para rutas /api que no existen. */
export function apiNotFound(req, res, next) {
  next(ApiError.notFound(`No existe la ruta ${req.method} ${req.originalUrl}`));
}
