import { body, query } from 'express-validator';
import { validate, idParam, paginationRules } from './validate.js';

const ATTEMPT_404 = 'Este intento no existe o su quiz fue eliminado';

/** GET /play, GET /:id, POST /abandon */
export const validateAttemptId = [idParam('id', ATTEMPT_404), validate()];

/** POST /api/attempts/:id/answers { questionId, selectedOptionIds } */
export const validateAnswer = [
  idParam('id', ATTEMPT_404),
  body('questionId').isMongoId().withMessage('La pregunta no es válida'),
  body('selectedOptionIds')
    .isArray({ min: 1 }).withMessage('Marca al menos una opción'),
  body('selectedOptionIds.*').isMongoId().withMessage('Alguna opción no es válida'),
  validate('Revisa tu respuesta'),
];

/** POST /api/attempts/:id/finish { reason?: "timeout" } */
export const validateFinish = [
  idParam('id', ATTEMPT_404),
  body('reason').optional({ values: 'null' }).isIn(['timeout']).withMessage('reason solo admite "timeout"'),
  validate(),
];

/** GET /api/attempts?quizId=&page=&limit= */
export const validateHistory = [
  query('quizId').optional().isMongoId().withMessage('El quiz no es válido'),
  ...paginationRules,
  validate('Revisa los filtros del historial'),
];
