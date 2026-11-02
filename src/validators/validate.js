import { validationResult, param, query } from 'express-validator';
import { ApiError } from '../utils/ApiError.js';

/* ============================================================================
   validators/validate.js — Pieza común de express-validator.
   Cada archivo *.validator.js exporta un arreglo [...reglas, validate(msg)]
   que se coloca en la ruta ANTES del controlador:

     router.post('/', requireAuth, validateQuiz, quizzes.create);   // quizzes.routes.js

   Si alguna regla falla, la petición no llega al controlador.
   ========================================================================== */

/** "questions[0].options[1].text" (express-validator) → "questions.0.options.1.text" (Mongoose y el editor). */
const toDotPath = (path) => String(path).replace(/\[(\d+)\]/g, '.$1');

/**
 * Middleware que revisa el resultado de las reglas:
 * - Un id inválido en la URL responde 404 (el recurso no puede existir).
 * - Cualquier otro error responde 400 con { path, message } por campo.
 */
export const validate = (message = 'Los datos no son válidos') => (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const errors = result.array({ onlyFirstError: true }).filter((e) => e.type === 'field');
  const badParam = errors.find((e) => e.location === 'params');
  if (badParam) return next(ApiError.notFound(badParam.msg));
  const fields = errors.map((e) => ({ path: toDotPath(e.path), message: e.msg }));
  return next(ApiError.badRequest(message, fields));
};

/** :id de la URL con formato de ObjectId; si no lo tiene, 404 con el mensaje del recurso. */
export const idParam = (name, notFoundMessage) =>
  param(name).isMongoId().withMessage(notFoundMessage);

/** page y limit opcionales y enteros. El controlador los acota a su rango (page ≥ 1, limit ≤ máximo). */
export const paginationRules = [
  query('page').optional().isInt().withMessage('La página debe ser un número entero'),
  query('limit').optional().isInt().withMessage('El límite debe ser un número entero'),
];

/** Texto con contenido real (no vacío ni solo espacios). */
export const notBlank = (v) => typeof v === 'string' ? v.trim() !== '' : v !== undefined && v !== null;
