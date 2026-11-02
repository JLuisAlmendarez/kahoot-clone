/* Vista de acceso: iniciar sesión y crear cuenta (ruta /acceso?modo=login|registro&next=). */
import { html, cls } from '../core/generate-html.js';

const tab = (id, label, active) => html`
  <li class="nav-item" role="presentation">
    <button class="${cls('nav-link', active && 'active')}" id="tab-${id}" data-bs-toggle="pill" data-bs-target="#pane-${id}" type="button" role="tab" aria-controls="pane-${id}" aria-selected="${String(active)}">${label}</button>
  </li>`;

export const accessView = ({ register, hasNext }) => html`
  <div class="row justify-content-center py-md-3">
    <div class="col-12 col-sm-10 col-md-7 col-lg-5">
      <div class="text-center mb-4">
        <span class="brand-mark mx-auto mb-2" aria-hidden="true"><i class="bi bi-patch-question-fill"></i></span>
        <h1 class="h3 fw-bold">Bienvenido a Quiztopia</h1>
        <p class="text-muted-qt mb-0">Crea quizzes, resuélvelos y comenta con la comunidad.</p>
      </div>
      ${hasNext && html`
        <div class="alert alert-info small d-flex gap-2" role="status">
          <i class="bi bi-info-circle mt-1" aria-hidden="true"></i>
          <span>Inicia sesión para continuar. Después te regresaremos a donde estabas.</span>
        </div>`}
      <div class="card shadow-sm">
        <div class="card-body p-4">
          <ul class="nav nav-pills nav-fill mb-4" role="tablist">
            ${tab('login', 'Iniciar sesión', !register)}
            ${tab('registro', 'Crear cuenta', register)}
          </ul>
          <div class="tab-content">
            <section class="${cls('tab-pane fade', !register && 'show active')}" id="pane-login" role="tabpanel" aria-labelledby="tab-login" tabindex="0">
              <form novalidate data-form="login">
                <div class="alert alert-danger py-2 small" role="alert" data-slot="login-error" hidden></div>
                <div class="mb-3">
                  <label for="login-email" class="form-label">Correo electrónico</label>
                  <input type="email" class="form-control" id="login-email" name="email" autocomplete="email" required placeholder="tu@correo.com">
                  <div class="invalid-feedback">Escribe un correo válido.</div>
                </div>
                <div class="mb-4">
                  <label for="login-password" class="form-label">Contraseña</label>
                  <input type="password" class="form-control" id="login-password" name="password" autocomplete="current-password" required>
                  <div class="invalid-feedback">Escribe tu contraseña.</div>
                </div>
                <button type="submit" class="btn btn-primary w-100 btn-lg">Entrar</button>
              </form>
              <p class="small text-muted-qt text-center mt-3 mb-0">Prueba con <code>ana@correo.com</code> · <code>quiztopia123</code></p>
            </section>
            <section class="${cls('tab-pane fade', register && 'show active')}" id="pane-registro" role="tabpanel" aria-labelledby="tab-registro" tabindex="0">
              <form novalidate data-form="register">
                <div class="mb-3">
                  <label for="reg-username" class="form-label">Nombre de usuario</label>
                  <div class="input-group has-validation">
                    <span class="input-group-text">@</span>
                    <input type="text" class="form-control" id="reg-username" name="username" autocomplete="username"
                           required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" placeholder="tu_usuario" aria-describedby="reg-username-help">
                    <div class="invalid-feedback">De 3 a 20 caracteres: letras, números y _.</div>
                  </div>
                  <div id="reg-username-help" class="form-text">Letras, números y guion bajo, sin espacios. Así te verán en el foro.</div>
                </div>
                <div class="mb-3">
                  <label for="reg-email" class="form-label">Correo electrónico</label>
                  <input type="email" class="form-control" id="reg-email" name="email" autocomplete="email" required placeholder="tu@correo.com">
                  <div class="invalid-feedback">Escribe un correo válido.</div>
                </div>
                <div class="mb-3">
                  <label for="reg-password" class="form-label">Contraseña</label>
                  <input type="password" class="form-control" id="reg-password" name="password" autocomplete="new-password" required minlength="8" aria-describedby="reg-password-help">
                  <div class="invalid-feedback">Usa al menos 8 caracteres.</div>
                  <div id="reg-password-help" class="form-text">Mínimo 8 caracteres.</div>
                </div>
                <div class="mb-4">
                  <label for="reg-password2" class="form-label">Confirmar contraseña</label>
                  <input type="password" class="form-control" id="reg-password2" name="password2" autocomplete="new-password" required minlength="8">
                  <div class="invalid-feedback">Las contraseñas no coinciden.</div>
                </div>
                <button type="submit" class="btn btn-primary w-100 btn-lg">Crear cuenta</button>
              </form>
            </section>
          </div>
        </div>
      </div>
    </div>
  </div>`;
