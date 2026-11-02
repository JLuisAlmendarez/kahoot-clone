/* Vistas del detalle de un quiz (ruta /quiz/:id): datos, acciones, versiones y foro. */
import { html, cls } from '../core/generate-html.js';
import { fmt, md } from '../core/ui.js';
import { skeletonRows, emptyState } from './states.js';

// ------------------------------------------------------------- columna lateral
export const aside = (quiz, me) => html`
  <div class="card sticky-aside">
    <div class="card-body">
      <ul class="stat-list mb-3">
        <li><strong>${quiz.questionCount}</strong><span>preguntas</span></li>
        ${quiz.timeLimit
          ? html`<li><strong>${quiz.timeLimit} min</strong><span>límite de tiempo</span></li>`
          : html`<li><strong>—</strong><span>sin límite de tiempo</span></li>`}
        <li><strong>${quiz.likesCount}</strong><span>likes</span></li>
        <li><strong>${quiz.playCount}</strong><span>intentos</span></li>
      </ul>
      ${me
        ? html`<button type="button" class="btn btn-primary btn-lg w-100 mb-2" data-action="play"><i class="bi bi-play-fill me-1" aria-hidden="true"></i>${quiz.completed ? 'Jugar de nuevo' : 'Jugar'}</button>`
        : html`<a class="btn btn-primary btn-lg w-100 mb-2" href="/acceso?modo=login&next=${encodeURIComponent(`/quiz/${quiz.quizId}`)}"><i class="bi bi-play-fill me-1" aria-hidden="true"></i>Jugar</a>`}
      <p class="small text-muted-qt text-center mb-3">
        ${quiz.timeLimit && 'El cronómetro empieza al pulsar Jugar. '}Si cierras la pestaña, el intento queda interrumpido.
      </p>
      <button class="btn btn-like w-100" type="button" aria-pressed="${String(quiz.likedByMe)}" aria-describedby="like-help" data-action="toggle-like" ${!quiz.canLike && 'disabled'}>
        <i class="bi bi-heart${quiz.likedByMe ? '-fill' : ''} me-1" aria-hidden="true"></i>${quiz.likedByMe ? 'Te gusta' : 'Me gusta'}
      </button>
      <p id="like-help" class="small text-muted-qt mt-2 mb-0">
        ${quiz.canLike ? '¿Te sirvió? Tu like ayuda a que más gente lo encuentre.'
          : !me ? 'Inicia sesión y completa el quiz para darle like.'
            : quiz.isOwner ? 'No puedes dar like a tu propio quiz.'
              : 'Completa el quiz para poder darle like.'}
      </p>
      ${quiz.canManage && html`
        <hr>
        <p class="small fw-semibold mb-2">${quiz.isOwner ? 'Eres el creador de este quiz' : html`<i class="bi bi-shield-lock me-1" aria-hidden="true"></i>Gestión como administrador`}</p>
        <div class="d-flex gap-2">
          <a class="btn btn-outline-primary flex-fill" href="/editor/${quiz.quizId}"><i class="bi bi-pencil me-1" aria-hidden="true"></i>Editar</a>
          <button class="btn btn-outline-danger flex-fill" type="button" data-bs-toggle="modal" data-bs-target="#modal-borrar"><i class="bi bi-trash3 me-1" aria-hidden="true"></i>Borrar</button>
        </div>`}
      <hr>
      <a class="btn btn-outline-primary w-100" href="#versiones"><i class="bi bi-layers me-1" aria-hidden="true"></i>Historial de versiones (${quiz.version})</a>
    </div>
  </div>`;

