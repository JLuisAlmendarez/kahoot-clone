/* ============================================================================
   ui.js — Motor que llena las vistas usando los atributos data-* de GUIA.md.
     data-bind="campo"            textContent (fechas ISO se formatean solas;
                                  "campo|fecha" muestra solo la fecha)
     data-bind-markdown="campo"   Markdown → marked → DOMPurify → innerHTML
     data-href="quiz.html?id={quizId}"   también data-id y data-for
     data-bind-value="campo"      value de inputs y options
     data-show-if="expr"          muestra u oculta (hidden)
     data-type / data-class="expr ? 'a' : 'b'"
     data-list + data-template    listas a partir de un <template>
     data-region + data-state     loading | error | empty | content
   Las expresiones se evalúan con un intérprete pequeño (sin eval), así la
   página sigue funcionando con la CSP de helmet.
   ========================================================================== */
(function (global) {
  'use strict';
  const QT = global.QT;

  // ------------------------------------------------------------ utilidades
  const get = (obj, path) => {
    if (!path) return undefined;
    return path.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
  };
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  const fmtDateTime = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fmtDate = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtMonth = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });

  function format(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return fmtDateTime.format(value);
    if (typeof value === 'string' && ISO.test(value)) return fmtDateTime.format(new Date(value));
    if (Array.isArray(value)) return value.join(' ');
    return String(value);
  }

  /** Markdown seguro (RNF-05). Si las librerías no cargaron, muestra texto plano. */
  function markdown(text, { inline = false } = {}) {
    const src = String(text ?? '');
    if (global.marked && global.DOMPurify) {
      const html = inline ? global.marked.parseInline(src) : global.marked.parse(src, { breaks: true });
      return global.DOMPurify.sanitize(html);
    }
    return escapeHtml(src).replace(/\n/g, '<br>');
  }

  // --------------------------------------- intérprete de expresiones simple
  // Soporta: campo, !campo, a && b, a || b, a === 'x', a !== b, a < 3, cond ? 'x' : 'y'
  function literal(token, ctx) {
    const t = token.trim();
    if (/^'.*'$/.test(t) || /^".*"$/.test(t)) return t.slice(1, -1);
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t === 'null') return null;
    return get(ctx, t);
  }
  function evalTerm(term, ctx) {
    let t = term.trim();
    let negate = false;
    while (t.startsWith('!') && !t.startsWith('!==')) { negate = !negate; t = t.slice(1).trim(); }
    const m = t.match(/^(.+?)\s*(===|!==|<=|>=|<|>)\s*(.+)$/);
    let value;
    if (m) {
      const a = literal(m[1], ctx); const b = literal(m[3], ctx);
      value = { '===': a === b, '!==': a !== b, '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b }[m[2]];
    } else {
      value = literal(t, ctx);
      if (Array.isArray(value)) value = value.length > 0;
    }
    return negate ? !value : value;
  }
  function evaluate(expr, ctx) {
    const tern = expr.match(/^(.+?)\?(.+):(.+)$/);
    if (tern) return evaluate(tern[1], ctx) ? literal(tern[2], ctx) : literal(tern[3], ctx);
    const ors = expr.split('||');
    if (ors.length > 1) return ors.some((part) => !!evaluate(part, ctx));
    const ands = expr.split('&&');
    if (ands.length > 1) return ands.every((part) => !!evaluate(part, ctx));
    return evalTerm(expr, ctx);
  }
  const truthy = (expr, ctx) => !!evaluate(expr, ctx);

  /** Sustituye {campo} en una plantilla de texto. */
  const interpolate = (tpl, ctx) => tpl.replace(/\{([\w.]+)\}/g, (_, k) => encodeURIComponent(get(ctx, k) ?? ''));

  // ---------------------------------------------------------------- llenado
  const BIND_SELECTOR = '[data-bind],[data-bind-markdown],[data-href],[data-bind-value],[data-id],[data-for],[data-type],[data-class],[data-show-if]';

  /** ¿El elemento pertenece a otra lista o región dentro de scope? (entonces no se toca) */
  function crossesBoundary(el, scope) {
    let node = el.parentElement;
    while (node && node !== scope) {
      if (node.hasAttribute('data-list') || node.hasAttribute('data-region')) return true;
      node = node.parentElement;
    }
    return false;
  }

  function apply(el, ctx) {
    const d = el.dataset;
    if (d.bind !== undefined) {
      // "campo|fecha" muestra solo la fecha; sin sufijo, las fechas llevan hora
      const [path, filter] = d.bind.split('|');
      const value = get(ctx, path);
      el.textContent = filter === 'fecha' && value ? fmtDate.format(new Date(value)) : format(value);
    }
    if (d.bindMarkdown !== undefined) el.innerHTML = markdown(get(ctx, d.bindMarkdown), { inline: el.tagName === 'SPAN' || el.tagName === 'LEGEND' });
    if (d.href !== undefined) el.setAttribute('href', interpolate(d.href, ctx));
    if (d.bindValue !== undefined) el.value = get(ctx, d.bindValue) ?? '';
    if (d.id !== undefined) el.id = interpolate(d.id, ctx);
    if (d.for !== undefined) el.htmlFor = interpolate(d.for, ctx);
    if (d.type !== undefined) el.type = evaluate(d.type, ctx);
    if (d.class !== undefined) { const c = evaluate(d.class, ctx); if (c) el.classList.add(c); }
    if (d.showIf !== undefined) el.hidden = !truthy(d.showIf, ctx);
  }

  /** Llena scope (elemento o fragmento) con los datos de ctx. */
  function fill(scope, ctx) {
    if (!scope) return;
    if (scope.nodeType === 1 && scope.matches(BIND_SELECTOR)) apply(scope, ctx);
    scope.querySelectorAll(BIND_SELECTOR).forEach((el) => {
      if (!crossesBoundary(el, scope)) apply(el, ctx);
    });
  }

  /**
   * Pinta una lista clonando su <template>. Si un elemento trae un arreglo con
   * el mismo nombre que una sublista (data-list="tags"), también la pinta.
   * @param {Element} container elemento con data-list y data-template
   * @param {object[]} items
   * @param {{ parent?: object, append?: boolean, onItem?: Function }} opts
   */
  function renderList(container, items, { parent = {}, append = false, onItem } = {}) {
    if (!container) return [];
    const tpl = document.getElementById(container.dataset.template);
    if (!tpl) throw new Error(`No existe el <template id="${container.dataset.template}">`);
    const nodes = items.map((item, index) => {
      const ctx = { ...parent, ...item, $index: index };
      const frag = tpl.content.cloneNode(true);
      fill(frag, ctx);
      frag.querySelectorAll('[data-list][data-template]').forEach((sub) => {
        if (crossesBoundary(sub, frag)) return;
        const subItems = get(item, sub.dataset.list);
        if (Array.isArray(subItems)) renderList(sub, subItems, { parent: ctx });
      });
      const roots = [...frag.children];
      if (onItem) roots.forEach((r) => onItem(r, item, index));
      return frag;
    });
    if (append) container.append(...nodes); else container.replaceChildren(...nodes);
    return nodes;
  }

  /** Deja visible solo el bloque data-state indicado dentro de la región. */
  function setState(region, state) {
    if (!region) return;
    region.querySelectorAll('[data-state]').forEach((el) => {
      if (el.closest('[data-region]') === region) el.hidden = el.dataset.state !== state;
    });
    region.setAttribute('aria-busy', String(state === 'loading'));
  }

  /** Muestra el mensaje de un error en el bloque data-state="error". */
  function showError(region, err, onRetry) {
    setState(region, 'error');
    const box = [...region.querySelectorAll('[data-state="error"]')].find((el) => el.closest('[data-region]') === region);
    if (!box) return;
    const msg = box.querySelector('.text-muted-qt');
    if (msg && err && err.status && err.status < 500) msg.textContent = err.message;
    const btn = box.querySelector('[data-action="retry"]');
    if (btn) {
      btn.hidden = !onRetry;
      btn.onclick = onRetry || null;
    }
  }

  /** Ejecuta una carga con los estados loading → content/empty/error. */
  async function load(region, loader, { isEmpty = () => false, onError } = {}) {
    setState(region, 'loading');
    try {
      const data = await loader();
      setState(region, isEmpty(data) ? 'empty' : 'content');
      return data;
    } catch (err) {
      if (onError && onError(err) === true) return null;
      showError(region, err, () => load(region, loader, { isEmpty, onError }));
      return null;
    }
  }

  /** Pone un botón en "Guardando…" y devuelve la función que lo restaura. */
  function busy(btn, label = 'Guardando…') {
    if (!btn) return () => {};
    const html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>${escapeHtml(label)}`;
    return () => { btn.disabled = false; btn.innerHTML = html; };
  }

  // ------------------------------------------------------- toasts y avisos
  function toast(message, variant = 'dark') {
    let wrap = document.getElementById('qt-toasts');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'qt-toasts';
      wrap.className = 'toast-container position-fixed bottom-0 end-0 p-3';
      document.body.append(wrap);
    }
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${variant} border-0`;
    el.setAttribute('role', variant === 'danger' ? 'alert' : 'status');
    el.innerHTML = `<div class="d-flex"><div class="toast-body"></div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Cerrar"></button></div>`;
    el.querySelector('.toast-body').textContent = message;
    wrap.append(el);
    if (global.bootstrap) {
      el.addEventListener('hidden.bs.toast', () => el.remove());
      global.bootstrap.Toast.getOrCreateInstance(el, { delay: 4000 }).show();
    } else {
      el.classList.add('show');
      setTimeout(() => el.remove(), 4000);
    }
  }
  /** Mensaje que se muestra en la siguiente página (después de redirigir). */
  function flash(message, variant = 'success') {
    try { sessionStorage.setItem('qt-flash', JSON.stringify({ message, variant })); } catch (e) { /* sin storage */ }
  }
  function showFlash() {
    try {
      const f = JSON.parse(sessionStorage.getItem('qt-flash') || 'null');
      if (f) { sessionStorage.removeItem('qt-flash'); toast(f.message, f.variant); }
    } catch (e) { /* sin storage */ }
  }

  const modal = (id) => (global.bootstrap ? global.bootstrap.Modal.getOrCreateInstance(document.getElementById(id)) : null);
  const params = () => new URLSearchParams(global.location ? global.location.search : '');
  /** Página actual + query, para el parámetro ?next= */
  const here = () => (global.location ? global.location.pathname.split('/').pop() + global.location.search : '');
  /** Solo permite volver a páginas propias (evita redirecciones abiertas). */
  const safeNext = (next) => (next && /^[\w-]+\.html(\?[^#]*)?$/.test(next) ? next : 'index.html');

  QT.ui = {
    get, format, markdown, escapeHtml, evaluate, truthy, interpolate, fill, renderList, setState, showError, load, busy,
    toast, flash, showFlash, modal, params, here, safeNext, fmt: { date: fmtDate, dateTime: fmtDateTime, month: fmtMonth },
  };
})(typeof window !== 'undefined' ? window : globalThis);
