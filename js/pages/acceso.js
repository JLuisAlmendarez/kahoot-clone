/* acceso.js — acceso.html: iniciar sesión y crear cuenta.
   API: POST /api/auth/login · POST /api/auth/register
   ?modo=registro abre "Crear cuenta"; ?next=pagina.html regresa ahí al terminar. */
(async function () {
  'use strict';
  const { ui } = QT;
  const { api, me } = await QT.ready;

  const params = ui.params();
  const next = ui.safeNext(params.get('next'));
  if (me) { location.replace(next); return; }

  const main = document.getElementById('main');
  ui.fill(main, { next: params.has('next'), loginError: false });
  if (params.get('modo') === 'registro' && window.bootstrap) {
    bootstrap.Tab.getOrCreateInstance(document.getElementById('tab-registro')).show();
  }

  const loginForm = document.querySelector('[data-form="login"]');
  const registerForm = document.querySelector('[data-form="register"]');
  const loginError = loginForm.querySelector('[data-show-if="loginError"]');

  /** Marca un campo como inválido con el mensaje del servidor. */
  function fieldError(form, name, message) {
    const input = form.elements[name];
    if (!input) return false;
    input.setCustomValidity(message);
    const feedback = input.closest('.mb-3, .mb-4')?.querySelector('.invalid-feedback');
    if (feedback) feedback.textContent = message;
    input.classList.add('is-invalid');
    input.addEventListener('input', () => { input.setCustomValidity(''); input.classList.remove('is-invalid'); }, { once: true });
    return true;
  }

  // ----------------------------------------------------------- iniciar sesión
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    loginForm.classList.add('was-validated');
    if (!loginForm.checkValidity()) { loginForm.querySelector(':invalid').focus(); return; }
    const restore = ui.busy(loginForm.querySelector('[type="submit"]'), 'Entrando…');
    try {
      const { user } = await api.auth.login({ email: loginForm.email.value, password: loginForm.password.value });
      ui.flash(`Hola, @${user.username}`);
      location.href = next;
    } catch (err) {
      restore();
      loginError.hidden = false;
      loginError.lastChild.textContent = err.status === 401 ? 'Credenciales inválidas.' : ` ${err.message}`;
    }
  });

  // -------------------------------------------------------------- registro
  const pass = registerForm.elements.password;
  const pass2 = document.getElementById('reg-password2');
  const checkMatch = () => pass2.setCustomValidity(pass2.value && pass2.value !== pass.value ? 'Las contraseñas no coinciden' : '');
  pass.addEventListener('input', checkMatch);
  pass2.addEventListener('input', checkMatch);

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    checkMatch();
    registerForm.classList.add('was-validated');
    if (!registerForm.checkValidity()) { registerForm.querySelector(':invalid').focus(); return; }
    const restore = ui.busy(registerForm.querySelector('[type="submit"]'), 'Creando cuenta…');
    try {
      const { user } = await api.auth.register({
        username: registerForm.username.value, email: registerForm.email.value, password: pass.value,
      });
      ui.flash(`¡Cuenta creada! Bienvenido, @${user.username}`);
      location.href = next;
    } catch (err) {
      restore();
      registerForm.classList.remove('was-validated');
      const shown = (err.fields || []).map((f) => fieldError(registerForm, f.path, f.message)).some(Boolean);
      if (!shown) ui.toast(err.message, 'danger');
      registerForm.querySelector('.is-invalid')?.focus();
    }
  });
})();
