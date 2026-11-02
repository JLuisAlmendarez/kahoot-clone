import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

export const COOKIE = 'qt_token';

const cookieOptions = () => ({
  httpOnly: true,               // JavaScript del navegador no puede leerla (protege contra XSS)
  sameSite: 'lax',              // no viaja en peticiones de otros sitios (protege contra CSRF)
  secure: env.isProduction,     // solo por HTTPS en producción
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

/** Firma un JWT con el id del usuario y lo guarda en una cookie httpOnly. */
export function startSession(res, user) {
  const token = jwt.sign({ sub: String(user._id) }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
  res.cookie(COOKIE, token, cookieOptions());
}

export function endSession(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE, opts);
}

/**
 * Lee la cookie de sesión en cada petición y deja el usuario en req.user
 * (o null si no hay sesión o el token no es válido). No bloquea la petición.
 */
export async function loadUser(req, res, next) {
  req.user = null;
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const { sub } = jwt.verify(token, env.jwtSecret);
    req.user = await User.findById(sub);
    if (!req.user) endSession(res);
  } catch {
    endSession(res); // token vencido o alterado
  }
  return next();
}

/**
 * Exige uno de los roles indicados: 401 sin sesión, 403 con otro rol.
 *   r.get('/admin/users', allowRoles('admin'), ...)
 */
export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden('Esta sección es solo para administradores'));
    return next();
  };
}

/** Exige sesión: 401 si no hay usuario. */
export function requireAuth(req, res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  return next();
}
