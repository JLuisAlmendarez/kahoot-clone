/* resultado.js — resultado.html?attempt={attemptId}: puntaje y revisión del snapshot jugado.
   API: GET /api/attempts/:id */
(async function () {
  'use strict';
  const { ui } = QT;
  const { api, me } = await QT.ready;

  const attemptId = ui.params().get('attempt') || 'a-aws-1';
  if (!me) { location.replace(`acceso.html?modo=login&next=${encodeURIComponent(ui.here())}`); return; }

  const region = document.querySelector('[data-region="attempt"]');
  const review = await ui.load(region, () => api.attempts.review(attemptId), {
    onError: (err) => {
      if (err.status === 404) { ui.setState(region, 'empty'); return true; }
      return false;
    },
  });
  if (!review) return;

  const pct = review.percentage;
  const color = pct >= 70 ? '#15803d' : pct >= 40 ? '#b45309' : '#b91c1c';
  const scoreTitle = pct >= 70 ? '¡Buen trabajo!' : pct >= 40 ? 'Buen intento' : 'Sigue practicando';
  ui.fill(region, { ...review, scoreTitle, session: true });

  const ring = region.querySelector('.score-ring');
  ring.style.setProperty('--p', pct);
  ring.style.setProperty('--c', color);
  ring.setAttribute('aria-label', `${review.score} de ${review.total} correctas, ${pct} por ciento`);
  document.title = `Resultados: ${review.quiz.title} · Quiztopia`;

  ui.renderList(region.querySelector('[data-list="questions"]'), review.questions, {
    onItem: (card, q) => {
      card.querySelectorAll('.review-opt').forEach((row, i) => {
        const o = q.options[i];
        const shape = q.multiple ? 'square' : 'circle';
        const icon = row.querySelector('[data-slot="icon"]');
        const note = row.querySelector('[data-bind="note"]');
        let cls = '';
        let iconCls = `bi-${shape} text-muted-qt`;
        let text = '';
        if (o.isCorrect && o.selected) { cls = 'correct'; iconCls = `bi-check-${shape}-fill text-success`; text = 'Tu respuesta · Correcta'; }
        else if (o.isCorrect) { cls = 'correct'; iconCls = `bi-${shape} text-success`; text = q.status === 'unanswered' ? 'Correcta' : 'Correcta · no la marcaste'; }
        else if (o.selected) { cls = 'wrong'; iconCls = `bi-x-${shape}-fill text-danger`; text = 'Tu respuesta'; }
        if (cls) row.classList.add(cls);
        icon.className = `bi ${iconCls}`;
        note.textContent = text;
        note.className = `fw-semibold ${o.isCorrect ? 'text-success' : 'text-danger'}`;
      });
      if (q.status === 'unanswered' && review.timedOut) {
        const p = document.createElement('p');
        p.className = 'small text-muted-qt mt-3 mb-0';
        p.textContent = 'Se acabó el tiempo antes de responder esta pregunta.';
        card.querySelector('.card-body').append(p);
      }
    },
  });
})();
