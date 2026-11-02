/* Vistas del panel de administración (ruta /admin/usuarios | /admin/quizzes | /admin/categorias).
   Solo las ve el rol admin; el servidor vuelve a comprobarlo en cada petición. */
import { html, cls, raw } from '../core/generate-html.js';
import { fmt } from '../core/ui.js';
import { emptyState } from './states.js';
import { pagination } from './catalogo.js';

const tab = (name, icon, label, active) => html`
  <li class="nav-item" role="presentation">
    <a class="${cls('nav-link', active && 'active')}" href="/admin/${name}" role="tab" aria-selected="${String(active)}" ${active && html`aria-current="page"`}>
      <i class="bi bi-${icon} me-1" aria-hidden="true"></i>${label}
    </a>
  </li>`;

export const forbidden = () => emptyState({
  icon: 'shield-lock', title: 'Sección solo para administradores',
  text: 'Tu cuenta no tiene permisos para entrar aquí.',
  action: html`<a class="btn btn-primary" href="/"><i class="bi bi-compass me-1" aria-hidden="true"></i>Ir al catálogo</a>`,
});

export const adminShell = (tabName) => html`
  <div class="d-flex align-items-center gap-2 mb-3">
    <i class="bi bi-shield-lock fs-3 text-primary" aria-hidden="true"></i>
    <h1 class="h3 fw-bold mb-0">Administración</h1>
  </div>
  <ul class="nav nav-tabs mb-4" role="tablist">
    ${tab('usuarios', 'people', 'Usuarios', tabName === 'usuarios')}
    ${tab('quizzes', 'collection', 'Quizzes', tabName === 'quizzes')}
    ${tab('categorias', 'tags', 'Categorías y etiquetas', tabName === 'categorias')}
  </ul>
  <div data-region="tab"></div>
  ${nameModal()}
  ${userModal()}
  ${deleteModal()}`;

// ================================================================ usuarios
const COLUMNS = [
  ['username', 'Usuario'], ['email', 'Correo'], ['role', 'Rol'], [null, 'Quizzes'], ['createdAt', 'Alta'],
];

const sortHeader = ([key, label], f) => {
  if (!key) return html`<th scope="col" class="text-end">${label}</th>`;
  const active = f.sort === key;
  const nextOrder = active && f.order === 'asc' ? 'desc' : 'asc';
  const icon = !active ? 'arrow-down-up text-muted-qt' : f.order === 'asc' ? 'sort-up' : 'sort-down';
  return html`
    <th scope="col" ${active && html`aria-sort="${f.order === 'asc' ? 'ascending' : 'descending'}"`}>
      <button type="button" class="btn btn-link p-0 text-reset text-decoration-none fw-semibold" data-action="sort" data-sort="${key}" data-order="${nextOrder}">
        ${label} <i class="bi bi-${icon} small" aria-hidden="true"></i><span class="visually-hidden">, ordenar</span>
      </button>
    </th>`;
};

const roleBadge = (role) => (role === 'admin'
  ? html`<span class="badge text-bg-primary"><i class="bi bi-shield-lock me-1" aria-hidden="true"></i>Admin</span>`
  : html`<span class="badge text-bg-light border">Usuario</span>`);

/** Por qué no se puede borrar una cuenta (o null si sí se puede). */
const deleteBlock = (u) => (u.isMe ? 'No puedes borrar tu propia cuenta'
  : u.role === 'admin' ? 'No se pueden borrar cuentas de administrador'
    : u.quizCount > 0 ? `Tiene ${fmt.plural(u.quizCount, 'quiz', 'quizzes')}: bórralos primero`
      : null);

const userRow = (u) => {
  const blocked = deleteBlock(u);
  return html`
  <tr>
    <td><span class="d-inline-flex align-items-center gap-2"><span class="avatar" aria-hidden="true">${u.initials}</span>@${u.username}${u.isMe && html` <span class="small text-muted-qt">(tú)</span>`}</span></td>
    <td class="text-break">${u.email}</td>
    <td>${roleBadge(u.role)}</td>
    <td class="text-end">${u.quizCount}</td>
    <td class="text-nowrap">${fmt.date(u.createdAt)}</td>
    <td class="text-end text-nowrap">
      <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit-user" data-user-id="${u.userId}" data-username="${u.username}" data-email="${u.email}" aria-label="Editar @${u.username}"><i class="bi bi-pencil" aria-hidden="true"></i><span class="d-none d-lg-inline ms-1">Editar</span></button>
      <span class="d-inline-block" ${blocked && html`tabindex="0" title="${blocked}"`}>
        <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-kind="user" data-user-id="${u.userId}" data-name="@${u.username}" ${blocked && 'disabled'} aria-label="Borrar @${u.username}"><i class="bi bi-trash3" aria-hidden="true"></i><span class="d-none d-lg-inline ms-1">Borrar</span></button>
      </span>
    </td>
  </tr>`;
};

