/* ============================================================================
   router.js — Navegación de la SPA con la History API.
   Las URLs son normales (/quiz/123, /perfil/participados); el servidor
   responde index.html para todas y aquí se decide qué página montar.

   Una página es un objeto:
     {
       title: 'Explorar',          // o una función (ctx) => string
       auth: true,                 // exige sesión (si no, manda a /acceso)
       bare: true,                 // sin navbar ni footer (la pantalla de juego)
       async mount(ctx) { ...; return () => limpiar }  // pinta y enlaza eventos
     }
   ctx = { outlet, params, query, me, navigate, setLeaveGuard }
   ========================================================================== */
import { render } from './generate-html.js';
import { closeModals } from './ui.js';
import { session } from './session.js';
import { layout, renderNavbar } from '../templates/layout.js';
import { spinner } from '../templates/states.js';

const routes = [];
let cleanup = null;
let leaveGuard = null;   // función que decide si se puede salir de la página actual
let current = '';        // URL montada (para deshacer un «Atrás» bloqueado)
let rendering = 0;

/** Registra una ruta: '/quiz/:id' → { id } */
export function route(path, page) {
  const keys = [];
  const pattern = path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  routes.push({ regex: new RegExp(`^${pattern}/?$`), keys, page });
}

let notFoundPage = null;
export const setNotFound = (page) => { notFoundPage = page; };

function match(pathname) {
  for (const r of routes) {
    const m = pathname.match(r.regex);
    if (m) return { page: r.page, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return { page: notFoundPage, params: {} };
}

const here = () => location.pathname + location.search;

/** La página actual puede pedir confirmación antes de salir (editor sin guardar, juego en curso). */
function canLeave() {
  return leaveGuard ? leaveGuard() !== false : true;
}

/** Navega a otra URL de la app. replace = no agrega entrada al historial. */
export async function navigate(url, { replace = false, force = false } = {}) {
  if (!force && !canLeave()) return false;
  leaveGuard = null;
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
  await mountCurrent();
  return true;
}

async function mountCurrent() {
  const token = ++rendering;
  closeModals();
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  leaveGuard = null;
  current = here();

  const { page, params } = match(location.pathname);
  const query = new URLSearchParams(location.search);
  const me = session.me;

  if (page.auth && !me) {
    navigate(`/acceso?modo=login&next=${encodeURIComponent(here())}`, { replace: true, force: true });
    return;
  }

  const app = document.getElementById('app');
  render(app, page.bare ? spinner() : layout(me, location.pathname));
  const outlet = page.bare ? app : app.querySelector('#main');

  const ctx = {
    outlet, params, query, me, navigate,
    setLeaveGuard: (fn) => { leaveGuard = fn; },
  };
  document.title = `${typeof page.title === 'function' ? page.title(ctx) : page.title} · Quiztopia`;

  const result = await page.mount(ctx);
  if (token !== rendering) { if (typeof result === 'function') result(); return; } // ya se navegó a otra página
  cleanup = typeof result === 'function' ? result : null;

  // Si la URL trae #ancla (por ejemplo /quiz/123#foro) se baja hasta ella
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  else window.scrollTo(0, 0);
}

/** Intercepta los clics en enlaces internos para no recargar la página. */
function onClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download') || a.dataset.external !== undefined) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Ancla dentro de la misma página: se deja al navegador (scroll)
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
  e.preventDefault();
  navigate(url.pathname + url.search + url.hash);
}

export function start() {
  document.addEventListener('click', onClick);
  window.addEventListener('popstate', () => {
    if (!canLeave()) { history.pushState(null, '', current); return; } // se queda donde estaba
    mountCurrent();
  });
  // Al iniciar o cerrar sesión se repinta la barra de navegación
  session.onChange((me) => renderNavbar(me, location.pathname));
  return mountCurrent();
}

/** Vuelve a montar la página actual (por ejemplo, después de iniciar sesión). */
export const reload = () => mountCurrent();
