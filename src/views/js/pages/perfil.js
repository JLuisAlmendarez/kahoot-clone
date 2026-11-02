/* Página: perfil con quizzes creados y participados (ruta /perfil/:tab).
   API: GET /api/users/me/quizzes · DELETE /api/quizzes/:id · GET /api/attempts?quizId= */
import { render } from '../core/generate-html.js';
import { api } from '../core/api.js';
import { loadRegion, busy, toast, modal } from '../core/ui.js';
import { skeletonCards, skeletonRows } from '../templates/states.js';
import * as view from '../templates/perfil.js';

export default {
  title: 'Mi perfil',
  auth: true,
  async mount({ outlet, params, me, navigate }) {
    const tab = params.tab === 'participados' ? 'participados' : 'creados';
    if (params.tab !== tab) { navigate('/perfil/creados', { replace: true }); return; }

    render(outlet, view.profileShell(me, tab));
    const region = outlet.querySelector('[data-region="tab"]');
    const header = outlet.querySelector('[data-slot="header"]');
    const deleteModal = outlet.querySelector('#modal-borrar');
    let pendingDelete = null;

    // Las cifras del encabezado salen de las dos listas; se piden en paralelo
    const stats = { created: '…', played: '…', attempts: '…' };
    const renderHeader = () => render(header, view.profileHeader(me, stats));
    Promise.allSettled([api.quizzes.mine(), api.attempts.history()]).then(([mine, history]) => {
      if (mine.status === 'fulfilled') stats.created = mine.value.length;
      if (history.status === 'fulfilled') { stats.played = history.value.totalQuizzes; stats.attempts = history.value.totalAttempts; }
      renderHeader();
    });

    // ------------------------------------------------------------- creados
    async function loadCreated() {
      await loadRegion(region, () => api.quizzes.mine(), {
        loading: skeletonCards(3),
        errorText: 'No pudimos cargar tus quizzes.',
        onData: (list) => {
          stats.created = list.length;
          renderHeader();
          render(region, view.createdList(list));
        },
      });
    }

    // -------------------------------------------------------- participados
    async function loadPlayed(quizId = '') {
      await loadRegion(region, () => api.attempts.history({ quizId }), {
        loading: skeletonRows(3),
        errorText: 'No pudimos cargar tu historial.',
        onData: (history) => {
          render(region, view.playedShell(history.playedQuizzes, quizId));
          render(region.querySelector('[data-region="groups"]'), view.groupsList(history));
          region.querySelector('#filter-quiz').addEventListener('change', (e) => loadPlayed(e.target.value));
        },
      });
    }

    // ---------------------------------------------------------- borrar quiz
    outlet.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-action="delete-quiz"]');
      if (del) {
        pendingDelete = { quizId: del.dataset.quizId, title: del.dataset.title };
        deleteModal.querySelector('[data-slot="delete-title"]').textContent = pendingDelete.title;
        modal(deleteModal).show();
        return;
      }
      const confirm = e.target.closest('[data-action="confirm-delete-quiz"]');
      if (!confirm || !pendingDelete) return;
      const restore = busy(confirm, 'Borrando…');
      try {
        await api.quizzes.remove(pendingDelete.quizId);
        modal(deleteModal).hide();
        toast(`«${pendingDelete.title}» se borró definitivamente.`);
        await loadCreated();
      } catch (err) {
        toast(err.message, 'danger');
      } finally {
        restore();
        pendingDelete = null;
      }
    });

    await (tab === 'creados' ? loadCreated() : loadPlayed());
  },
};
