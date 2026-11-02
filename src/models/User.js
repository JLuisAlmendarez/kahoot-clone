import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { LIMITS, EMAIL, USERNAME, Roles, initials } from '../shared/rules.js';

const userSchema = new mongoose.Schema({
  username: {
    type: String, required: [true, 'El nombre de usuario es obligatorio'], trim: true, lowercase: true,
    minlength: [LIMITS.username[0], `El nombre de usuario debe tener al menos ${LIMITS.username[0]} caracteres`],
    maxlength: [LIMITS.username[1], `El nombre de usuario debe tener máximo ${LIMITS.username[1]} caracteres`],
    match: [USERNAME, 'Usa solo letras, números y guion bajo'],
  },
  email: {
    type: String, required: [true, 'El correo es obligatorio'], trim: true, lowercase: true,
    maxlength: [LIMITS.email, 'El correo es demasiado largo'], match: [EMAIL, 'Escribe un correo válido'],
  },
  // select: false → nunca sale en una consulta salvo que se pida con .select('+passwordHash')
  passwordHash: { type: String, required: true, select: false },
  // Rol global: 'user' (por defecto) o 'admin'. Se lee de la base en cada petición,
  // así un cambio de rol aplica de inmediato sin esperar a que venza el token.
  role: { type: String, enum: { values: Object.values(Roles), message: 'Rol no válido' }, default: Roles.USER },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });

userSchema.virtual('isAdmin').get(function isAdmin() { return this.role === Roles.ADMIN; });

/** Correo como se guarda: sin espacios y en minúsculas (login y registro usan la misma regla). */
userSchema.statics.normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

/** Cifra la contraseña con bcrypt (coste 10; en pruebas 4 para que corran rápido). */
userSchema.statics.hashPassword = (plain) => bcrypt.hash(String(plain), process.env.NODE_ENV === 'test' ? 4 : 10);

userSchema.methods.checkPassword = function checkPassword(plain) {
  return bcrypt.compare(String(plain ?? ''), this.passwordHash || '');
};

userSchema.methods.toRef = function toRef() {
  return { userId: this._id, username: this.username };
};

userSchema.methods.toPublic = function toPublic() {
  return { userId: String(this._id), username: this.username, initials: initials(this.username), role: this.role, createdAt: this.createdAt.toISOString() };
};

export const User = mongoose.model('User', userSchema);
