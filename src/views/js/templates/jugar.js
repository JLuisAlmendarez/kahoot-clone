/* Vistas de la pantalla de juego (ruta /jugar/:attemptId). Encabezado reducido, sin navbar. */
import { html, cls } from '../core/generate-html.js';
import { md } from '../core/ui.js';

export const playShell = (session) => html`
  <header class="bg-white border-bottom sticky-top">
    <div class="container py-2">
      <div class="play-shell d-flex align-items-center gap-2">
        <span class="brand-mark flex-shrink-0" aria-hidden="true"><i class="bi bi-patch-question-fill"></i></span>
        <p class="fw-semibold mb-0 text-truncate flex-grow-1">${session.quizTitle}</p>
        ${session.deadlineAt && html`<span class="timer" role="timer" aria-label="Tiempo restante"><i class="bi bi-stopwatch me-1" aria-hidden="true"></i><span data-slot="remaining">--:--</span></span>`}
        <button type="button" class="btn btn-sm btn-light" data-bs-toggle="modal" data-bs-target="#modal-salir">
          <i class="bi bi-x-lg" aria-hidden="true"></i><span class="d-none d-sm-inline ms-1">Salir</span><span class="visually-hidden d-sm-none">Salir del intento</span>
        </button>
      </div>
      <div class="play-shell mt-2">
        <div class="d-flex justify-content-between small text-muted-qt mb-1">
          <span id="progress-label">Pregunta <span data-slot="current">1</span> de ${session.questions.length}</span>
          <span>Respondidas: <span data-slot="answered">0</span></span>
        </div>
        <div class="progress" role="progressbar" aria-labelledby="progress-label" aria-valuemin="0" aria-valuemax="${session.questions.length}" aria-valuenow="0">
          <div class="progress-bar"></div>
        </div>
      </div>
    </div>
  </header>
  <main id="main" tabindex="-1" class="container py-4">
    <div class="play-shell">
      <form class="card" data-form="answer"></form>
      <p class="kbd-hint small text-muted-qt text-center mt-3 mb-0 d-none d-md-block">
        Teclado: <kbd>Tab</kbd> para moverte, <kbd>Espacio</kbd> para marcar, <kbd>Enter</kbd> para responder o avanzar
      </p>
    </div>
  </main>
  ${modals(session)}`;

const option = (o, q, feedback) => {
  const correct = feedback?.correctOptionIds.includes(o.optionId);
  const mine = feedback?.selected.includes(o.optionId);
  return html`
    <label class="${cls('option-item', feedback && 'is-locked', correct && 'is-correct', !correct && mine && 'is-wrong')}" for="opt-${o.optionId}">
      <input class="form-check-input" type="${q.multiple ? 'checkbox' : 'radio'}" name="selectedOptionIds" id="opt-${o.optionId}" value="${o.optionId}"
             ${mine && 'checked'} ${feedback && 'disabled'}>
      <span class="option-text markdown-body">${md(o.text, { inline: true })}</span>
      <span class="option-status">${correct ? html`<i class="bi bi-check-lg" aria-hidden="true"></i> Correcta`
        : mine ? html`<i class="bi bi-x-lg" aria-hidden="true"></i> Tu respuesta` : ''}</span>
    </label>`;
};

/** Una pregunta. feedback = null antes de responder; después, la respuesta de /answers + lo marcado. */
export const questionCard = (q, { feedback, isLast }) => html`
  <div class="card-body p-4">
    <div class="d-flex justify-content-between align-items-center mb-2">
      <span class="section-label">Pregunta ${q.position}</span>
      ${q.multiple && html`<span class="badge text-bg-warning">Varias respuestas</span>`}
    </div>
    <fieldset>
      <legend class="h5 fw-semibold mb-1">${md(q.text, { inline: true })}</legend>
      ${q.multiple && html`<p class="small text-muted-qt mb-3">Marca <strong>todas</strong> las correctas para obtener el punto.</p>`}
      <div class="option-list mt-3">${q.options.map((o) => option(o, q, feedback))}</div>
    </fieldset>
    ${feedback && html`
      <div class="alert mt-3 mb-0 alert-${feedback.isCorrect ? 'success' : 'danger'}" role="status">
        <p class="fw-semibold mb-1"><i class="bi bi-${feedback.isCorrect ? 'check-circle-fill' : 'x-circle-fill'} me-1" aria-hidden="true"></i>${feedback.isCorrect ? '¡Correcta!' : 'Incorrecta'}</p>
        ${(feedback.explanation || !feedback.isCorrect) && html`<div class="small markdown-body">${md(feedback.explanation || 'Revisa las opciones marcadas en verde.')}</div>`}
      </div>`}
    <div class="d-grid d-sm-flex justify-content-sm-end mt-4">
      ${!feedback
        ? html`<button type="submit" class="btn btn-primary btn-lg px-5" disabled>Responder</button>`
        : isLast
          ? html`<button type="submit" class="btn btn-primary btn-lg px-5" data-next>Ver resultados <i class="bi bi-flag ms-1" aria-hidden="true"></i></button>`
          : html`<button type="submit" class="btn btn-primary btn-lg px-5" data-next>Siguiente <i class="bi bi-arrow-right ms-1" aria-hidden="true"></i></button>`}
    </div>
  </div>`;

const modals = (session) => html`
  <div class="modal fade" id="modal-salir" tabindex="-1" aria-labelledby="modal-salir-title" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header border-0 pb-0">
          <h2 class="modal-title h5" id="modal-salir-title"><i class="bi bi-box-arrow-left me-2" aria-hidden="true"></i>¿Salir del intento?</h2>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body">
          <p class="mb-0">El intento quedará <strong>interrumpido</strong>, sin puntaje, y no podrás retomarlo. Podrás empezar uno nuevo cuando quieras.</p>
        </div>
        <div class="modal-footer border-0 pt-0">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Seguir jugando</button>
          <button type="button" class="btn btn-danger" data-action="abandon">Salir</button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal fade" id="modal-timeout" tabindex="-1" aria-labelledby="modal-timeout-title" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-body text-center p-4">
          <i class="bi bi-hourglass-bottom state-icon text-warning" aria-hidden="true"></i>
          <h2 id="modal-timeout-title" class="h5">Se acabó el tiempo</h2>
          <p class="text-muted-qt">Tu intento se calificó con las <span data-slot="timeout-answered">0</span> preguntas que alcanzaste a responder.</p>
          <a class="btn btn-primary" href="/resultado/${session.attemptId}">Ver resultados</a>
        </div>
      </div>
    </div>
  </div>`;