export const usersFilters = (f) => html`
  <form class="row g-2 align-items-end mb-3" data-form="user-filters" role="search">
    <div class="col-12 col-md-6">
      <label for="user-q" class="form-label small text-muted-qt mb-1">Buscar por usuario o correo</label>
      <input id="user-q" name="q" type="search" class="form-control" value="${f.q}" maxlength="100" placeholder="ana, @correo.com…">
    </div>
    <div class="col-8 col-md-3">
      <label for="user-role" class="form-label small text-muted-qt mb-1">Rol</label>
      <select id="user-role" name="role" class="form-select">
        <option value="">Todos</option>
        <option value="user" ${f.role === 'user' && 'selected'}>Usuario</option>
        <option value="admin" ${f.role === 'admin' && 'selected'}>Administrador</option>
      </select>
    </div>
    <div class="col-4 col-md-3 d-flex gap-2">
      <button class="btn btn-primary flex-fill" type="submit"><i class="bi bi-search me-1" aria-hidden="true"></i>Filtrar</button>
      <button class="btn btn-outline-primary text-nowrap" type="button" data-action="new-user"><i class="bi bi-person-plus" aria-hidden="true"></i><span class="d-none d-xl-inline ms-1">Nuevo</span></button>
    </div>
  </form>
  <div data-region="users"></div>`;

export const usersTable = (data, f, urlFor) => (data.items.length === 0
  ? emptyState({ icon: 'people', title: 'Sin resultados', text: 'Ningún usuario coincide con esos filtros.' })
  : html`
    <p class="small text-muted-qt mb-2">${fmt.plural(data.total, 'usuario', 'usuarios')} · ${fmt.plural(data.admins, 'administrador', 'administradores')} en total</p>
    <div class="table-responsive card">
      <table class="table table-hover align-middle mb-0">
        <caption class="visually-hidden">Usuarios registrados; los encabezados ordenan la tabla</caption>
        <thead class="table-light"><tr>${COLUMNS.map((c) => sortHeader(c, f))}<th scope="col" class="text-end">Acciones</th></tr></thead>
        <tbody>${data.items.map(userRow)}</tbody>
      </table>
    </div>
    ${pagination(data, urlFor)}`);

// ================================================================= quizzes
const QUIZ_COLUMNS = [
  ['title', 'Quiz'], ['owner', 'Autor'], ['category', 'Categoría'], ['playCount', 'Intentos'], ['likesCount', 'Likes'], ['updatedAt', 'Actualizado'],
];

const quizRow = (q) => html`
  <tr>
    <td><a class="link-body-emphasis text-decoration-none fw-semibold" href="/quiz/${q.quizId}">${q.title}</a>
      <div class="small text-muted-qt">Versión ${q.version} · ${fmt.plural(q.questionCount, 'pregunta', 'preguntas')}</div></td>
    <td class="text-nowrap">@${q.owner.username}</td>
    <td><span class="badge badge-cat">${q.category.name}</span></td>
    <td class="text-end">${q.playCount}</td>
    <td class="text-end">${q.likesCount}</td>
    <td class="text-nowrap">${fmt.date(q.updatedAt)}</td>
    <td class="text-end text-nowrap">
      <a class="btn btn-sm btn-outline-primary" href="/editor/${q.quizId}" aria-label="Editar ${q.title}"><i class="bi bi-pencil" aria-hidden="true"></i><span class="d-none d-lg-inline ms-1">Editar</span></a>
      <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-kind="quiz" data-quiz-id="${q.quizId}" data-name="${q.title}" aria-label="Borrar ${q.title}"><i class="bi bi-trash3" aria-hidden="true"></i><span class="d-none d-lg-inline ms-1">Borrar</span></button>
    </td>
  </tr>`;

