/* Estructura común: barra de navegación, contenedor principal y pie de página. */
import { html, render, cls } from '../core/generate-html.js';
import { spinner } from './states.js';

const navLink = (href, icon, label, path) => {
  const active = href === '/' ? path === '/' : path.startsWith(href);
  return html`<li class="nav-item"><a class="${cls('nav-link', active && 'active')}" ${active ? html`aria-current="page"` : ''} href="${href}"><i class="bi bi-${icon} me-1" aria-hidden="true"></i>${label}</a></li>`;
};

export function navbar(me, path = '/') {
  const next = encodeURIComponent(path === '/acceso' ? '/' : path + location.search);
  return html`
    <nav class="navbar navbar-expand-md bg-white border-bottom sticky-top" aria-label="Principal">
      <div class="container">
        <a class="navbar-brand d-flex align-items-center" href="/"><span class="brand-mark" aria-hidden="true"><i class="bi bi-patch-question-fill"></i></span>Quiztopia</a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-controls="mainNav" aria-expanded="false" aria-label="Abrir menú">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="mainNav">
          <ul class="navbar-nav me-auto mb-2 mb-md-0">
            ${navLink('/', 'compass', 'Explorar', path)}
            ${me && navLink('/editor', 'plus-circle', 'Crear quiz', path)}
            ${me?.role === 'admin' && navLink('/admin', 'shield-lock', 'Administración', path)}
          </ul>
          ${me ? html`
            <div class="dropdown">
              <button class="btn btn-light d-flex align-items-center gap-2 dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                <span class="avatar" aria-hidden="true">${me.initials}</span><span>@${me.username}</span>
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><a class="dropdown-item" href="/perfil/creados"><i class="bi bi-collection me-2" aria-hidden="true"></i>Quizzes creados</a></li>
                <li><a class="dropdown-item" href="/perfil/participados"><i class="bi bi-clock-history me-2" aria-hidden="true"></i>Quizzes participados</a></li>
                ${me.role === 'admin' && html`<li><a class="dropdown-item" href="/admin/usuarios"><i class="bi bi-shield-lock me-2" aria-hidden="true"></i>Administración</a></li>`}
                <li><hr class="dropdown-divider"></li>
                <li><button class="dropdown-item" type="button" data-action="logout"><i class="bi bi-box-arrow-right me-2" aria-hidden="true"></i>Cerrar sesión</button></li>
              </ul>
            </div>` : html`
            <div class="nav-visitor">
              <a class="btn btn-outline-primary flex-fill" href="/acceso?modo=login&next=${next}">Iniciar sesión</a>
              <a class="btn btn-primary flex-fill" href="/acceso?modo=registro&next=${next}">Registrarse</a>
            </div>`}
        </div>
      </div>
    </nav>`;
}

export const footer = () => html`
  <footer class="site-footer py-4 mt-5">
    <div class="container d-flex flex-column flex-sm-row justify-content-between gap-2">
      <span>© 2026 Quiztopia · ITESO · Desarrollo de aplicaciones y servicios web</span>
      <span class="text-muted-qt">Express · MongoDB · SPA sin frameworks</span>
    </div>
  </footer>`;

/** Página completa: la vista se monta dentro de <main id="main">. */
export const layout = (me, path) => html`
  <header id="site-header">${navbar(me, path)}</header>
  <main id="main" tabindex="-1" class="container py-4">${spinner()}</main>
  ${footer()}`;

/** Repinta solo la barra (al iniciar o cerrar sesión) sin tocar la vista. */
export function renderNavbar(me, path) {
  const header = document.getElementById('site-header');
  if (header) render(header, navbar(me, path));
}
