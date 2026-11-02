/* Usuario de la sesión actual (o null). Las vistas lo leen con session.me
   y la barra de navegación se vuelve a pintar cuando cambia. */
import { api } from './api.js';

const listeners = new Set();

export const session = {
  me: null,
  async refresh() {
    try {
      this.me = await api.auth.me();
    } catch {
      this.me = null;
    }
    listeners.forEach((fn) => fn(this.me));
    return this.me;
  },
  set(user) {
    this.me = user;
    listeners.forEach((fn) => fn(this.me));
  },
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
