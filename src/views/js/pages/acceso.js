/* Página: iniciar sesión y crear cuenta (ruta /acceso?modo=registro&next=/quiz/123).
   API: POST /api/auth/login · POST /api/auth/register */
import { render } from '../core/generate-html.js';
import { api } from '../core/api.js';
import { session } from '../core/session.js';
import { busy, toast, fieldError } from '../core/ui.js';
import { accessView } from '../templates/acceso.js';

/** Solo se permite volver a rutas propias (evita redirecciones abiertas a otros sitios). */
const safeNext = (next) => (next && /^\/(?!\/)[\w\-/?=&%.#]*$/.test(next) && !next.startsWith('/acceso') ? next : '/');

export default {
  title: 'Acceso',
  async mount({ outlet, query, me, navigate }) {
    const next = safeNext(query.get('next'));
    if (me) { navigate(next, { replace: true }); return; }

    render(outlet, accessView({ register: query.get('modo') === 'registro', hasNext: query.has('next') }));
    const loginForm = outlet.querySelector('[data-form="login"]');
    const registerForm = outlet.querySelector('[data-form="register"]');
    const loginError = loginForm.querySelector('[data-slot="login-error"]');

    const done = (user, message) => {
      session.set(user);
      toast(message, 'success');
      navigate(next, { replace: true });
    };

    // ------------------------------------------------------- iniciar sesión
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginError.hidden = true;
      loginForm.classList.add('was-validated');
      if (!loginForm.checkValidity()) { loginForm.querySelector(':invalid').focus(); return; }
      const restore = busy(loginForm.querySelector('[type="submit"]'), 'Entrando…');
      try {
        const { user } = await api.auth.login({ email: loginForm.email.value, password: loginForm.password.value });
        done(user, `Hola, @${user.username}`);
      } catch (err) {
        restore();
        loginError.hidden = false;
        loginError.textContent = err.status === 401 ? 'Credenciales inválidas.' : err.message;
      }
    });

    // ------------------------------------------------------------ registro
    const pass = registerForm.password;
    const pass2 = registerForm.password2;
    const checkMatch = () => pass2.setCustomValidity(pass2.value && pass2.value !== pass.value ? 'Las contraseñas no coinciden' : '');
    pass.addEventListener('input', checkMatch);
    pass2.addEventListener('input', checkMatch);

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      checkMatch();
      registerForm.classList.add('was-validated');
      if (!registerForm.checkValidity()) { registerForm.querySelector(':invalid').focus(); return; }
      const restore = busy(registerForm.querySelector('[type="submit"]'), 'Creando cuenta…');
      try {
        const { user } = await api.auth.register({ username: registerForm.username.value, email: registerForm.email.value, password: pass.value });
        done(user, `¡Cuenta creada! Bienvenido, @${user.username}`);
      } catch (err) {
        restore();
        registerForm.classList.remove('was-validated');
        const shown = (err.fields || []).map((f) => fieldError(registerForm, f.path, f.message)).some(Boolean);
        if (!shown) toast(err.message, 'danger');
        registerForm.querySelector('.is-invalid')?.focus();
      }
    });
  },
};
