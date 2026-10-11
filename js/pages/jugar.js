/* jugar.js — jugar.html?attempt={attemptId}: una pregunta a la vez con cronómetro.
   API: GET /api/attempts/:id/play · POST /api/attempts/:id/answers · POST /api/attempts/:id/finish
        POST /api/attempts/:id/abandon (botón Salir) · sendBeacon al cerrar la pestaña */
(async function () {
  'use strict';
  const { ui } = QT;
  const { api, me } = await QT.ready;

  const attemptId = ui.params().get('attempt');
  if (!me) { location.replace(`acceso.html?modo=login&next=${encodeURIComponent(ui.here())}`); return; }

  const header = document.querySelector('body > header');
  const region = document.querySelector('[data-region="play"]');
  const form = region.querySelector('[data-form="answer"]');
  const optionsBox = form.querySelector('[data-list="options"]');
  const feedbackBox = form.querySelector('[data-show-if="feedback"]');
  const submitBtn = form.querySelector('[type="submit"]');
  const timerEl = header.querySelector('.timer');
  const progress = header.querySelector('.progress');

  let session = null;
  let index = 0;
  let answered = 0;
  let feedback = null;
  let leaving = false;   // true cuando salimos por un botón (no hay que avisar ni interrumpir)
  let finishing = false; // evita terminar dos veces (botón y cronómetro al mismo tiempo)
  let timer = null;
  const question = () => session.questions[index];
  const isLast = () => index === session.questions.length - 1;

  // ------------------------------------------------------------- carga
  session = await ui.load(region, () => api.attempts.play(attemptId || ''), {
    onError: (err) => {
      if (err.status === 409) err.message = 'Este intento ya terminó o quedó interrumpido. Puedes iniciar uno nuevo desde el quiz.';
      return false;
    },
  });
  if (!session) return;
  document.title = `Jugando: ${session.quizTitle} · Quiztopia`;
  answered = session.answeredQuestionIds.length;
  index = Math.max(0, session.questions.findIndex((q) => !session.answeredQuestionIds.includes(q.questionId)));
  document.querySelector('[data-action="abandon"]').href = `quiz.html?id=${session.quizId}`;
  render();
  startTimer();

  // ----------------------------------------------------------- pintar

  function renderHeader() {
    const total = session.questions.length;
    ui.fill(header, { quiz: { title: session.quizTitle }, deadlineAt: session.deadlineAt, current: index + 1, total, answered });
    progress.setAttribute('aria-valuemax', total);
    progress.setAttribute('aria-valuenow', answered);
    const bar = progress.querySelector('.progress-bar');
    bar.classList.remove('w-25');
    bar.style.width = `${Math.round((answered / total) * 100)}%`;
  }

  function render() {
    const q = question();
    feedback = null;
    renderHeader();
    ui.fill(form, { ...q, feedback: null, isLast: isLast() });
    feedbackBox.className = 'alert mt-3 mb-0';
    ui.renderList(optionsBox, q.options, { parent: { multiple: q.multiple } });
    submitBtn.disabled = true;
    optionsBox.querySelector('input')?.focus();
  }

  /** Pinta el resultado de la respuesta sobre las opciones. */
  function showFeedback(res, selected) {
    feedback = {
      title: res.isCorrect ? '¡Correcta!' : 'Incorrecta',
      explanation: res.explanation || (res.isCorrect ? '' : 'Revisa las opciones marcadas en verde.'),
    };
    optionsBox.querySelectorAll('.option-item').forEach((label) => {
      const input = label.querySelector('input');
      const status = label.querySelector('[data-slot="status"]');
      const correct = res.correctOptionIds.includes(input.value);
      const mine = selected.includes(input.value);
      input.disabled = true;
      label.classList.add('is-locked');
      if (correct) { label.classList.add('is-correct'); status.innerHTML = '<i class="bi bi-check-lg" aria-hidden="true"></i> Correcta'; }
      else if (mine) { label.classList.add('is-wrong'); status.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i> Tu respuesta'; }
    });
    ui.fill(form, { ...question(), feedback, isLast: isLast() });
    feedbackBox.className = `alert mt-3 mb-0 alert-${res.isCorrect ? 'success' : 'danger'}`;
    feedbackBox.querySelector('p').innerHTML = `<i class="bi bi-${res.isCorrect ? 'check-circle-fill' : 'x-circle-fill'} me-1" aria-hidden="true"></i>${feedback.title}`;
    answered = res.answered;
    renderHeader();
    form.querySelector(isLast() ? '[data-action="finish"]' : '[data-action="next"]').focus();
  }

  // ---------------------------------------------------------- eventos
  optionsBox.addEventListener('change', () => {
    submitBtn.disabled = !optionsBox.querySelector('input:checked');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (feedback) { if (isLast()) finish(); else next(); return; } // Enter después del feedback avanza
    const selected = [...optionsBox.querySelectorAll('input:checked')].map((i) => i.value);
    if (!selected.length) return;
    const restore = ui.busy(submitBtn, 'Calificando…');
    try {
      const res = await api.attempts.answer(session.attemptId, { questionId: question().questionId, selectedOptionIds: selected });
      restore();
      submitBtn.disabled = true;
      showFeedback(res, selected);
    } catch (err) {
      restore();
      if (err.code === 'TIME_UP') return timeUp();
      if (err.code === 'ALREADY_ANSWERED') return next();
      ui.toast(err.message, 'danger');
    }
  });

  function next() {
    if (isLast()) return finish();
    index += 1;
    render();
  }
  form.querySelector('[data-action="next"]').addEventListener('click', () => next());
  form.querySelector('[data-action="finish"]').addEventListener('click', () => finish());

  async function finish(reason = null) {
    if (finishing) return;
    finishing = true;
    clearInterval(timer);
    try {
      await api.attempts.finish(session.attemptId, { reason });
    } catch (err) {
      if (err.code !== 'ATTEMPT_CLOSED') { finishing = false; ui.toast(err.message, 'danger'); return; }
    }
    if (reason === 'timeout') return;
    leaving = true;
    location.href = `resultado.html?attempt=${session.attemptId}`;
  }

  // --------------------------------------------------------- cronómetro
  function startTimer() {
    if (!session.deadlineAt) return;
    const deadline = new Date(session.deadlineAt).getTime();
    const tick = () => {
      const ms = Math.max(0, deadline - Date.now());
      const s = Math.ceil(ms / 1000);
      const label = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      timerEl.querySelector('[data-bind="remaining"]').textContent = label;
      timerEl.setAttribute('aria-label', `Tiempo restante: ${Math.floor(s / 60)} minutos ${s % 60} segundos`);
      timerEl.classList.toggle('is-warning', s <= 60 && s > 10);
      timerEl.classList.toggle('is-danger', s <= 10);
      if (ms === 0) timeUp();
    };
    tick();
    timer = setInterval(tick, 250);
  }

  async function timeUp() {
    clearInterval(timer);
    await finish('timeout');
    leaving = true;
    const modalEl = document.getElementById('modal-timeout');
    ui.fill(modalEl, { answered, attemptId: session.attemptId });
    ui.modal('modal-timeout').show();
  }

  // ------------------------------------------------------ salir y cerrar
  document.querySelector('[data-action="abandon"]').addEventListener('click', async (e) => {
    e.preventDefault();
    leaving = true;
    clearInterval(timer);
    try { await api.attempts.abandon(session.attemptId); } catch (err) { /* ya estaba cerrado */ }
    location.href = e.currentTarget.href;
  });

  // Si cierra o recarga la pestaña, el intento queda interrumpido (sendBeacon)
  window.addEventListener('pagehide', () => {
    if (!leaving && !finishing) api.attempts.abandonBeacon(session.attemptId);
  });
  window.addEventListener('beforeunload', (e) => {
    if (!leaving && !finishing) { e.preventDefault(); e.returnValue = ''; }
  });
})();
