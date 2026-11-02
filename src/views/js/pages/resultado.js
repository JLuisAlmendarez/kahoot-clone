/* Página: puntaje y revisión del snapshot jugado (ruta /resultado/:attemptId).
   API: GET /api/attempts/:id */
import { html, render } from '../core/generate-html.js';
import { api } from '../core/api.js';
import { loadRegion } from '../core/ui.js';
import { emptyState } from '../templates/states.js';
import { resultView, scoreColor } from '../templates/resultado.js';

export default {
  title: 'Resultados',
  auth: true,
  async mount({ outlet, params }) {
    await loadRegion(outlet, () => api.attempts.review(params.attemptId), {
      errorText: 'No pudimos cargar el intento.',
      onError: (err) => {
        const states = {
          404: { icon: 'archive', title: 'Este intento ya no está disponible', text: 'El quiz se borró y sus intentos se eliminaron con él.' },
          403: { icon: 'shield-lock', title: 'Este intento es de otra persona', text: 'Solo puedes ver la revisión de tus propios intentos.' },
          409: { icon: 'slash-circle', title: err.code === 'ATTEMPT_OPEN' ? 'Este intento sigue en curso' : 'Este intento quedó interrumpido', text: err.message },
        };
        const s = states[err.status];
        if (!s) return false;
        render(outlet, html`<div class="py-4">${emptyState({ ...s, action: html`<a class="btn btn-primary" href="/perfil/participados">Ir a mi historial</a>` })}</div>`);
        return true;
      },
      onData: (review) => {
        document.title = `Resultados: ${review.quiz.title} · Quiztopia`;
        render(outlet, resultView(review));
        // El anillo de puntaje se dibuja con variables CSS (se ponen por JS: la CSP no permite style="" en el HTML)
        const ring = outlet.querySelector('.score-ring');
        ring.style.setProperty('--p', review.percentage);
        ring.style.setProperty('--c', scoreColor(review.percentage));
      },
    });
  },
};