export const quizzesFilters = (f, categories) => html`
  <form class="row g-2 align-items-end mb-3" data-form="quiz-filters" role="search">
    <div class="col-12 col-md-5">
      <label for="quiz-q" class="form-label small text-muted-qt mb-1">Buscar por título, descripción, etiqueta o autor</label>
      <input id="quiz-q" name="q" type="search" class="form-control" value="${f.q}" maxlength="100" placeholder="álgebra, luis_m…">
    </div>
    <div class="col-8 col-md-4">
      <label for="quiz-cat" class="form-label small text-muted-qt mb-1">Categoría</label>
      <select id="quiz-cat" name="categoria" class="form-select">
        <option value="">Todas</option>
        ${categories.map((c) => html`<option value="${c.slug}" ${f.categoria === c.slug && 'selected'}>${c.name}</option>`)}
      </select>
    </div>
    <div class="col-4 col-md-3 d-flex gap-2">
      <button class="btn btn-primary flex-fill" type="submit"><i class="bi bi-search me-1" aria-hidden="true"></i>Filtrar</button>
      <a class="btn btn-outline-primary text-nowrap" href="/editor" aria-label="Crear quiz"><i class="bi bi-plus-lg" aria-hidden="true"></i><span class="d-none d-xl-inline ms-1">Crear</span></a>
    </div>
  </form>
  <div data-region="quizzes"></div>`;

export const quizzesTable = (data, f, urlFor) => (data.items.length === 0
  ? emptyState({ icon: 'collection', title: 'Sin resultados', text: 'Ningún quiz coincide con esos filtros.' })
  : html`
    <p class="small text-muted-qt mb-2">${fmt.plural(data.total, 'quiz', 'quizzes')} en el catálogo. Borrar un quiz lo elimina definitivamente junto con sus intentos.</p>
    <div class="table-responsive card">
      <table class="table table-hover align-middle mb-0">
        <caption class="visually-hidden">Quizzes del catálogo; los encabezados ordenan la tabla</caption>
        <thead class="table-light"><tr>${QUIZ_COLUMNS.map((c) => sortHeader(c, f))}<th scope="col" class="text-end">Acciones</th></tr></thead>
        <tbody>${data.items.map(quizRow)}</tbody>
      </table>
    </div>
    ${pagination(data, urlFor)}`);

// ============================================================== categorías
const usage = (n) => (n === 0 ? 'sin quizzes' : fmt.plural(n, 'quiz', 'quizzes'));

const tagItem = (c, t) => html`
  <li class="list-group-item d-flex flex-wrap align-items-center gap-2">
    <span class="tag">#${t.name}</span>
    <span class="small text-muted-qt">${usage(t.quizCount)}</span>
    <span class="ms-auto d-flex gap-1">
      <button type="button" class="btn btn-sm btn-light" data-action="rename" data-kind="tag" data-category-id="${c.categoryId}" data-tag-id="${t.tagId}" data-name="${t.name}" aria-label="Renombrar etiqueta ${t.name}"><i class="bi bi-pencil" aria-hidden="true"></i></button>
      <button type="button" class="btn btn-sm btn-light text-danger" data-action="delete" data-kind="tag" data-category-id="${c.categoryId}" data-tag-id="${t.tagId}" data-name="${t.name}"
        ${t.quizCount > 0 && html`disabled title="No se puede borrar: la usan ${usage(t.quizCount)}"`} aria-label="Borrar etiqueta ${t.name}"><i class="bi bi-trash3" aria-hidden="true"></i></button>
    </span>
  </li>`;

