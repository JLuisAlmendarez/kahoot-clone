import { body } from 'express-validator';
import { LIMITS, USERNAME } from '../shared/rules.js';
import { validate, notBlank } from './validate.js';

const [uMin, uMax] = LIMITS.username;
const [pMin, pMax] = LIMITS.password;

/** POST /api/auth/register { username, email, password } */
export const validateRegister = [
  body('username')
    .custom(notBlank).withMessage('El nombre de usuario es obligatorio').bail()
    .isString().withMessage('El nombre de usuario debe ser texto').bail()
    .trim()
    .isLength({ min: uMin }).withMessage(`El nombre de usuario debe tener al menos ${uMin} caracteres`)
    .isLength({ max: uMax }).withMessage(`El nombre de usuario debe tener máximo ${uMax} caracteres`)
    .matches(USERNAME).withMessage('Usa solo letras, números y guion bajo'),
  body('email')
    .custom(notBlank).withMessage('El correo es obligatorio').bail()
    .isString().withMessage('El correo debe ser texto').bail()
    .trim()
    .isLength({ max: LIMITS.email }).withMessage('El correo es demasiado largo')
    .isEmail().withMessage('Escribe un correo válido'),
  body('password')
    .custom(notBlank).withMessage('La contraseña es obligatoria').bail()
    .isString().withMessage('La contraseña debe ser texto').bail()
    .isLength({ min: pMin }).withMessage(`La contraseña debe tener al menos ${pMin} caracteres`)
    .isLength({ max: pMax }).withMessage(`La contraseña debe tener máximo ${pMax} caracteres`),
  validate('Revisa los datos de tu cuenta'),
];

/** POST /api/auth/login { email, password } */
export const validateLogin = [
  body('email')
    .custom(notBlank).withMessage('El correo es obligatorio').bail()
    .isString().withMessage('El correo debe ser texto').bail()
    .trim()
    .isEmail().withMessage('Escribe un correo válido'),
  body('password')
    .custom(notBlank).withMessage('La contraseña es obligatoria').bail()
    .isString().withMessage('La contraseña debe ser texto'),
  validate('Revisa los datos de inicio de sesión'),
];
