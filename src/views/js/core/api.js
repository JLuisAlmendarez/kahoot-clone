/* ============================================================================
   api.js — Cliente HTTP de la API REST (fetch). Cada función es un endpoint.
   Si la respuesta no es 2xx lanza ApiError con status, code, message y fields,
   tal como los manda el errorHandler del servidor.
   La sesión viaja sola en la cookie httpOnly; el navegador nunca ve el token.
   ========================================================================== */

export class ApiError extends Error {
  constructor(status, code, message, fields = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function http(method, path, body, query) {
  const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== null && v !== undefined && v !== ''))}` : '';
  let res;
  try {
    res = await fetch(`/api${path}${qs}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error || {};
    throw new ApiError(res.status, e.code || 'HTTP_ERROR', e.message || `Error ${res.status}`, e.fields || []);
  }
  return data;
}

const get = (path, query) => http('GET', path, undefined, query);
const post = (path, body = {}) => http('POST', path, body);
const put = (path, body) => http('PUT', path, body);
const del = (path) => http('DELETE', path);

export const api = {
  auth: {
    register: (data) => post('/auth/register', data),
    login: (data) => post('/auth/login', data),
    logout: () => post('/auth/logout'),
    me: () => get('/auth/me'),
  },
  categories: {
    list: () => get('/categories'),
  },
  quizzes: {
    search: ({ q = '', page = 1, limit = 12 } = {}) => get('/quizzes', { q, page, limit }),
    get: (id) => get(`/quizzes/${id}`),
    versions: (id) => get(`/quizzes/${id}/versions`),
    version: (versionId) => get(`/versions/${versionId}`),
    create: (input) => post('/quizzes', input),
    getForEdit: (id) => get(`/quizzes/${id}/edit`),
    update: (id, input) => put(`/quizzes/${id}`, input),
    remove: (id) => del(`/quizzes/${id}`),
    mine: () => get('/users/me/quizzes'),
    like: (id) => post(`/quizzes/${id}/likes`),
    unlike: (id) => del(`/quizzes/${id}/likes`),
  },
  attempts: {
    start: (quizId) => post(`/quizzes/${quizId}/attempts`),
    play: (id) => get(`/attempts/${id}/play`),
    answer: (id, data) => post(`/attempts/${id}/answers`, data),
    finish: (id, data = {}) => post(`/attempts/${id}/finish`, data),
    abandon: (id) => post(`/attempts/${id}/abandon`),
    /** Al cerrar la pestaña: el navegador envía la petición aunque la página ya se esté yendo. */
    abandonBeacon: (id) => navigator.sendBeacon?.(`/api/attempts/${id}/abandon`),
    review: (id) => get(`/attempts/${id}`),
    history: ({ quizId = null, page = 1, limit = 10 } = {}) => get('/attempts', { quizId, page, limit }),
  },
  comments: {
    list: (quizId, { page = 1, limit = 3 } = {}) => get(`/quizzes/${quizId}/comments`, { page, limit }),
    replies: (commentId) => get(`/comments/${commentId}/replies`),
    create: (quizId, data) => post(`/quizzes/${quizId}/comments`, data),
    remove: (commentId) => del(`/comments/${commentId}`),
  },
  // Solo rol admin (el servidor responde 403 a cualquier otro)
  admin: {
    users: ({ q = '', role = '', sort = 'createdAt', order = 'desc', page = 1, limit = 10 } = {}) => get('/admin/users', { q, role, sort, order, page, limit }),
    createUser: (data) => post('/admin/users', data),
    updateUser: (userId, data) => put(`/admin/users/${userId}`, data),
    deleteUser: (userId) => del(`/admin/users/${userId}`),
    quizzes: ({ q = '', categoria = '', sort = 'updatedAt', order = 'desc', page = 1, limit = 10 } = {}) => get('/admin/quizzes', { q, categoria, sort, order, page, limit }),
    categories: () => get('/admin/categories'),
    createCategory: (name) => post('/admin/categories', { name }),
    renameCategory: (id, name) => put(`/admin/categories/${id}`, { name }),
    deleteCategory: (id) => del(`/admin/categories/${id}`),
    createTag: (categoryId, name) => post(`/admin/categories/${categoryId}/tags`, { name }),
    renameTag: (categoryId, tagId, name) => put(`/admin/categories/${categoryId}/tags/${tagId}`, { name }),
    deleteTag: (categoryId, tagId) => del(`/admin/categories/${categoryId}/tags/${tagId}`),
  },
};
