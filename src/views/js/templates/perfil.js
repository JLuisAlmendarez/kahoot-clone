/* Vistas del perfil (ruta /perfil/creados | /perfil/participados). */
import { html, cls } from '../core/generate-html.js';
import { fmt } from '../core/ui.js';
import { emptyState } from './states.js';

export const profileHeader = (me, stats) => html`
  <section class="card mb-4" aria-labelledby="profile-name">
    <div class="card-body d-flex flex-column flex-sm-row align-items-sm-center gap-3">
      <span class="avatar avatar-lg" aria-hidden="true">${me.initials}</span>
      <div class="flex-grow-1">
        <h1 id="profile-name" class="h4 fw-bold mb-0">@${me.username}</h1>
        <p class="text-muted-qt small mb-0">Miembro desde ${fmt.month(me.createdAt)}</p>
      </div>
      <div class="d-flex gap-4 text-center">
        <div><strong class="d-block fs-5">${stats.created}</strong><span class="small text-muted-qt">creados</span></div>
        <div><strong class="d-block fs-5">${stats.played}</strong><span class="small text-muted-qt">participados</span></div>
        <div><strong class="d-block fs-5">${stats.attempts}</strong><span class="small text-muted-qt">intentos</span></div>
      </div>
    </div>
  </section>`;

const tab = (name, icon, label, active) => html`
  <li class="nav-item" role="presentation">
    <a class="${cls('nav-link', active && 'active')}" href="/perfil/${name}" role="tab" aria-selected="${String(active)}" ${active && html`aria-current="page"`}>
      <i class="bi bi-${icon} me-1" aria-hidden="true"></i><span class="d-none d-sm-inline">Quizzes </span>${label}
    </a>
  </li>`;

export const profileShell = (me, tabName) => html`
  <div data-slot="header">${profileHeader(me, { created: '…', played: '…', attempts: '…' })}</div>
  <ul class="nav nav-tabs nav-fill flex-nowrap mb-4" role="tablist">
    ${tab('creados', 'collection', 'Creados', tabName === 'creados')}
    ${tab('participados', 'clock-history', 'Participados', tabName === 'participados')}
  </ul>
  <div data-region="tab"></div>
  <div class="modal fade" id="modal-borrar" tabindex="-1" aria-labelledby="modal-borrar-title" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header border-0 pb-0">
          <h2 class="modal-title h5" id="modal-borrar-title"><i class="bi bi-trash3 me-2 text-danger" aria-hidden="true"></i>¿Borrar este quiz?</h2>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body">
          <p>«<span data-slot="delete-title"></span>» dejará de aparecer en el catálogo y nadie podrá jugarlo.</p>
          <p class="small text-muted-qt mb-0">También se borran sus versiones, intentos, likes y comentarios. <strong>Esta acción no se puede deshacer.</strong></p>
        </div>
        <div class="modal-footer border-0 pt-0">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" class="btn btn-danger" data-action="confirm-delete-quiz">Borrar quiz</button>
        </div>
      </div>
    </div>
  </div>`;

// ------------------------------------------------------------------ creados
const createdCard = (q) => html`
  <div class="col">
    <article class="card h-100">
      <div class="card-body d-flex flex-column">
        <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
          <span class="badge badge-cat">${q.category.name}</span>
          <span class="badge text-bg-light border">Versión ${q.version}</span>
        </div>
        <h3 class="h6 mb-1"><a class="link-body-emphasis text-decoration-none" href="/quiz/${q.quizId}">${q.title}</a></h3>
        <p class="small text-muted-qt mb-3">Actualizado el ${fmt.dateTime(q.updatedAt)}</p>
        <div class="d-flex flex-wrap gap-3 small mb-3">
          <span class="stat"><i class="bi bi-question-circle" aria-hidden="true"></i>${q.questionCount} preguntas</span>
          <span class="stat"><i class="bi bi-heart-fill text-danger" aria-hidden="true"></i>${q.likesCount} likes</span>
          <span class="stat"><i class="bi bi-play-circle" aria-hidden="true"></i>${q.playCount} intentos</span>
        </div>
        <div class="d-flex gap-2 mt-auto">
          <a class="btn btn-outline-primary btn-sm flex-fill" href="/editor/${q.quizId}"><i class="bi bi-pencil me-1" aria-hidden="true"></i>Editar</a>
          <button class="btn btn-outline-danger btn-sm flex-fill" type="button" data-action="delete-quiz" data-quiz-id="${q.quizId}" data-title="${q.title}"><i class="bi bi-trash3 me-1" aria-hidden="true"></i>Borrar</button>
        </div>
      </div>
    </article>
  </div>`;

