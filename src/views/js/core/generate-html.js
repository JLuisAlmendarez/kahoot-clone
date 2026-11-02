/* ============================================================================
   generate-html.js — Cómo se generan las vistas de la SPA.

   Cada vista es una función que recibe datos y regresa HTML usando la
   plantilla etiquetada html`...`:

       const card = (quiz) => html`<h3>${quiz.title}</h3>`;
       render(document.querySelector('#app'), card(quiz));

   Todo lo que se interpola con ${...} se ESCAPA automáticamente (&, <, >, ", '),
   así un título como <script>alert(1)</script> se muestra como texto y no se
   ejecuta. Para insertar HTML que ya es seguro (otra vista, o Markdown que
   pasó por DOMPurify) se usa raw() o se interpola el resultado de html``.

   Reglas de interpolación:
     - string / number   → se escapa
     - html`...` o raw() → se inserta tal cual
     - arreglo           → se interpola cada elemento y se unen (para listas)
     - null, undefined, false → no pinta nada (para condiciones: ${ok && html`…`})
   ========================================================================== */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** HTML marcado como seguro: no se vuelve a escapar al interpolarlo. */
export class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

/** Marca un string como HTML seguro. Úsalo solo con HTML que tú generaste o que ya se sanitizó. */
export const raw = (value) => new SafeHtml(String(value ?? ''));

function toHtml(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(toHtml).join('');
  return escapeHtml(value);
}

/** Plantilla etiquetada: html`<p>${texto}</p>` → SafeHtml con los valores escapados. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += toHtml(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Pinta una vista dentro de un elemento (reemplaza su contenido). */
export function render(target, view) {
  if (target) target.innerHTML = toHtml(view);
  return target;
}

/** Convierte una vista en nodos sueltos (para agregarlos al final de una lista sin repintar todo). */
export function toNodes(view) {
  const tpl = document.createElement('template');
  tpl.innerHTML = toHtml(view);
  return [...tpl.content.childNodes];
}

/** Clases condicionales: cls('btn', active && 'active') → "btn active" */
export const cls = (...names) => names.filter(Boolean).join(' ');
