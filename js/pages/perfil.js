/* perfil.js — perfil.html?tab=creados|participados
   API: GET /api/users/me/quizzes · DELETE /api/quizzes/:id · GET /api/attempts?quizId= */
(async function () {
  'use strict';
  const { ui } = QT;
  const { api, me } = await QT.ready;
  if (!me) { location.replace(`acceso.html?modo=login&next=${encodeURIComponent(ui.here())}`); return; }

  const profile = document.querySelector('[aria-labelledby="profile-name"]');
  const createdRegion = document.querySelector('[data-region="created"]');
  const playedRegion = document.querySelector('[data-region="played"]');
  const filter = document.getElementById('filter-quiz');
  const stats = { created: '…', played: '…', attempts: '…' };
  let pendingDelete = null;

  // Pestaña inicial según la URL (equivale a /perfil/participados)
  if (ui.params().get('tab') === 'participados' && window.bootstrap) {
    bootstrap.Tab.getOrCreateInstance(document.getElementById('tab-participados')).show();
  }
  document.querySelectorAll('[data-bs-toggle="tab"]').forEach((tab) => {
    tab.addEventListener('shown.bs.tab', () => {
      const name = tab.id.replace('tab-', '');
      history.replaceState(null, '', `perfil.html?tab=${name}`);
    });
  });

  const renderProfile = () => ui.fill(profile, {
    me: { ...me, createdAt: ui.fmt.month.format(new Date(me.createdAt)) }, stats,
  });
  renderProfile();

  // -------------------------------------------------------- creados
  async function loadCreated() {
    const list = await ui.load(createdRegion, () => api.quizzes.mine(), { isEmpty: (l) => l.length === 0 });
    if (!list) return;
    stats.created = list.length;
    renderProfile();
    ui.renderList(createdRegion.querySelector('[data-list="quizzes"]'), list, {
      onItem: (col, q) => { col.querySelector('[data-action="delete-quiz"]').dataset.quizId = q.quizId; col.dataset.title = q.title; },
    });
  }
  createdRegion.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="delete-quiz"]');
    if (!btn) return;
    pendingDelete = { quizId: btn.dataset.quizId, title: btn.closest('[data-title]').dataset.title };
    ui.fill(document.getElementById('modal-borrar'), pendingDelete);
  });
  document.querySelector('[data-action="confirm-delete-quiz"]').addEventListener('click', async (e) => {
    if (!pendingDelete) return;
    const restore = ui.busy(e.currentTarget, 'Borrando…');
    try {
      await api.quizzes.remove(pendingDelete.quizId);
      ui.modal('modal-borrar').hide();
      ui.toast(`«${pendingDelete.title}» se borró. Quienes lo jugaron conservan sus intentos 3 meses.`);
      await Promise.all([loadCreated(), loadPlayed()]);
    } catch (err) {
      ui.toast(err.message, 'danger');
    } finally {
      restore();
      pendingDelete = null;
    }
  });

  // ---------------------------------------------------- participados
  async function loadPlayed() {
    const quizId = filter.value || null;
    const history = await ui.load(playedRegion, () => api.attempts.history({ quizId }), { isEmpty: (h) => h.groups.length === 0 });
    if (!history) return;
    if (!quizId) {
      stats.played = history.totalQuizzes;
      stats.attempts = history.totalAttempts;
      renderProfile();
      const current = filter.value;
      filter.replaceChildren(new Option('Todos', ''), ...history.playedQuizzes.map((q) => new Option(q.title, q.quizId)));
      filter.value = current;
    }
    ui.fill(playedRegion, history);
    ui.renderList(playedRegion.querySelector('[data-list="groups"]'), history.groups, {
      onItem: (card, g) => {
        if (g.quiz.deleted) {
          card.classList.add('border-warning-subtle');
          card.querySelector('.card-header').classList.replace('bg-white', 'bg-warning-subtle');
        }
      },
    });
  }
  filter.addEventListener('change', loadPlayed);

  await Promise.allSettled([loadCreated(), loadPlayed()]);
})();
