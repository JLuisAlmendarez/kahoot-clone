import { body, query } from 'express-validator';
import { LIMITS } from '../shared/rules.js';
import { validate, idParam, paginationRules, notBlank } from './validate.js';

/* Los mensajes son los mismos de shared/rules.js, así el editor del navegador
   y la API muestran exactamente el mismo texto en el mismo campo. */

const QUIZ_404 = 'Este quiz no existe o fue eliminado';

/** Texto requerido con largo mínimo (sin contar espacios) y máximo. */
const text = (field, label, min, max) => body(field)
  .custom(notBlank).withMessage(`${label} es obligatorio`).bail()
  .isString().withMessage(`${label} debe ser texto`).bail()
  .custom((v) => v.trim().length >= min).withMessage(`${label} debe tener al menos ${min} caracteres`)
  .isLength({ max }).withMessage(`${label} debe tener máximo ${max} caracteres`);

/** Texto opcional con largo máximo. */
const optionalText = (field, label, max) => body(field)
  .optional({ values: 'falsy' })
  .isString().withMessage(`${label} debe ser texto`).bail()
  .isLength({ max }).withMessage(`${label} debe tener máximo ${max} caracteres`);

const list = (field, label, [min, max]) => body(field)
  .isArray().withMessage(`${label} debe ser una lista`).bail()
  .isArray({ min }).withMessage(`${label} necesita al menos ${min} elemento(s)`)
  .isArray({ max }).withMessage(`${label} admite máximo ${max} elemento(s)`);

/** Cuerpo del editor: POST /api/quizzes y PUT /api/quizzes/:id */
const quizBody = [
  text('title', 'El título', LIMITS.title[0], LIMITS.title[1]),
  optionalText('description', 'La descripción', LIMITS.description),
  body('categoryId')
    .custom(notBlank).withMessage('La categoría es obligatoria').bail()
    .isMongoId().withMessage('La categoría no es válida'),
  body('tagIds').optional({ values: 'null' })
    .isArray().withMessage('Las etiquetas debe ser una lista').bail()
    .isArray({ max: LIMITS.tags }).withMessage(`Las etiquetas admite máximo ${LIMITS.tags} elemento(s)`),
  body('tagIds.*').isMongoId().withMessage('La etiqueta no es válida'),
  body('timeLimit').optional({ values: 'null' })
    .custom(Number.isInteger).withMessage('El límite de tiempo debe ser un número entero').bail()
    .isInt({ min: LIMITS.timeLimit[0], max: LIMITS.timeLimit[1] })
    .withMessage(`El límite de tiempo debe estar entre ${LIMITS.timeLimit[0]} y ${LIMITS.timeLimit[1]}`),
  list('questions', 'Las preguntas', LIMITS.questions),
  text('questions.*.text', 'El enunciado', 1, LIMITS.questionText),
  optionalText('questions.*.explanation', 'La explicación', LIMITS.explanation),
  list('questions.*.options', 'Las opciones', LIMITS.options).bail()
    .custom((opts) => opts.some((o) => o?.isCorrect === true)).withMessage('Marca al menos una opción correcta').bail()
    .custom((opts) => {
      const texts = opts.map((o) => (typeof o?.text === 'string' ? o.text.trim().toLowerCase() : '')).filter(Boolean);
      return new Set(texts).size === texts.length;
    }).withMessage('Hay opciones repetidas'),
  text('questions.*.options.*.text', 'El texto de la opción', 1, LIMITS.optionText),
  body('questions.*.options.*.isCorrect').optional()
    .isBoolean({ strict: true }).withMessage('isCorrect debe ser true o false'),
];

export const validateQuizId = [idParam('id', QUIZ_404), validate()];
export const validateVersionId = [idParam('versionId', 'Esta versión no existe'), validate()];
export const validateQuiz = [...quizBody, validate('Revisa los datos del quiz')];
export const validateQuizUpdate = [idParam('id', QUIZ_404), ...quizBody, validate('Revisa los datos del quiz')];

/** GET /api/quizzes?q=&page=&limit= */
export const validateSearch = [
  query('q').optional().isString().withMessage('La búsqueda debe ser texto').bail()
    .isLength({ max: 200 }).withMessage('La búsqueda debe tener máximo 200 caracteres'),
  ...paginationRules,
  validate('Revisa los filtros de búsqueda'),
];
