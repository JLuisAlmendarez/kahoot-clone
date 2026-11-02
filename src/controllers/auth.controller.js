import { User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { Checker, LIMITS } from '../shared/rules.js';
import { startSession, endSession } from '../middleware/auth.js';

// Hash de relleno: si el correo no existe igual se compara una contraseña,
// así la respuesta tarda lo mismo y no revela qué correos están registrados.
const DUMMY = new User({ passwordHash: await User.hashPassword('relleno-para-igualar-tiempos') });

/** POST /api/auth/register { username, email, password } */
export async function register(req, res) {
  const { username, email, password } = req.body ?? {};
  const check = new Checker().string(password, 'password', { min: LIMITS.password[0], max: LIMITS.password[1], label: 'La contraseña' });
  const user = new User({ username, email, passwordHash: 'pendiente' });
  try {
    await user.validate();
  } catch (err) {
    Object.values(err.errors || {}).forEach((e) => check.add(e.path, e.message));
  }
  if (!check.ok) throw ApiError.badRequest('Revisa los datos de tu cuenta', check.errors);

  user.passwordHash = await User.hashPassword(password);
  await user.save(); // si el usuario o correo ya existen, el índice único responde 409
  startSession(res, user);
  res.status(201).json({ user: user.toPublic() });
}

/** POST /api/auth/login { email, password } — mismo mensaje si falla el correo o la contraseña */
export async function login(req, res) {
  const { email, password } = req.body ?? {};
  const user = await User.findOne({ email: User.normalizeEmail(email) }).select('+passwordHash');
  const ok = await (user || DUMMY).checkPassword(password) && !!user;
  if (!user || !ok) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
  startSession(res, user);
  res.json({ user: user.toPublic() });
}

/** POST /api/auth/logout */
export async function logout(req, res) {
  endSession(res);
  res.json({ ok: true });
}

/** GET /api/auth/me — el usuario de la sesión, o null si no hay */
export async function me(req, res) {
  res.json(req.user ? req.user.toPublic() : null);
}
