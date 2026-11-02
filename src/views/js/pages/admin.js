/* Página: panel de administración (ruta /admin/usuarios | /admin/quizzes | /admin/categorias).
   API: GET · POST /api/admin/users · PUT · DELETE /api/admin/users/:id
        GET /api/admin/quizzes · DELETE /api/quizzes/:id (editar usa el editor /editor/:id)
        GET · POST /api/admin/categories · PUT · DELETE /api/admin/categories/:id
        POST /api/admin/categories/:id/tags · PUT · DELETE /api/admin/categories/:id/tags/:tagId
   El rol de un usuario no se cambia desde aquí. Filtros, orden y página viven en la URL. */
import { render } from '../core/generate-html.js';
import { api } from '../core/api.js';
import { loadRegion, busy, toast, modal, fieldError } from '../core/ui.js';
import { session } from '../core/session.js';
import { skeletonRows } from '../templates/states.js';
import * as view from '../templates/admin.js';

const TABS = ['usuarios', 'quizzes', 'categorias'];
const USER_SORTS = ['username', 'email', 'role', 'createdAt'];
const QUIZ_SORTS = ['title', 'owner', 'category', 'playCount', 'likesCount', 'updatedAt'];

/** Filtros de la tabla según la URL, con valores por defecto válidos. */
function readFilters(query, tab) {
  const sorts = tab === 'quizzes' ? QUIZ_SORTS : USER_SORTS;
  const def = tab === 'quizzes' ? 'updatedAt' : 'createdAt';
  return {
    q: (query.get('q') || '').trim().slice(0, 100),
    role: ['user', 'admin'].includes(query.get('role')) ? query.get('role') : '',
    categoria: /^[a-z0-9-]+$/.test(query.get('categoria') || '') ? query.get('categoria') : '',
    sort: sorts.includes(query.get('sort')) ? query.get('sort') : def,
    order: query.get('order') === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, parseInt(query.get('page'), 10) || 1),
    def,
  };
}

const tableUrl = (tab, f) => {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (tab === 'usuarios' && f.role) p.set('role', f.role);
  if (tab === 'quizzes' && f.categoria) p.set('categoria', f.categoria);
  if (f.sort !== f.def || f.order !== 'desc') { p.set('sort', f.sort); p.set('order', f.order); }
  if (f.page > 1) p.set('page', f.page);
  const s = p.toString();
  return `/admin/${tab}${s ? `?${s}` : ''}`;
};