const categoryCard = (c) => html`
  <div class="col">
    <article class="card h-100">
      <div class="card-header bg-white d-flex flex-wrap align-items-center gap-2">
        <h2 class="h6 mb-0"><span class="badge badge-cat fs-6">${c.name}</span></h2>
        <span class="small text-muted-qt">${usage(c.quizCount)}</span>
        <span class="ms-auto d-flex gap-1">
          <button type="button" class="btn btn-sm btn-outline-primary" data-action="rename" data-kind="category" data-category-id="${c.categoryId}" data-name="${c.name}"><i class="bi bi-pencil me-1" aria-hidden="true"></i>Renombrar</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-kind="category" data-category-id="${c.categoryId}" data-name="${c.name}"
            ${c.quizCount > 0 && html`disabled title="No se puede borrar: la usan ${usage(c.quizCount)}"`}><i class="bi bi-trash3 me-1" aria-hidden="true"></i>Borrar</button>
        </span>
      </div>
      <ul class="list-group list-group-flush">
        ${c.tags.length ? c.tags.map((t) => tagItem(c, t)) : html`<li class="list-group-item small text-muted-qt">Sin etiquetas</li>`}
      </ul>
      <div class="card-footer bg-white">
        <form class="input-group input-group-sm" data-form="new-tag" data-category-id="${c.categoryId}">
          <input class="form-control" name="name" required minlength="2" maxlength="30" placeholder="Nueva etiqueta" aria-label="Nueva etiqueta para ${c.name}">
          <button class="btn btn-outline-primary" type="submit"><i class="bi bi-plus-lg" aria-hidden="true"></i> Agregar</button>
        </form>
      </div>
    </article>
  </div>`;

export const categoriesView = (list) => html`
  <form class="card card-body mb-4" data-form="new-category">
    <label for="new-category" class="form-label fw-semibold">Nueva categoría</label>
    <div class="input-group">
      <input id="new-category" class="form-control" name="name" required minlength="2" maxlength="20" placeholder="Ej. Historia">
      <button class="btn btn-primary" type="submit"><i class="bi bi-plus-lg me-1" aria-hidden="true"></i>Crear</button>
    </div>
    <div class="form-text">Una categoría o etiqueta solo se puede borrar si ningún quiz la usa. Al renombrarla, los quizzes se actualizan solos.</div>
  </form>
  ${list.length === 0
    ? emptyState({ icon: 'tags', title: 'No hay categorías', text: 'Crea la primera para que los autores puedan clasificar sus quizzes.' })
    : html`<div class="row row-cols-1 row-cols-lg-2 g-3">${list.map(categoryCard)}</div>`}`;

// ================================================================= modales
const nameModal = () => html`
  <div class="modal fade" id="modal-nombre" tabindex="-1" aria-labelledby="modal-nombre-title" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <form class="modal-content" data-form="rename" novalidate>
        <div class="modal-header border-0 pb-0">
          <h2 class="modal-title h5" id="modal-nombre-title">Renombrar</h2>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label for="rename-input" class="form-label">Nuevo nombre</label>
            <input id="rename-input" name="name" class="form-control" required>
            <div class="invalid-feedback"></div>
          </div>
        </div>
        <div class="modal-footer border-0 pt-0">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>
    </div>
  </div>`;

const userField = (name, label, type, extra = '') => html`
  <div class="mb-3">
    <label for="user-${name}" class="form-label">${label}</label>
    <input id="user-${name}" name="${name}" type="${type}" class="form-control" ${raw(extra)}>
    <div class="invalid-feedback"></div>
  </div>`;

const userModal = () => html`
  <div class="modal fade" id="modal-usuario" tabindex="-1" aria-labelledby="modal-usuario-title" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <form class="modal-content" data-form="user" novalidate>
        <div class="modal-header border-0 pb-0">
          <h2 class="modal-title h5" id="modal-usuario-title">Usuario</h2>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body">
          ${userField('username', 'Nombre de usuario', 'text', 'required minlength="3" maxlength="20" autocomplete="off"')}
          ${userField('email', 'Correo', 'email', 'required maxlength="254" autocomplete="off"')}
          ${userField('password', 'Contraseña', 'password', 'minlength="8" maxlength="128" autocomplete="new-password"')}
          <p class="small text-muted-qt mb-0" data-slot="user-help"></p>
        </div>
        <div class="modal-footer border-0 pt-0">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>
    </div>
  </div>`;

const deleteModal = () => html`
  <div class="modal fade" id="modal-borrar-admin" tabindex="-1" aria-labelledby="modal-borrar-admin-title" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header border-0 pb-0">
          <h2 class="modal-title h5" id="modal-borrar-admin-title"><i class="bi bi-trash3 me-2 text-danger" aria-hidden="true"></i>¿Borrar «<span data-slot="delete-name"></span>»?</h2>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body"><p class="mb-0" data-slot="delete-text">Esta acción no se puede deshacer.</p></div>
        <div class="modal-footer border-0 pt-0">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" class="btn btn-danger" data-action="confirm-delete">Borrar</button>
        </div>
      </div>
    </div>
  </div>`;
