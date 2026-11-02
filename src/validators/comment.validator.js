import { body } from 'express-validator';
import { LIMITS } from '../shared/rules.js';
import { validate, idParam, paginationRules, notBlank } from './validate.js';

const QUIZ_404 = 'Este quiz no existe o fue eliminado';
const COMMENT_404 = 'El comentario no existe';

/** GET /api/quizzes/:id/comments?page=&limit= */
export const validateCommentList = [idParam('id', QUIZ_404), ...paginationRules, validate()];

/** POST /api/quizzes/:id/comments { body, parentId? } */
export const validateComment = [
  idParam('id', QUIZ_404),
  body('body')
    .custom(notBlank).withMessage('El comentario es obligatorio').bail()
    .isString().withMessage('El comentario debe ser texto').bail()
    .trim()
    .isLength({ max: LIMITS.comment }).withMessage(`El comentario debe tener máximo ${LIMITS.comment} caracteres`),
  body('parentId').optional({ values: 'null' })
    .isMongoId().withMessage('El comentario al que respondes no existe'),
  validate('Revisa tu comentario'),
];

/** GET /api/comments/:id/replies y DELETE /api/comments/:id */
export const validateCommentId = [idParam('id', COMMENT_404), validate()];