export default {
  title: 'Administración',
  auth: true,
  async mount({ outlet, params, query, me, navigate }) {
    if (me.role !== 'admin') { render(outlet, view.forbidden()); return; }
    const tab = TABS.includes(params.tab) ? params.tab : 'usuarios';
    if (params.tab !== tab) { navigate('/admin/usuarios', { replace: true }); return; }

    render(outlet, view.adminShell(tab));
    const region = outlet.querySelector('[data-region="tab"]');
    const renameModal = outlet.querySelector('#modal-nombre');
    const renameForm = renameModal.querySelector('[data-form="rename"]');
    const userModal = outlet.querySelector('#modal-usuario');
    const userForm = userModal.querySelector('[data-form="user"]');
    const deleteModal = outlet.querySelector('#modal-borrar-admin');
    let pending = null;      // elemento por renombrar o borrar
    let editingUser = null;  // null = alta; { userId } = edición
    const f = readFilters(query, tab);

    /** Si el servidor dice que ya no somos admin, se actualiza la sesión. */
    const handleError = async (err) => {
      toast(err.message, 'danger');
      if (err.status === 403 && err.message.includes('administradores')) { await session.refresh(); navigate('/', { force: true }); }
    };
    /** Muestra los errores del servidor en sus campos; si no hay campo, en un toast. */
    const showFieldErrors = async (form, err) => {
      const shown = (err.fields || []).map((x) => fieldError(form, x.path, x.message)).some(Boolean);
      if (!shown) await handleError(err);
    };
    const clearForm = (form) => form.querySelectorAll('input').forEach((i) => { i.setCustomValidity(''); i.classList.remove('is-invalid'); });

    // ============================================================ usuarios
    async function loadUsers() {
      render(region, view.usersFilters(f));
      const table = region.querySelector('[data-region="users"]');
      region.querySelector('[data-form="user-filters"]').addEventListener('submit', (e) => {
        e.preventDefault();
        navigate(tableUrl('usuarios', { ...f, q: e.currentTarget.q.value.trim(), role: e.currentTarget.role.value, page: 1 }));
      });
      await loadRegion(table, () => api.admin.users({ ...f, limit: 10 }), {
        loading: skeletonRows(4),
        errorText: 'No pudimos cargar los usuarios.',
        onData: (data) => render(table, view.usersTable(data, f, (page) => tableUrl('usuarios', { ...f, page }))),
      });
    }

    function openUserModal(user = null) {
      editingUser = user;
      clearForm(userForm);
      userForm.reset();
      userModal.querySelector('#modal-usuario-title').textContent = user ? `Editar @${user.username}` : 'Nuevo usuario';
      userForm.elements.username.value = user?.username || '';
      userForm.elements.email.value = user?.email || '';
      userForm.elements.password.required = !user;
      userModal.querySelector('[data-slot="user-help"]').textContent = user
        ? 'Deja la contraseña vacía para conservarla. El rol no se cambia desde aquí.'
        : 'La cuenta se crea con rol de usuario.';
      modal(userModal).show();
    }

    // ============================================================= quizzes
    async function loadQuizzes() {
      const categories = await api.categories.list().catch(() => []);
      render(region, view.quizzesFilters(f, categories));
      const table = region.querySelector('[data-region="quizzes"]');
      region.querySelector('[data-form="quiz-filters"]').addEventListener('submit', (e) => {
        e.preventDefault();
        navigate(tableUrl('quizzes', { ...f, q: e.currentTarget.q.value.trim(), categoria: e.currentTarget.categoria.value, page: 1 }));
      });
      await loadRegion(table, () => api.admin.quizzes({ ...f, limit: 10 }), {
        loading: skeletonRows(4),
        errorText: 'No pudimos cargar los quizzes.',
        onData: (data) => render(table, view.quizzesTable(data, f, (page) => tableUrl('quizzes', { ...f, page }))),
      });
    }

    // ========================================================== categorías
    async function loadCategories() {
      await loadRegion(region, () => api.admin.categories(), {
        loading: skeletonRows(4),
        errorText: 'No pudimos cargar las categorías.',
        onData: (list) => render(region, view.categoriesView(list)),
      });
    }

    const reload = () => ({ usuarios: loadUsers, quizzes: loadQuizzes, categorias: loadCategories })[tab]();

    const DELETE_TEXT = {
      user: 'Se borran también sus likes, intentos y comentarios. Esta acción no se puede deshacer.',
      quiz: 'Se borran también sus versiones, intentos, likes y comentarios. Esta acción no se puede deshacer.',
      category: 'Esta acción no se puede deshacer.',
      tag: 'Esta acción no se puede deshacer.',
    };

    // ------------------------------------------------------------- clics
    outlet.addEventListener('click', async (e) => {
      const sort = e.target.closest('[data-action="sort"]');
      if (sort) {
        navigate(tableUrl(tab, { ...f, sort: sort.dataset.sort, order: sort.dataset.order, page: 1 }));
        return;
      }
      if (e.target.closest('[data-action="new-user"]')) { openUserModal(); return; }
      const editUser = e.target.closest('[data-action="edit-user"]');
      if (editUser) { openUserModal({ ...editUser.dataset }); return; }

      const rename = e.target.closest('[data-action="rename"]');
      if (rename) {
        pending = { ...rename.dataset };
        const isTag = pending.kind === 'tag';
        renameModal.querySelector('#modal-nombre-title').textContent = isTag ? 'Renombrar etiqueta' : 'Renombrar categoría';
        const input = renameForm.elements.name;
        input.value = pending.name;
        input.maxLength = isTag ? 30 : 20;
        clearForm(renameForm);
        modal(renameModal).show();
        return;
      }

      const del = e.target.closest('[data-action="delete"]');
      if (del) {
        pending = { ...del.dataset };
        deleteModal.querySelector('[data-slot="delete-name"]').textContent = pending.name;
        deleteModal.querySelector('[data-slot="delete-text"]').textContent = DELETE_TEXT[pending.kind];
        modal(deleteModal).show();
        return;
      }

      const confirm = e.target.closest('[data-action="confirm-delete"]');
      if (confirm && pending) {
        const restore = busy(confirm, 'Borrando…');
        try {
          if (pending.kind === 'user') await api.admin.deleteUser(pending.userId);
          else if (pending.kind === 'quiz') await api.quizzes.remove(pending.quizId);
          else if (pending.kind === 'tag') await api.admin.deleteTag(pending.categoryId, pending.tagId);
          else await api.admin.deleteCategory(pending.categoryId);
          modal(deleteModal).hide();
          toast(`«${pending.name}» se borró`);
          await reload();
        } catch (err) { await handleError(err); } finally { restore(); pending = null; }
      }
    });

    // ----------------------------------------------------------- formularios
    userForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearForm(userForm);
      const data = { username: userForm.elements.username.value.trim(), email: userForm.elements.email.value.trim() };
      if (userForm.elements.password.value) data.password = userForm.elements.password.value;
      const restore = busy(userForm.querySelector('[type="submit"]'));
      try {
        if (editingUser) await api.admin.updateUser(editingUser.userId, data);
        else await api.admin.createUser(data);
        modal(userModal).hide();
        toast(editingUser ? `Se guardaron los cambios de @${data.username.toLowerCase()}` : `Se creó la cuenta @${data.username.toLowerCase()}`);
        await loadUsers();
      } catch (err) { await showFieldErrors(userForm, err); } finally { restore(); }
    });

    renameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!pending) return;
      const name = renameForm.elements.name.value.trim();
      const restore = busy(renameForm.querySelector('[type="submit"]'));
      try {
        if (pending.kind === 'tag') await api.admin.renameTag(pending.categoryId, pending.tagId, name);
        else await api.admin.renameCategory(pending.categoryId, name);
        modal(renameModal).hide();
        toast('Nombre actualizado; los quizzes que la usan también se actualizaron');
        pending = null;
        await loadCategories();
      } catch (err) { await showFieldErrors(renameForm, err); } finally { restore(); }
    });

    region.addEventListener('submit', async (e) => {
      const form = e.target.closest('[data-form="new-category"], [data-form="new-tag"]');
      if (!form) return;
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const name = form.elements.name.value.trim();
      const restore = busy(form.querySelector('[type="submit"]'), 'Creando…');
      try {
        if (form.dataset.form === 'new-tag') await api.admin.createTag(form.dataset.categoryId, name);
        else await api.admin.createCategory(name);
        toast(`«${name}» se creó`);
        await loadCategories();
      } catch (err) { restore(); await handleError(err); }
    });

    await reload();
  },
};
