/* Estados comunes de una región: cargando, error y vacío. */
import { html } from '../core/generate-html.js';

export const spinner = () => html`
  <div aria-busy="true">
    <div class="state py-4"><div class="spinner-border text-primary" aria-hidden="true"></div></div>
    <span class="visually-hidden" role="status">Cargando…</span>
  </div>`;

/** Esqueleto de filas (listas, foro, versiones). */
export const skeletonRows = (n = 3) => html`
  <div aria-busy="true">
    ${Array.from({ length: n }, () => html`
      <div class="d-flex gap-3 py-3"><span class="skeleton skeleton-avatar flex-shrink-0"></span>
        <div class="flex-grow-1"><span class="skeleton skeleton-text w-25 mb-2"></span><span class="skeleton skeleton-text w-75"></span></div></div>`)}
    <span class="visually-hidden" role="status">Cargando…</span>
  </div>`;

/** Esqueleto de tarjetas (catálogo, perfil). */
export const skeletonCards = (n = 3) => html`
  <div aria-busy="true">
    <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3">
      ${Array.from({ length: n }, () => html`
        <div class="col"><div class="card h-100"><div class="card-body">
          <span class="skeleton skeleton-text w-25 mb-3"></span><span class="skeleton skeleton-title mb-2"></span>
          <span class="skeleton skeleton-text w-50 mb-4"></span><span class="skeleton skeleton-text w-75"></span>
        </div></div></div>`)}
    </div>
    <span class="visually-hidden" role="status">Cargando…</span>
  </div>`;

export const loadingState = spinner;

export const errorState = (message = 'No pudimos cargar esta sección. Revisa tu conexión e inténtalo de nuevo.') => html`
  <div class="state state-error" role="alert">
    <i class="bi bi-wifi-off state-icon" aria-hidden="true"></i>
    <p class="h5">Algo salió mal</p>
    <p class="text-muted-qt">${message}</p>
    <button type="button" class="btn btn-outline-primary" data-action="retry"><i class="bi bi-arrow-clockwise me-1" aria-hidden="true"></i>Reintentar</button>
  </div>`;

/** Estado vacío o «no encontrado». action = html opcional (un botón o enlace). */
export const emptyState = ({ icon = 'inbox', title, text = '', action = null }) => html`
  <div class="state">
    <i class="bi bi-${icon} state-icon" aria-hidden="true"></i>
    <p class="h5">${title}</p>
    ${text && html`<p class="text-muted-qt${action ? '' : ' mb-0'}">${text}</p>`}
    ${action}
  </div>`;
