/* ============================================================================
   app.js — Arranque común de todas las páginas.
   1. Crea la base simulada (localStorage) y la siembra si está vacía.
   2. Crea la API y la deja en QT.api.
   3. Pide la sesión (GET /api/auth/me) y pinta la barra de navegación.
   Cada página espera QT.ready:   const { api, me } = await QT.ready;

   Parámetros útiles en la URL:
     ?demo=lento   latencia alta, para ver los estados de carga
     ?demo=fallo   la mitad de las lecturas fallan, para ver los errores
   ========================================================================== */
(function (global) {
  'use strict';
  const QT = global.QT;
  const { ui, log } = QT;

  function safeStorage() {
    try {
      const s = global.localStorage;
      s.setItem('__qt', '1'); s.removeItem('__qt');
      return s;
    } catch (e) {
      log.warn('localStorage no está disponible: los datos solo duran mientras la página esté abierta.');
      return null;
    }
  }

  async function boot() {
    const demo = ui.params().get('demo');
    const storage = safeStorage();
    const db = new QT.MockDB({
      storage,
      latency: demo === 'lento' ? [900, 1600] : [60, 220],
      failRate: demo === 'fallo' ? 0.5 : 0,
    });
    if (!db.load()) await QT.seed(db);
    db.sweepExpired();
    setInterval(() => db.sweepExpired(), 60000);

    const session = storage ? QT.storageSession(storage) : QT.memorySession();
    const api = QT.createApi({ db, session });

    /** Borra todo y vuelve a cargar los datos de ejemplo. */
    db.reset = async () => {
      db.clear();
      session.clear();
      await QT.seed(db);
      log.info('Base reiniciada. Recarga la página para ver los cambios.');
    };
    QT.db = db;
    QT.api = api;

    const me = await api.auth.me();
    renderNavbar(api, me);
    ui.showFlash();
    return { api, db, me };
  }

  function renderNavbar(api, me) {
    const nav = document.querySelector('body > header nav.navbar');
    if (!nav) return; // jugar.html tiene su propio encabezado
    const header = nav.closest('header');
    ui.fill(header, { session: !!me, me: me || {} });
    const next = encodeURIComponent(ui.here());
    header.querySelectorAll('[data-action="go-login"]').forEach((a) => { a.href = `acceso.html?modo=login&next=${next}`; });
    header.querySelectorAll('[data-action="go-register"]').forEach((a) => { a.href = `acceso.html?modo=registro&next=${next}`; });
    const out = header.querySelector('[data-action="logout"]');
    if (out) {
      out.addEventListener('click', async () => {
        await api.auth.logout();
        ui.flash('Cerraste sesión', 'dark');
        global.location.href = 'index.html';
      });
    }
  }

  /** Atajos para probar desde la consola. */
  QT.help = function help() {
    console.log(
      '%cQuiztopia en consola%c\n' +
      '  await QT.test()                      corre las pruebas (base en memoria)\n' +
      '  QT.db.stats()                        documentos por colección\n' +
      '  await QT.db.reset()                  vuelve a los datos de ejemplo\n' +
      '  await QT.api.auth.login({ email: "luis@correo.com", password: "quiztopia123" })\n' +
      '  await QT.api.quizzes.search({ q: "sort:populares" })\n' +
      '  await QT.api.quizzes.get("q-algebra")\n' +
      '  QT.log.enabled = false               apaga el registro de peticiones\n' +
      'Usuarios: ana@correo.com, luis@correo.com, ricardo@correo.com, gael@correo.com · contraseña: quiztopia123',
      'font-weight:700;color:#4338ca', '',
    );
  };

  // Mientras arranca, cada región muestra su esqueleto de carga en vez del contenido de ejemplo
  document.querySelectorAll('[data-region]').forEach((region) => ui.setState(region, 'loading'));

  QT.ready = boot();
  QT.ready.then(() => QT.help()).catch((err) => {
    console.error('[Quiztopia] No se pudo iniciar la aplicación', err);
    QT.ui.toast('No se pudo iniciar la aplicación. Revisa la consola.', 'danger');
  });
})(window);
