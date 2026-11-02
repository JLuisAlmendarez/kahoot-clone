/* Vistas del catálogo (ruta /). Funciones puras: datos → HTML. */
import { html, cls } from '../core/generate-html.js';
import { emptyState } from './states.js';

export const tagChip = (t) => html`<span class="tag me-2">#${t.name}</span>`;

export const quizCard = (q) => html`
  <div class="col">
    <article class="card quiz-card h-100">
      <div class="card-body d-flex flex-column">
        <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
          <span class="badge badge-cat">${q.category.name}</span>
          <span class="small text-muted-qt text-nowrap">${q.timeLimit ? html`<i class="bi bi-stopwatch me-1" aria-hidden="true"></i>${q.timeLimit} min` : 'Sin límite'}</span>
        </div>
        <h3 class="h6 card-title mb-1"><a class="stretched-link" href="/quiz/${q.quizId}">${q.title}</a></h3>
        <p class="small text-muted-qt mb-2">por @${q.owner.username}</p>
        <p class="mb-3">${q.tags.map(tagChip)}</p>
        <div class="mt-auto d-flex flex-wrap gap-3 small">
          <span class="stat"><i class="bi bi-question-circle" aria-hidden="true"></i>${q.questionCount} preguntas</span>
          <span class="stat"><i class="bi bi-heart-fill text-danger" aria-hidden="true"></i>${q.likesCount}<span class="visually-hidden"> likes</span></span>
          <span class="stat"><i class="bi bi-play-circle" aria-hidden="true"></i>${q.playCount}<span class="visually-hidden"> intentos</span></span>
          ${q.hasMultiple && html`<span class="badge text-bg-light border">Varias respuestas</span>`}
        </div>
      </div>
    </article>
  </div>`;

/** Encabezado con la búsqueda, chips de categoría y orden. */
export const catalogShell = ({ q, sort }) => html`
  <section class="page-hero mb-4" aria-labelledby="hero-title">
    <h1 id="hero-title" class="h3 fw-bold mb-1">Aprende resolviendo quizzes</h1>
    <p class="mb-3 opacity-75">Certificaciones, matemáticas, química, programación y más, a tu ritmo.</p>
    <form role="search" class="d-flex flex-column flex-sm-row gap-2" data-form="search">
      <label for="search-input" class="visually-hidden">Buscar quizzes</label>
      <div class="input-group input-group-lg flex-grow-1">
        <span class="input-group-text bg-white border-0"><i class="bi bi-search" aria-hidden="true"></i></span>
        <input id="search-input" name="q" type="search" class="form-control" maxlength="200" autocomplete="off"
               placeholder="Busca por tema o usa filtros: categoria:quimica" value="${q}" aria-describedby="search-hint">
      </div>
      <button class="btn btn-light btn-lg fw-semibold" type="submit">Buscar</button>
    </form>
    <p id="search-hint" class="search-hint small mt-2 mb-0">
      Filtros: <code>categoria:quimica</code> <code>autor:luis_m</code> <code>etiqueta:aws</code>
      <code>preguntas:&gt;5</code> <code>sort:populares</code>
    </p>
  </section>

  <section aria-label="Filtros" class="mb-3">
    <div class="d-flex flex-column flex-md-row gap-3 align-items-md-center justify-content-between">
      <div class="chip-row" role="group" aria-label="Categorías" data-region="chips"></div>
      <div class="d-flex align-items-center gap-2 flex-shrink-0">
        <label for="sort-select" class="small text-muted-qt text-nowrap">Ordenar por</label>
        <select id="sort-select" class="form-select form-select-sm" data-action="sort">
          <option value="recientes" ${sort !== 'populares' && 'selected'}>Más recientes</option>
          <option value="populares" ${sort === 'populares' && 'selected'}>Más populares</option>
        </select>
      </div>
    </div>
  </section>

  <section aria-labelledby="results-title">
    <div class="d-flex justify-content-between align-items-baseline mb-2">
      <h2 id="results-title" class="h5 mb-0">Quizzes</h2>
      <span class="small text-muted-qt" aria-live="polite" data-slot="total"></span>
    </div>
    <div data-region="results"></div>
  </section>`;

export const categoryChips = (categories, current, urlFor) => html`
  <a class="chip" href="${urlFor('')}" data-slug="" ${current === '' && html`aria-current="true"`}>Todas</a>
  ${categories.map((c) => html`<a class="chip" href="${urlFor(c.slug)}" data-slug="${c.slug}" ${current === c.slug && html`aria-current="true"`}>${c.name}</a>`)}`;

const pageLink = (href, label, { disabled = false, active = false, aria } = {}) => html`
  <li class="${cls('page-item', disabled && 'disabled', active && 'active')}">
    <a class="page-link" href="${href}" ${aria && html`aria-label="${aria}"`} ${active && html`aria-current="page"`} ${disabled && html`aria-disabled="true" tabindex="-1"`}>${label}</a>
  </li>`;

export const pagination = ({ page, totalPages }, urlFor) => (totalPages <= 1 ? '' : html`
  <nav class="mt-4" aria-label="Paginación de resultados">
    <ul class="pagination justify-content-center">
      ${pageLink(urlFor(page - 1), '«', { disabled: page === 1, aria: 'Anterior' })}
      ${Array.from({ length: totalPages }, (_, i) => pageLink(urlFor(i + 1), String(i + 1), { active: i + 1 === page }))}
      ${pageLink(urlFor(page + 1), '»', { disabled: page === totalPages, aria: 'Siguiente' })}
    </ul>
  </nav>`);

export const results = (result, { me, urlFor }) => html`
  ${result.ignored.length > 0 && html`
    <div class="alert alert-warning py-2 small" role="status">
      <i class="bi bi-exclamation-triangle me-1" aria-hidden="true"></i>
      Se ignoró este filtro porque no se reconoce: <code>${result.ignored.join(' ')}</code>
    </div>`}
  ${result.total === 0
    ? emptyState({
      icon: 'search', title: 'No encontramos quizzes', text: 'Prueba con otras palabras o quita algún filtro.',
      action: me && html`<a class="btn btn-primary" href="/editor"><i class="bi bi-plus-lg me-1" aria-hidden="true"></i>Crear el primero</a>`,
    })
    : html`
      <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3">${result.items.map(quizCard)}</div>
      ${pagination(result, urlFor)}`}`;
