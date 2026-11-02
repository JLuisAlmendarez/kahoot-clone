/* Vistas de resultados y revisión de un intento (ruta /resultado/:attemptId). */
import { html, cls } from '../core/generate-html.js';
import { fmt, md } from '../core/ui.js';

const reviewOption = (o, q, timedOut) => {
  const shape = q.multiple ? 'square' : 'circle';
  let icon = `bi-${shape} text-muted-qt`;
  let note = '';
  if (o.isCorrect && o.selected) { icon = `bi-check-${shape}-fill text-success`; note = 'Tu respuesta · Correcta'; }
  else if (o.isCorrect) { icon = `bi-${shape} text-success`; note = q.status === 'unanswered' ? 'Correcta' : 'Correcta · no la marcaste'; }
  else if (o.selected) { icon = `bi-x-${shape}-fill text-danger`; note = 'Tu respuesta'; }
  return html`
    <div class="${cls('review-opt', o.isCorrect && 'correct', !o.isCorrect && o.selected && 'wrong')}">
      <i class="bi ${icon}" aria-hidden="true"></i>
      <div class="flex-grow-1">
        <div class="markdown-body">${md(o.text)}</div>
        ${note && html`<small class="fw-semibold ${o.isCorrect ? 'text-success' : 'text-danger'}">${note}</small>`}
      </div>
    </div>`;
};

const STATUS = {
  correct: html`<span class="badge bg-success-subtle text-success-emphasis"><i class="bi bi-check-circle-fill me-1" aria-hidden="true"></i>Correcta</span>`,
  wrong: html`<span class="badge bg-danger-subtle text-danger-emphasis"><i class="bi bi-x-circle-fill me-1" aria-hidden="true"></i>Incorrecta</span>`,
  unanswered: html`<span class="badge bg-secondary-subtle text-secondary-emphasis"><i class="bi bi-dash-circle me-1" aria-hidden="true"></i>Sin responder</span>`,
};

const reviewQuestion = (q, timedOut) => html`
  <article class="${cls('card review-q mb-3', q.status === 'correct' ? 'ok' : 'bad')}">
    <div class="card-body">
      <div class="d-flex justify-content-between gap-2 mb-2">
        <span class="section-label">Pregunta ${q.position}${q.multiple && ' · Varias respuestas'}</span>
        ${STATUS[q.status]}
      </div>
      <div class="markdown-body fw-semibold mb-3">${md(q.text)}</div>
      ${q.options.map((o) => reviewOption(o, q, timedOut))}
      ${q.explanation && html`<div class="alert alert-light border small mt-3 mb-0"><i class="bi bi-lightbulb me-1" aria-hidden="true"></i><strong>Explicación:</strong> <span class="markdown-body">${md(q.explanation, { inline: true })}</span></div>`}
      ${q.status === 'unanswered' && timedOut && html`<p class="small text-muted-qt mt-3 mb-0">Se acabó el tiempo antes de responder esta pregunta.</p>`}
    </div>
  </article>`;

export const scoreTitle = (pct) => (pct >= 70 ? '¡Buen trabajo!' : pct >= 40 ? 'Buen intento' : 'Sigue practicando');
export const scoreColor = (pct) => (pct >= 70 ? '#15803d' : pct >= 40 ? '#b45309' : '#b91c1c');

export const resultView = (r) => html`
  <div class="play-shell">
    <nav aria-label="Ruta de navegación">
      <ol class="breadcrumb small">
        <li class="breadcrumb-item"><a href="/perfil/participados">Quizzes participados</a></li>
        <li class="breadcrumb-item active" aria-current="page">Intento del ${fmt.date(r.startedAt)}</li>
      </ol>
    </nav>
    <section class="card mb-4" aria-labelledby="score-title">
      <div class="card-body p-4 text-center">
        <h1 id="score-title" class="h4 fw-bold mb-1">${scoreTitle(r.percentage)}</h1>
        <p class="text-muted-qt mb-4">${r.quiz.title}</p>
        <div class="score-ring mx-auto mb-3" role="img" aria-label="${r.score} de ${r.total} correctas, ${r.percentage} por ciento">
          <div><strong>${r.score}/${r.total}</strong><span class="small text-muted-qt">${r.percentage} %</span></div>
        </div>
        <div class="d-flex flex-wrap justify-content-center gap-2 mb-4">
          <span class="badge text-bg-light border"><i class="bi bi-layers me-1" aria-hidden="true"></i>Versión ${r.version}</span>
          <span class="badge text-bg-light border"><i class="bi bi-calendar3 me-1" aria-hidden="true"></i>${fmt.dateTime(r.startedAt)}</span>
          <span class="badge text-bg-light border"><i class="bi bi-clock me-1" aria-hidden="true"></i>${r.durationLabel}</span>
          ${r.timedOut && html`<span class="badge text-bg-warning"><i class="bi bi-hourglass-bottom me-1" aria-hidden="true"></i>Tiempo agotado</span>`}
        </div>
        <div class="d-flex flex-column flex-sm-row justify-content-center gap-2">
          <a class="btn btn-primary" href="/quiz/${r.quiz.quizId}"><i class="bi bi-arrow-repeat me-1" aria-hidden="true"></i>Jugar de nuevo</a>
          <a class="btn btn-outline-primary" href="/quiz/${r.quiz.quizId}#foro"><i class="bi bi-chat-square-text me-1" aria-hidden="true"></i>Ir al foro</a>
          <a class="btn btn-light" href="/perfil/participados"><i class="bi bi-clock-history me-1" aria-hidden="true"></i>Mi historial</a>
        </div>
      </div>
    </section>
    <section aria-labelledby="review-title">
      <h2 id="review-title" class="h5 mb-3">Revisión</h2>
      <div class="alert alert-primary d-flex gap-2 small" role="note">
        <i class="bi bi-camera mt-1" aria-hidden="true"></i>
        <div>${r.isCurrentVersion
          ? html`Revisas la <strong>versión ${r.version}</strong>, que sigue siendo la vigente.`
          : html`Revisas el <strong>snapshot de la versión ${r.version}</strong>, tal como la jugaste. El quiz ya va en la versión ${r.quiz.version}, pero tu puntaje no cambia.`}</div>
      </div>
      ${r.questions.map((q) => reviewQuestion(q, r.timedOut))}
    </section>
  </div>`;
