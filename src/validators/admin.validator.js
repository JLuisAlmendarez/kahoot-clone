import { body, query } from 'express-validator';
import { LIMITS, Roles, USERNAME } from '../shared/rules.js';
import { validate, idParam, paginationRules, notBlank } from './validate.js';

const name = (label, [min, max]) => body('name')
  .custom(notBlank).withMessage(`${label} es obligatorio`).bail()
  .isString().withMessage(`${label} debe ser texto`).bail()
  .trim()
  .isLength({ min }).withMessage(`${label} debe tener al menos ${min} caracteres`)
  .isLength({ max }).withMessage(`${label} debe tener máximo ${max} caracteres`)
  .matches(/[A-Za-z0-9]/).withMessage(`${label} debe tener al menos una letra o número`);

/** GET /api/admin/users */
export const validateUserList = [
  query('q').optional().isString().withMessage('La búsqueda debe ser texto').bail()
    .isLength({ max: 100 }).withMessage('La búsqueda debe tener máximo 100 caracteres'),
  query('role').optional({ values: 'falsy' }).isIn(Object.values(Roles)).withMessage('Rol no válido'),
  query('sort').optional().isIn(['username', 'email', 'role', 'createdAt']).withMessage('No se puede ordenar por esa columna'),
  query('order').optional().isIn(['asc', 'desc']).withMessage('El orden debe ser asc o desc'),
  ...paginationRules,
  validate('Revisa los filtros'),
];

/* Datos de una cuenta: mismas reglas y mensajes que el registro. */
const [uMin, uMax] = LIMITS.username;
const [pMin, pMax] = LIMITS.password;
const usernameRule = () => body('username')
  .custom(notBlank).withMessage('El nombre de usuario es obligatorio').bail()
  .isString().withMessage('El nombre de usuario debe ser texto').bail()
  .trim()
  .isLength({ min: uMin }).withMessage(`El nombre de usuario debe tener al menos ${uMin} caracteres`)
  .isLength({ max: uMax }).withMessage(`El nombre de usuario debe tener máximo ${uMax} caracteres`)
  .matches(USERNAME).withMessage('Usa solo letras, números y guion bajo');
const emailRule = () => body('email')
  .custom(notBlank).withMessage('El correo es obligatorio').bail()
  .isString().withMessage('El correo debe ser texto').bail()
  .trim()
  .isLength({ max: LIMITS.email }).withMessage('El correo es demasiado largo')
  .isEmail().withMessage('Escribe un correo válido');
const passwordRule = (required) => {
  const chain = body('password');
  return (required ? chain.custom(notBlank).withMessage('La contraseña es obligatoria').bail() : chain.optional({ values: 'falsy' }))
    .isString().withMessage('La contraseña debe ser texto').bail()
    .isLength({ min: pMin }).withMessage(`La contraseña debe tener al menos ${pMin} caracteres`)
    .isLength({ max: pMax }).withMessage(`La contraseña debe tener máximo ${pMax} caracteres`);
};
/** El rol nunca se recibe: si alguien lo manda, se rechaza en lugar de ignorarlo en silencio. */
const noRole = body('role').not().exists().withMessage('El rol no se puede asignar ni cambiar desde la API');

/** POST /api/admin/users */
export const validateUserCreate = [usernameRule(), emailRule(), passwordRule(true), noRole, validate('Revisa los datos de la cuenta')];
/** PUT /api/admin/users/:id (password opcional: solo si se quiere restablecer) */
export const validateUserUpdate = [idParam('id', 'El usuario no existe'), usernameRule(), emailRule(), passwordRule(false), noRole, validate('Revisa los datos de la cuenta')];
/** DELETE /api/admin/users/:id */
export const validateUserId = [idParam('id', 'El usuario no existe'), validate()];

/** GET /api/admin/quizzes */
export const validateQuizList = [
  query('q').optional().isString().withMessage('La búsqueda debe ser texto').bail()
    .isLength({ max: 100 }).withMessage('La búsqueda debe tener máximo 100 caracteres'),
  query('categoria').optional({ values: 'falsy' }).matches(/^[a-z0-9-]+$/).withMessage('Categoría no válida'),
  query('sort').optional().isIn(['title', 'owner', 'category', 'playCount', 'likesCount', 'updatedAt']).withMessage('No se puede ordenar por esa columna'),
  query('order').optional().isIn(['asc', 'desc']).withMessage('El orden debe ser asc o desc'),
  ...paginationRules,
  validate('Revisa los filtros'),
];

export const validateCategoryCreate = [name('El nombre de la categoría', LIMITS.categoryName), validate('Revisa la categoría')];
export const validateCategoryUpdate = [idParam('id', 'La categoría no existe'), name('El nombre de la categoría', LIMITS.categoryName), validate('Revisa la categoría')];
export const validateCategoryId = [idParam('id', 'La categoría no existe'), validate()];

export const validateTagCreate = [idParam('id', 'La categoría no existe'), name('El nombre de la etiqueta', LIMITS.tagName), validate('Revisa la etiqueta')];
export const validateTagUpdate = [idParam('id', 'La categoría no existe'), idParam('tagId', 'La etiqueta no existe'), name('El nombre de la etiqueta', LIMITS.tagName), validate('Revisa la etiqueta')];
export const validateTagId = [idParam('id', 'La categoría no existe'), idParam('tagId', 'La etiqueta no existe'), validate()];
