/* Página: jugar un intento, una pregunta a la vez con cronómetro (ruta /jugar/:attemptId).
   API: GET /api/attempts/:id/play · POST /api/attempts/:id/answers · POST /api/attempts/:id/finish
        POST /api/attempts/:id/abandon (botón Salir, salir de la página o sendBeacon al cerrar la pestaña) */
import { html, render } from '../core/generate-html.js';
import { api } from '../core/api.js';
import { loadRegion, busy, toast, modal, closeModals } from '../core/ui.js';
import { emptyState } from '../templates/states.js';
import { layout } from '../templates/layout.js';
import * as view from '../templates/jugar.js';

export default {
  title: 'Jugando',
  auth: true,
  bare: true,
  async mount({ outlet, params, me, navigate, setLeaveGuard }) {
    // outlet es #app: todo se monta dentro de un contenedor propio para no dejar listeners al salir
    const root = document.createElement('div');
    outlet.replaceChildren(root);

    let session = null;
    await loadRegion(root, () => api.attempts.play(params.attemptId), {
      onError: (err) => {
        if (err.status !== 409 && err.status !== 404 && err.status !== 403) return false;
        render(outlet, layout(me, location.pathname));
        render(outlet.querySelector('#main'), html`<div class="py-4">${emptyState({
          icon: 'hourglass-bottom', title: 'Este intento ya terminó o quedó interrumpido',
          text: err.status === 409 ? 'Puedes revisar tu resultado o iniciar un intento nuevo desde el quiz.' : err.message,
          action: html`<a class="btn btn-primary" href="/perfil/participados">Ir a mi historial</a>`,
        })}</div>`);
        return true;
      },
      onData: (data) => { session = data; },
    });
    if (!session) return undefined;

    document.title = `Jugando: ${session.quizTitle} · Quiztopia`;
    render(root, view.playShell(session));
    const form = root.querySelector('[data-form="answer"]');
    const timerEl = root.querySelector('.timer');
    const progress = root.querySelector('.progress');

    let answered = session.answeredQuestionIds.length;
    let index = Math.max(0, session.questions.findIndex((q) => !session.answeredQuestionIds.includes(q.questionId)));
    let feedback = null;
    let state = 'playing'; // playing → finishing → done
    let timer = null;
    const question = () => session.questions[index];
    const isLast = () => index === session.questions.length - 1;

    function renderProgress() {
      const total = session.questions.length;
      root.querySelector('[data-slot="current"]').textContent = index + 1;
      root.querySelector('[data-slot="answered"]').textContent = answered;
      progress.setAttribute('aria-valuenow', answered);
      progress.querySelector('.progress-bar').style.width = `${Math.round((answered / total) * 100)}%`;
    }
    function renderQuestion() {
      render(form, view.questionCard(question(), { feedback, isLast: isLast() }));
      renderProgress();
      (feedback ? form.querySelector('[data-next]') : form.querySelector('input'))?.focus();
    }

    // ------------------------------------------------------------ eventos
    form.addEventListener('change', () => {
      if (!feedback) form.querySelector('[type="submit"]').disabled = !form.querySelector('input:checked');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (feedback) { if (isLast()) finish(); else { index += 1; feedback = null; renderQuestion(); } return; }
      const selected = [...form.querySelectorAll('input:checked')].map((i) => i.value);
      if (!selected.length) return;
      const restore = busy(form.querySelector('[type="submit"]'), 'Calificando…');
      try {
        const res = await api.attempts.answer(session.attemptId, { questionId: question().questionId, selectedOptionIds: selected });
        answered = res.answered;
        feedback = { ...res, selected };
        renderQuestion();
      } catch (err) {
        restore();
        if (err.code === 'TIME_UP') timeUp();
        else if (err.code === 'ALREADY_ANSWERED') { index = Math.min(index + 1, session.questions.length - 1); renderQuestion(); }
        else if (err.code === 'ATTEMPT_CLOSED') { state = 'done'; navigate(`/resultado/${session.attemptId}`, { force: true }); }
        else toast(err.message, 'danger');
      }
    });

    async function finish(reason = null) {
      if (state !== 'playing') return;
      state = 'finishing';
      clearInterval(timer);
      try {
        await api.attempts.finish(session.attemptId, { reason });
      } catch (err) {
        if (err.code !== 'ATTEMPT_CLOSED') { state = 'playing'; toast(err.message, 'danger'); return; }
      }
      state = 'done';
      if (reason !== 'timeout') navigate(`/resultado/${session.attemptId}`, { force: true });
    }

    async function timeUp() {
      clearInterval(timer);
      await finish('timeout');
      state = 'done';
      closeModals();
      const m = root.querySelector('#modal-timeout');
      m.querySelector('[data-slot="timeout-answered"]').textContent = answered;
      modal(m).show();
    }

    // -------------------------------------------------------- cronómetro
    if (session.deadlineAt) {
      const deadline = new Date(session.deadlineAt).getTime();
      const remaining = timerEl.querySelector('[data-slot="remaining"]');
      const tick = () => {
        const ms = Math.max(0, deadline - Date.now());
        const s = Math.ceil(ms / 1000);
        remaining.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
        timerEl.setAttribute('aria-label', `Tiempo restante: ${Math.floor(s / 60)} minutos ${s % 60} segundos`);
        timerEl.classList.toggle('is-warning', s <= 60 && s > 10);
        timerEl.classList.toggle('is-danger', s <= 10);
        if (ms === 0 && state === 'playing') timeUp();
      };
      tick();
      timer = setInterval(tick, 250);
    }

    // ------------------------------------------------------ salir y cerrar
    root.querySelector('[data-action="abandon"]').addEventListener('click', async (e) => {
      const restore = busy(e.currentTarget, 'Saliendo…');
      state = 'done';
      clearInterval(timer);
      await api.attempts.abandon(session.attemptId).catch(() => {});
      restore();
      navigate(`/quiz/${session.quizId}`, { force: true });
    });

    // Navegar a otra vista de la app (Atrás, un enlace) también interrumpe el intento, previa confirmación
    setLeaveGuard(() => {
      if (state !== 'playing') return true;
      if (!window.confirm('Si sales, el intento quedará interrumpido y sin puntaje. ¿Salir?')) return false;
      state = 'done';
      api.attempts.abandon(session.attemptId).catch(() => {});
      return true;
    });

    // Si cierra o recarga la pestaña, el intento queda interrumpido (sendBeacon)
    const onPageHide = () => { if (state === 'playing') api.attempts.abandonBeacon(session.attemptId); };
    const onBeforeUnload = (e) => { if (state === 'playing') { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);

    renderQuestion();

    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  },
};