export const createdList = (list) => (list.length === 0
  ? emptyState({
    icon: 'collection', title: 'Aún no creas quizzes', text: 'Arma uno con tus propias preguntas y compártelo con la comunidad.',
    action: html`<a class="btn btn-primary" href="/editor"><i class="bi bi-plus-lg me-1" aria-hidden="true"></i>Crear quiz</a>`,
  })
  : html`<div class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3">${list.map(createdCard)}</div>`);

// ------------------------------------------------------------- participados
const attemptRow = (a, quiz) => html`
  <div class="attempt-row">
    <span class="attempt-score">${a.status === 'completed' ? `${a.score}/${a.total}` : html`<span class="text-muted-qt">—</span>`}</span>
    ${a.status === 'completed' && !a.timedOut && html`<span class="badge bg-success-subtle text-success-emphasis">Completado</span>`}
    ${a.timedOut && html`<span class="badge bg-warning-subtle text-warning-emphasis"><i class="bi bi-hourglass-bottom me-1" aria-hidden="true"></i>Tiempo agotado</span>`}
    ${a.status === 'abandoned' && html`<span class="badge bg-secondary-subtle text-secondary-emphasis"><i class="bi bi-slash-circle me-1" aria-hidden="true"></i>Interrumpido</span>`}
    <span class="small text-muted-qt">${fmt.dateTime(a.startedAt)} · Versión ${a.version}</span>
    ${a.version < quiz.version && html`<span class="badge text-bg-light border"><i class="bi bi-layers me-1" aria-hidden="true"></i>Versión anterior</span>`}
    ${a.status === 'completed' && html`<a class="btn btn-sm btn-outline-primary ms-auto" href="/resultado/${a.attemptId}"><i class="bi bi-eye me-1" aria-hidden="true"></i>Ver revisión</a>`}
    ${a.status === 'abandoned' && html`<a class="btn btn-sm btn-outline-primary ms-auto" href="/quiz/${quiz.quizId}">Jugar de nuevo</a>`}
  </div>`;

const attemptGroup = (g) => html`
  <article class="card mb-3">
    <div class="card-header d-flex justify-content-between align-items-center gap-2 bg-white">
      <h3 class="h6 mb-0">
        <a class="link-body-emphasis text-decoration-none" href="/quiz/${g.quiz.quizId}">${g.quiz.title}</a>
      </h3>
      <span class="small text-muted-qt">${fmt.plural(g.attempts.length, 'intento', 'intentos')}</span>
    </div>
    <div class="card-body py-0">
      ${g.attempts.map((a) => attemptRow(a, g.quiz))}
    </div>
  </article>`;

export const playedShell = (playedQuizzes, selected) => html`
  <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
    <label for="filter-quiz" class="small text-muted-qt">Filtrar por quiz</label>
    <select id="filter-quiz" class="form-select form-select-sm w-auto">
      <option value="">Todos</option>
      ${playedQuizzes.map((q) => html`<option value="${q.quizId}" ${q.quizId === selected && 'selected'}>${q.title}</option>`)}
    </select>
  </div>
  <div data-region="groups"></div>`;

export const groupsList = (history) => (history.groups.length === 0
  ? emptyState({
    icon: 'clock-history', title: 'Todavía no juegas ningún quiz', text: 'Cuando termines uno, aquí verás tus puntajes y podrás revisar cada intento.',
    action: html`<a class="btn btn-primary" href="/"><i class="bi bi-compass me-1" aria-hidden="true"></i>Explorar quizzes</a>`,
  })
  : history.groups.map(attemptGroup));
