/* Página: catálogo, búsqueda y clasificación (ruta /?q=&page=).
   API: GET /api/quizzes · GET /api/categories */
import { render } from '../core/generate-html.js';
import { api } from '../core/api.js';
import { loadRegion } from '../core/ui.js';
import { skeletonCards } from '../templates/states.js';
import * as view from '../templates/catalogo.js';

const LIMIT = 6;

/** Lee un calificador del texto de búsqueda: qualifier('sort:populares x', 'sort') → 'populares' */
const qualifier = (q, key) => (q.match(new RegExp(`(?:^|\\s)${key}:(\\S+)`, 'i'))?.[1] || '').toLowerCase();
/** Agrega o reemplaza un calificador. */
const withQualifier = (q, key, value) => {
  const base = q.replace(new RegExp(`(?:^|\\s)${key}:\\S+`, 'gi'), '').trim();
  return value ? `${base} ${key}:${value}`.trim() : base;
};
const urlFor = (q, page = 1) => {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (page > 1) p.set('page', page);
  const s = p.toString();
  return `/${s ? `?${s}` : ''}`;
};

export default {
  title: 'Explorar quizzes',
  async mount({ outlet, query, me, navigate }) {
    const q = (query.get('q') || '').trim();
    const page = Math.max(1, parseInt(query.get('page'), 10) || 1);
    const category = qualifier(q, 'categoria');
    const sort = qualifier(q, 'sort');

    render(outlet, view.catalogShell({ q, sort }));
    const chips = outlet.querySelector('[data-region="chips"]');
    const resultsRegion = outlet.querySelector('[data-region="results"]');
    const totalSlot = outlet.querySelector('[data-slot="total"]');

    // La búsqueda vive en la URL: se puede compartir y el botón Atrás funciona
    const go = (nextQ, nextPage = 1) => navigate(urlFor(nextQ.trim(), nextPage));

    outlet.querySelector('[data-form="search"]').addEventListener('submit', (e) => {
      e.preventDefault();
      go(e.currentTarget.q.value);
    });
    outlet.querySelector('#sort-select').addEventListener('change', (e) => {
      go(withQualifier(q, 'sort', e.target.value === 'populares' ? 'populares' : ''));
    });

    // Categorías y resultados son independientes: se cargan en paralelo
    const loadChips = api.categories.list()
      .then((cats) => render(chips, view.categoryChips(cats, category, (slug) => urlFor(withQualifier(q, 'categoria', slug)))))
      .catch(() => {}); // los chips son un atajo; si fallan, la búsqueda sigue funcionando

    const loadResults = loadRegion(resultsRegion, () => api.quizzes.search({ q, page, limit: LIMIT }), {
      loading: skeletonCards(3),
      errorText: 'No pudimos cargar los quizzes. Revisa tu conexión e inténtalo de nuevo.',
      onData: (result) => {
        totalSlot.textContent = `${result.total} ${result.total === 1 ? 'resultado' : 'resultados'}`;
        render(resultsRegion, view.results(result, { me, urlFor: (p) => urlFor(q, p) }));
      },
    });

    await Promise.all([loadChips, loadResults]);
  },
};
