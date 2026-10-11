/* catalogo.js — index.html: búsqueda, categorías, orden y paginación.
   API: GET /api/quizzes?q=&page=&limit= · GET /api/categories */
(async function () {
  'use strict';
  const { ui } = QT;
  const { api, me } = await QT.ready;

  const LIMIT = 6;
  const region = document.querySelector('[data-region="catalogo"]');
  const form = document.querySelector('[data-form="search"]');
  const input = document.getElementById('search-input');
  const sortSelect = document.getElementById('sort-select');
  const chips = document.querySelector('[data-list="categories"]');
  const itemsBox = region.querySelector('[data-list="items"]');
  const pagesBox = region.querySelector('[data-list="pages"]');

  // Estado de la búsqueda; vive en la URL para que se pueda compartir y usar el botón Atrás
  const state = { q: '', page: 1 };
  const readUrl = () => {
    const p = ui.params();
    state.q = p.get('q') || '';
    state.page = Math.max(1, parseInt(p.get('page'), 10) || 1);
  };
  const urlFor = (q, page) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (page > 1) p.set('page', page);
    const s = p.toString();
    return 'index.html' + (s ? '?' + s : '');
  };
  const go = (q, page = 1) => {
    state.q = q.trim();
    state.page = page;
    history.pushState(null, '', urlFor(state.q, state.page));
    search();
  };

  // Calificadores dentro del texto de búsqueda
  const qualifier = (key) => {
    const m = state.q.match(new RegExp(`(?:^|\\s)${key}:(\\S+)`, 'i'));
    return m ? m[1].toLowerCase() : '';
  };
  const withQualifier = (key, value) => {
    let q = state.q.replace(new RegExp(`(?:^|\\s)${key}:\\S+`, 'gi'), '').trim();
    if (value) q = `${q} ${key}:${value}`.trim();
    return q;
  };

  // ------------------------------------------------------------ categorías
  async function loadCategories() {
    try {
      const cats = await api.categories.list();
      ui.renderList(chips, cats);
      const all = document.createElement('a');
      all.className = 'chip';
      all.href = 'index.html';
      all.textContent = 'Todas';
      chips.prepend(all);
      [...chips.children].forEach((chip, i) => { chip.dataset.slug = i === 0 ? '' : cats[i - 1].slug; });
      markCategory();
    } catch (err) {
      // Los chips son un atajo: si fallan, la búsqueda sigue funcionando
      QT.log.warn('No se cargaron las categorías', err);
    }
  }
  function markCategory() {
    const current = qualifier('categoria');
    [...chips.children].forEach((chip) => {
      if (chip.dataset.slug !== undefined && chip.dataset.slug === current) chip.setAttribute('aria-current', 'true');
      else chip.removeAttribute('aria-current');
    });
  }

  // --------------------------------------------------------------- búsqueda
  async function search() {
    input.value = state.q;
    sortSelect.value = qualifier('sort') === 'populares' ? 'populares' : 'recientes';
    markCategory();
    ui.fill(region, { total: '…', ignored: [], totalPages: 1, session: !!me }); // limpia lo de la búsqueda anterior
    const result = await ui.load(region, () => api.quizzes.search({ q: state.q, page: state.page, limit: LIMIT }), {
      isEmpty: (r) => r.total === 0,
    });
    if (!result) return;
    ui.fill(region, { ...result, session: !!me });
    ui.renderList(itemsBox, result.items);
    renderPages(result);
  }

  function renderPages({ page, totalPages }) {
    pagesBox.replaceChildren();
    if (totalPages <= 1) return;
    const item = (p, label, { disabled = false, active = false, aria } = {}) => {
      const li = document.createElement('li');
      li.className = `page-item${disabled ? ' disabled' : ''}${active ? ' active' : ''}`;
      const a = document.createElement('a');
      a.className = 'page-link';
      a.href = urlFor(state.q, p);
      a.innerHTML = label;
      if (aria) a.setAttribute('aria-label', aria);
      if (active) a.setAttribute('aria-current', 'page');
      if (disabled) { a.setAttribute('aria-disabled', 'true'); a.tabIndex = -1; }
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (disabled || active) return;
        go(state.q, p);
        document.getElementById('results-title').scrollIntoView({ behavior: 'smooth' });
      });
      li.append(a);
      return li;
    };
    pagesBox.append(item(page - 1, '&laquo;', { disabled: page === 1, aria: 'Anterior' }));
    for (let p = 1; p <= totalPages; p++) pagesBox.append(item(p, String(p), { active: p === page }));
    pagesBox.append(item(page + 1, '&raquo;', { disabled: page === totalPages, aria: 'Siguiente' }));
  }

  // --------------------------------------------------------------- eventos
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    go(input.value);
  });
  chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip || chip.dataset.slug === undefined) return; // chips de ejemplo: navegan con su href
    e.preventDefault();
    go(withQualifier('categoria', chip.dataset.slug));
  });
  sortSelect.addEventListener('change', () => go(withQualifier('sort', sortSelect.value === 'populares' ? 'populares' : '')));
  window.addEventListener('popstate', () => { readUrl(); search(); });

  readUrl();
  // Las dos cargas son independientes: corren en paralelo
  await Promise.all([loadCategories(), search()]);
})();