// ---------------------------------------------------------------- página
export const detail = (quiz, me) => html`
  <nav aria-label="Ruta de navegación">
    <ol class="breadcrumb small">
      <li class="breadcrumb-item"><a href="/">Explorar</a></li>
      <li class="breadcrumb-item"><a href="/?q=${encodeURIComponent(`categoria:${quiz.category.slug}`)}">${quiz.category.name}</a></li>
      <li class="breadcrumb-item active" aria-current="page">${quiz.title}</li>
    </ol>
  </nav>
  <div class="row g-4">
    <div class="col-lg-8">
      <article>
        <span class="badge badge-cat mb-2">${quiz.category.name}</span>
        <h1 class="h2 fw-bold">${quiz.title}</h1>
        <div class="quiz-meta mb-3">
          <span><i class="bi bi-person-circle me-1" aria-hidden="true"></i>por <a href="/?q=${encodeURIComponent(`autor:${quiz.owner.username}`)}">@${quiz.owner.username}</a></span>
          <span><i class="bi bi-calendar3 me-1" aria-hidden="true"></i><time datetime="${quiz.createdAt}">${fmt.date(quiz.createdAt)}</time></span>
          <span><i class="bi bi-layers me-1" aria-hidden="true"></i>Versión ${quiz.version}</span>
        </div>
        <p class="mb-3">${quiz.tags.map((t) => html`<a class="tag me-2" href="/?q=${encodeURIComponent(`etiqueta:${t.slug}`)}">#${t.name}</a>`)}</p>
        ${quiz.hasMultiple && html`
          <div class="alert alert-info d-flex gap-2 align-items-start small" role="note">
            <i class="bi bi-ui-checks mt-1" aria-hidden="true"></i>
            <div><strong>Varias respuestas.</strong> Algunas preguntas tienen más de una opción correcta: debes marcar todas para obtener el punto.</div>
          </div>`}
        ${quiz.description && html`<div class="card"><div class="card-body markdown-body">${md(quiz.description)}</div></div>`}
      </article>

      <section id="versiones" class="mt-4" aria-labelledby="versiones-title">
        <h2 id="versiones-title" class="h5 mb-1"><i class="bi bi-layers me-2" aria-hidden="true"></i>Historial de versiones</h2>
        <p class="small text-muted-qt mb-3">Cada edición del contenido genera un snapshot nuevo. Las versiones anteriores se conservan tal como estaban para revisar los intentos que se hicieron con ellas.</p>
        <div data-region="versions">${skeletonRows(2)}</div>
        <p class="small text-muted-qt mt-2 mb-0"><i class="bi bi-info-circle me-1" aria-hidden="true"></i>Cambiar solo el título, la descripción, la categoría o las etiquetas no crea una versión nueva.</p>
      </section>
    </div>
    <aside class="col-lg-4" aria-label="Acciones del quiz" data-region="aside">${aside(quiz, me)}</aside>
  </div>

  <section id="foro" class="mt-5" aria-labelledby="foro-title">
    <div class="row"><div class="col-lg-8" data-region="forum">${forumShell(quiz, { total: '…' })}</div></div>
  </section>

  ${modals(quiz)}`;

// ------------------------------------------------------------- versiones
const versionRow = (v) => html`
  <li class="list-group-item py-3">
    <div class="d-flex flex-wrap align-items-center gap-2">
      <strong>Versión ${v.version}</strong>
      ${v.isCurrent ? html`<span class="badge text-bg-primary">Vigente</span>` : html`<span class="badge text-bg-light border">${v.version === 1 ? 'Original' : 'Anterior'}</span>`}
      <span class="small text-muted-qt">${fmt.dateTime(v.createdAt)}</span>
      <button type="button" class="btn btn-sm btn-outline-primary ms-auto" data-action="open-version" data-version-id="${v.versionId}" aria-label="Ver snapshot de la versión ${v.version}">
        <i class="bi bi-eye me-1" aria-hidden="true"></i>Ver snapshot
      </button>
    </div>
    <p class="small mb-1 mt-2"><i class="bi bi-${v.version === 1 ? 'flag' : 'pencil'} me-1" aria-hidden="true"></i>${v.changeSummary}</p>
    <p class="small text-muted-qt mb-0">${v.questionCount} preguntas · ${v.timeLimitLabel} · ${fmt.plural(v.attemptCount, 'intento', 'intentos')} con esta versión</p>
  </li>`;

export const versionsList = (versions) => html`<div class="card"><ul class="list-group list-group-flush">${versions.map(versionRow)}</ul></div>`;

const snapshotQuestion = (q, first) => html`
  <article class="${cls('card mb-3', !first && q.change === 'modified' && 'border-warning', !first && q.change === 'new' && 'border-success')}">
    <div class="card-body">
      <div class="d-flex justify-content-between flex-wrap gap-2 mb-2">
        <span class="section-label">Pregunta ${q.position}</span>
        ${!first && q.change === 'modified' && html`<span class="badge bg-warning-subtle text-warning-emphasis"><i class="bi bi-pencil me-1" aria-hidden="true"></i>Modificada en esta versión</span>`}
        ${!first && q.change === 'new' && html`<span class="badge bg-success-subtle text-success-emphasis"><i class="bi bi-plus-circle me-1" aria-hidden="true"></i>Nueva en esta versión</span>`}
      </div>
      <div class="fw-semibold mb-3 markdown-body">${md(q.text)}</div>
      <ul class="list-unstyled mb-0">
        ${q.options.map((o) => html`
          <li class="${cls('review-opt', o.isCorrect && 'correct')}"><i class="bi bi-${q.multiple ? 'square' : 'circle'} text-muted-qt" aria-hidden="true"></i><span>${md(o.text, { inline: true })}</span>${o.isCorrect && html`<small class="ms-auto text-success fw-semibold">Correcta</small>`}</li>`)}
      </ul>
    </div>
  </article>`;

export const snapshotHeader = (s) => html`
  <div>
    <h2 class="modal-title h5" id="modal-version-title">${s.quiz.title} · Versión ${s.version}</h2>
    <div class="d-flex flex-wrap gap-2 mt-1">
      <span class="badge text-bg-light border">${fmt.dateTime(s.createdAt)}</span>
      <span class="badge text-bg-light border"><i class="bi bi-stopwatch me-1" aria-hidden="true"></i>${s.timeLimitLabel}</span>
      <span class="badge text-bg-light border">${s.questionCount} preguntas</span>
    </div>
  </div>
  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>`;

export const snapshotBody = (s) => html`
  ${!s.questions[0]?.options[0] || 'isCorrect' in s.questions[0].options[0] ? ''
    : html`<p class="small text-muted-qt"><i class="bi bi-eye-slash me-1" aria-hidden="true"></i>Las respuestas correctas solo las ve el creador.</p>`}
  ${s.questions.map((q) => snapshotQuestion(q, s.version === 1))}`;

// ------------------------------------------------------------------ foro
export const forumShell = (quiz, { total }) => html`
  <div class="d-flex align-items-center gap-2 mb-3">
    <h2 id="foro-title" class="h4 mb-0"><i class="bi bi-chat-square-text me-2" aria-hidden="true"></i>Foro</h2>
    <span class="badge rounded-pill text-bg-light border"><span data-slot="threads">${total}</span> hilos</span>
  </div>
  ${quiz.canComment ? html`
    <form class="mb-3" data-form="comment">
      <label class="visually-hidden" for="new-comment">Escribe un comentario</label>
      <textarea class="form-control" id="new-comment" name="body" rows="3" maxlength="1000" required
                placeholder="¿Tienes una duda sobre alguna pregunta? Escríbela aquí…" aria-describedby="new-comment-help"></textarea>
      <div class="d-flex justify-content-between align-items-center mt-2 gap-2">
        <small id="new-comment-help" class="text-muted-qt"><i class="bi bi-markdown me-1" aria-hidden="true"></i>Admite Markdown · <span data-slot="length">0</span>/1000</small>
        <button type="submit" class="btn btn-sm btn-primary">Publicar</button>
      </div>
    </form>` : html`
    <div class="alert alert-light border d-flex gap-2 align-items-center mb-3">
      <i class="bi bi-lock" aria-hidden="true"></i>
      <span>Completa el quiz para participar en el foro. Mientras tanto, puedes leer los comentarios.</span>
    </div>`}
  <div data-region="comments">${skeletonRows(3)}</div>`;

const author = (c) => html`
  <div class="small mb-1">
    ${c.deleted ? html`<span class="text-muted-qt">Usuario</span>` : html`<strong>@${c.author.username}</strong>`}
    ${c.isQuizOwner && html`<span class="badge text-bg-primary">Creador</span>`}
    <span class="text-muted-qt"> · <time datetime="${c.createdAt}">${fmt.dateTime(c.createdAt)}</time></span>
  </div>`;

export const reply = (r) => html`
  <article class="comment" data-comment-id="${r.commentId}">
    <div class="d-flex gap-2">
      <span class="avatar" aria-hidden="true">${r.author.initials}</span>
      <div class="flex-grow-1 min-w-0">
        ${author(r)}
        <div class="markdown-body">${md(r.body)}</div>
        ${r.isMine && html`<button type="button" class="btn-text text-danger mt-1" data-action="delete-comment"><i class="bi bi-trash3 me-1" aria-hidden="true"></i>Borrar</button>`}
      </div>
    </div>
  </article>`;

export const repliesToggle = (count, open) => html`<i class="bi bi-chevron-${open ? 'up' : 'down'} me-1" aria-hidden="true"></i>${open ? 'Ocultar' : 'Ver'} ${fmt.plural(count, 'respuesta', 'respuestas')}`;

export const comment = (c, { canComment }) => html`
  <article class="comment" data-comment-id="${c.commentId}" data-thread>
    <div class="d-flex gap-2">
      <span class="avatar" aria-hidden="true">${c.deleted ? html`<i class="bi bi-dash"></i>` : c.author.initials}</span>
      <div class="flex-grow-1 min-w-0">
        ${author(c)}
        ${c.deleted ? html`<p class="comment-deleted mb-1">[comentario eliminado]</p>` : html`<div class="markdown-body mb-1">${md(c.body)}</div>`}
        <div class="d-flex flex-wrap gap-3">
          ${canComment && !c.deleted && html`<button type="button" class="btn-text" data-action="reply"><i class="bi bi-reply me-1" aria-hidden="true"></i>Responder</button>`}
          ${c.isMine && html`<button type="button" class="btn-text text-danger" data-action="delete-comment"><i class="bi bi-trash3 me-1" aria-hidden="true"></i>Borrar</button>`}
          <button type="button" class="btn-text" data-action="toggle-replies" aria-expanded="false" ${!c.replyCount && 'hidden'}>${repliesToggle(c.replyCount, false)}</button>
        </div>
        <div data-slot="reply-form"></div>
        <div class="replies" data-slot="replies" hidden></div>
      </div>
    </div>
  </article>`;

export const replyForm = (commentId) => html`
  <form class="mt-2" data-form="reply">
    <label class="visually-hidden" for="reply-${commentId}">Escribe tu respuesta</label>
    <textarea class="form-control" id="reply-${commentId}" name="body" rows="2" maxlength="1000" placeholder="Escribe tu respuesta…" required></textarea>
    <div class="d-flex justify-content-end gap-2 mt-2">
      <button type="button" class="btn btn-sm btn-light" data-action="cancel-reply">Cancelar</button>
      <button type="submit" class="btn btn-sm btn-primary">Responder</button>
    </div>
  </form>`;

export const commentsList = (data, { canComment }) => (data.total === 0
  ? emptyState({ icon: 'chat-dots', title: 'Aún no hay comentarios', text: 'Cuando alguien comente, lo verás aquí.' })
  : html`
    <div class="card"><div class="card-body py-0" data-slot="items">${data.items.map((c) => comment(c, { canComment }))}</div></div>
    <div class="text-center mt-3" data-slot="more" ${data.page >= data.totalPages && 'hidden'}>
      <button type="button" class="btn btn-outline-primary btn-sm" data-action="load-more">Cargar más comentarios</button>
    </div>`);

// --------------------------------------------------------------- modales
const confirmModal = (id, icon, title, body, action, label) => html`
  <div class="modal fade" id="${id}" tabindex="-1" aria-labelledby="${id}-title" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header border-0 pb-0">
          <h2 class="modal-title h5" id="${id}-title"><i class="bi bi-${icon} me-2 text-danger" aria-hidden="true"></i>${title}</h2>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-footer border-0 pt-0">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" class="btn btn-danger" data-action="${action}">${label}</button>
        </div>
      </div>
    </div>
  </div>`;

const modals = (quiz) => html`
  <div class="modal fade" id="modal-version" tabindex="-1" aria-labelledby="modal-version-title" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable modal-fullscreen-sm-down">
      <div class="modal-content">
        <div class="modal-header" data-slot="version-header"><h2 class="modal-title h5" id="modal-version-title">Versión</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body bg-body-tertiary" data-region="version-detail"></div>
      </div>
    </div>
  </div>
  ${quiz.canManage && confirmModal('modal-borrar', 'trash3', '¿Borrar este quiz?', html`
    <p>«${quiz.title}» dejará de aparecer en el catálogo y nadie podrá jugarlo.</p>
    <p class="small text-muted-qt mb-0">También se borran sus versiones, intentos, likes y comentarios. <strong>Esta acción no se puede deshacer.</strong></p>`, 'confirm-delete-quiz', 'Borrar quiz')}
  ${confirmModal('modal-borrar-comentario', 'trash3', '¿Borrar tu comentario?', html`
    <p class="mb-0">Si tiene respuestas, se mostrará como «[comentario eliminado]» para conservar la conversación.</p>`, 'confirm-delete-comment', 'Borrar')}`;
