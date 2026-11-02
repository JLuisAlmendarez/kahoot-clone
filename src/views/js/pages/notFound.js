/* Página: ruta que no existe. */
import { html, render } from '../core/generate-html.js';
import { emptyState } from '../templates/states.js';

export default {
  title: 'Página no encontrada',
  mount({ outlet }) {
    render(outlet, html`<div class="py-5">${emptyState({
      icon: 'signpost-split', title: 'Esta página no existe',
      text: 'Puede que el enlace esté mal escrito o que la página se haya movido.',
      action: html`<a class="btn btn-primary" href="/"><i class="bi bi-compass me-1" aria-hidden="true"></i>Ir al catálogo</a>`,
    })}</div>`);
  },
};
