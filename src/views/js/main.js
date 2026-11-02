/* ============================================================================
   main.js — Arranque de la SPA.
   1. Pide la sesión (GET /api/auth/me).
   2. Registra las rutas → páginas.
   3. Arranca el router, que monta la página de la URL actual.
   ========================================================================== */
import { route, setNotFound, start, navigate } from './core/router.js';
import { session } from './core/session.js';
import { api } from './core/api.js';
import { toast } from './core/ui.js';

import catalogo from './pages/catalogo.js';
import quiz from './pages/quiz.js';
import editor from './pages/editor.js';
import jugar from './pages/jugar.js';
import resultado from './pages/resultado.js';
import perfil from './pages/perfil.js';
import acceso from './pages/acceso.js';
import admin from './pages/admin.js';
import notFound from './pages/notFound.js';

route('/', catalogo);
route('/quiz/:id', quiz);
route('/editor', editor);
route('/editor/:id', editor);
route('/jugar/:attemptId', jugar);
route('/resultado/:attemptId', resultado);
route('/perfil', perfil);
route('/perfil/:tab', perfil);
route('/acceso', acceso);
route('/admin', admin);
route('/admin/:tab', admin);
setNotFound(notFound);

// Cerrar sesión desde la barra (está en todas las páginas con navbar)
document.addEventListener('click', async (e) => {
  if (!e.target.closest('[data-action="logout"]')) return;
  await api.auth.logout().catch(() => {});
  session.set(null);
  toast('Cerraste sesión');
  navigate('/', { force: true });
});

await session.refresh();
await start();
