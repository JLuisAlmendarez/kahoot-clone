/* ============================================================================
   ui.js — Utilidades de interfaz compartidas por todas las vistas:
   Markdown seguro, formato de fechas, toasts, modales, botones ocupados y la
   carga de una región con sus estados (cargando / error / vacío / contenido).
   ========================================================================== */
import { raw, render, escapeHtml } from './generate-html.js';
import { loadingState, errorState } from '../templates/states.js';

// --------------------------------------------------------------- formato
const fmtDateTime = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtDate = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtMonth = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });

export const fmt = {
  dateTime: (iso) => (iso ? fmtDateTime.format(new Date(iso)) : ''),
  date: (iso) => (iso ? fmtDate.format(new Date(iso)) : ''),
  month: (iso) => (iso ? fmtMonth.format(new Date(iso)) : ''),
  plural: (n, one, many) => `${n} ${n === 1 ? one : many}`,
};

/**
 * Markdown → HTML seguro: marked convierte y DOMPurify limpia (quita <script>,
 * onerror=, javascript:…). Si las librerías no cargaron, muestra texto plano.
 */
export function md(text, { inline = false } = {}) {
  const src = String(text ?? '');
  if (window.marked && window.DOMPurify) {
    const out = inline ? window.marked.parseInline(src) : window.marked.parse(src, { breaks: true });
    return raw(window.DOMPurify.sanitize(out));
  }
  return raw(escapeHtml(src).replace(/\n/g, '<br>'));
}

// ---------------------------------------------------------------- toasts
export function toast(message, variant = 'dark') {
  const wrap = document.getElementById('qt-toasts');
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${variant} border-0`;
  el.setAttribute('role', variant === 'danger' ? 'alert' : 'status');
  el.innerHTML = '<div class="d-flex"><div class="toast-body"></div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Cerrar"></button></div>';
  el.querySelector('.toast-body').textContent = message;
  wrap.append(el);
  if (window.bootstrap) {
    el.addEventListener('hidden.bs.toast', () => el.remove());
    window.bootstrap.Toast.getOrCreateInstance(el, { delay: 4000 }).show();
  } else {
    el.classList.add('show');
    setTimeout(() => el.remove(), 4000);
  }
}

// --------------------------------------------------------------- modales
export const modal = (el) => (window.bootstrap && el ? window.bootstrap.Modal.getOrCreateInstance(el) : { show() {}, hide() {} });

/** Cierra cualquier modal abierto (al cambiar de vista no debe quedar el fondo oscuro). */
export function closeModals() {
  document.querySelectorAll('.modal.show').forEach((m) => window.bootstrap?.Modal.getInstance(m)?.hide());
  document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
}

// ----------------------------------------------------- botones y regiones
/** Pone un botón en "Guardando…" y devuelve la función que lo restaura. */
export function busy(btn, label = 'Guardando…') {
  if (!btn) return () => {};
  const previous = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>${escapeHtml(label)}`;
  return () => { btn.disabled = false; btn.innerHTML = previous; };
}

/**
 * Carga datos en una región mostrando sus estados:
 *   cargando → onData(data) pinta el contenido | error con botón Reintentar.
 * onError(err) puede pintar algo propio y regresar true (por ejemplo, un 404).
 */
export async function loadRegion(region, loader, options = {}) {
  const { loading = loadingState(), errorText, onError, onData } = options;
  render(region, loading);
  region.setAttribute('aria-busy', 'true');
  try {
    const data = await loader();
    region.removeAttribute('aria-busy');
    if (onData) await onData(data);
    return data;
  } catch (err) {
    region.removeAttribute('aria-busy');
    if (!err.status && err.status !== 0) console.error('[Quiztopia]', err); // error de programación, no de la API
    if (onError && onError(err) === true) return null;
    const message = err.status && err.status < 500 ? err.message : errorText;
    render(region, errorState(message));
    region.querySelector('[data-action="retry"]')?.addEventListener('click', () => loadRegion(region, loader, options));
    return null;
  }
}

/** Marca un campo como inválido con el mensaje del servidor. */
export function fieldError(form, name, message) {
  const input = form.elements[name];
  if (!input) return false;
  input.setCustomValidity(message);
  const feedback = input.closest('.mb-3, .mb-4')?.querySelector('.invalid-feedback');
  if (feedback) feedback.textContent = message;
  input.classList.add('is-invalid');
  input.addEventListener('input', () => { input.setCustomValidity(''); input.classList.remove('is-invalid'); }, { once: true });
  return true;
}
