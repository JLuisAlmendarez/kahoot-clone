import { User, Category, Like, Comment, Attempt } from '../models/index.js';
import * as quizRepository from '../repositories/quiz.repository.js';
import { ApiError } from '../utils/ApiError.js';
import { parseId, pagination } from '../utils/http.js';
import { Roles, slugify, normalize } from '../shared/rules.js';

/* ============================================================================
   Panel de administración (solo rol admin; ver allowRoles en las rutas).
   - Usuarios: CRUD (listado con búsqueda, filtro, orden y paginado; alta, edición
     y baja). El rol NO se cambia desde la API: un usuario es «creador» por su
     relación con cada quiz, y los administradores vienen del seed.
   - Quizzes: listado de todos; editar y borrar usan las rutas del editor.
   - Catálogo: alta, edición y baja de categorías y de sus etiquetas.
   ========================================================================== */

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SORTABLE = { username: 'username', email: 'email', role: 'role', createdAt: 'createdAt' };

// ================================================================ usuarios
/** Lo que ve el admin de cada cuenta. */
const userView = (u, me, quizCount = 0) => ({ ...u.toPublic(), email: u.email, quizCount, isMe: String(u._id) === String(me._id) });

async function findUser(id) {
  const user = await User.findById(parseId(id, 'El usuario no existe'));
  if (!user) throw ApiError.notFound('El usuario no existe');
  return user;
}

/** GET /api/admin/users?q=&role=&sort=&order=&page=&limit= */
export async function listUsers(req, res) {
  const { q = '', role, sort = 'createdAt', order = 'desc' } = req.query;
  const { page, limit, skip } = pagination(req.query, { limit: 10 });
  const filter = {};
  if (q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim().toLowerCase()));
    filter.$or = [{ username: rx }, { email: rx }];
  }
  if (role) filter.role = role;
  const dir = order === 'asc' ? 1 : -1;
  const [users, total, admins] = await Promise.all([
    User.find(filter).sort({ [SORTABLE[sort]]: dir, _id: dir }).skip(skip).limit(limit),
    User.countDocuments(filter),
    User.countDocuments({ role: Roles.ADMIN }),
  ]);
  // Cuántos quizzes vivos tiene cada usuario de la página (una sola consulta)
  const counts = await quizRepository.countByOwners(users.map((u) => u._id));
  const byUser = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({
    items: users.map((u) => userView(u, req.user, byUser.get(String(u._id)) || 0)),
    page, totalPages: Math.max(1, Math.ceil(total / limit)), total, admins,
  });
}

/**
 * POST /api/admin/users { username, email, password }
 * Las cuentas creadas por el admin siempre son de rol user: el rol no se asigna desde la API.
 */
export async function createUser(req, res) {
  const { username, email, password } = req.body;
  const user = new User({ username, email, passwordHash: await User.hashPassword(password) });
  await user.save(); // usuario o correo repetido → 409
  res.status(201).json(userView(user, req.user));
}

/**
 * PUT /api/admin/users/:id { username, email, password? }
 * Edita los datos de la cuenta (nunca el rol). Si cambia el nombre de usuario se
 * actualiza la copia guardada en sus quizzes y comentarios. password es opcional
 * y sirve para restablecerla.
 */
export async function updateUser(req, res) {
  const user = await findUser(req.params.id);
  const { username, email, password } = req.body;
  const renamed = user.username !== String(username).toLowerCase();
  user.username = username;
  user.email = email;
  if (password) user.passwordHash = await User.hashPassword(password);
  await user.save(); // usuario o correo repetido → 409
  if (renamed) {
    await Promise.all([
      quizRepository.renameOwner(user._id, user.username),
      Comment.updateMany({ 'author.userId': user._id }, { $set: { 'author.username': user.username } }),
    ]);
  }
  const quizCount = await quizRepository.countByOwner(user._id);
  res.json(userView(user, req.user, quizCount));
}

/**
 * DELETE /api/admin/users/:id
 * Reglas: no la propia cuenta, no cuentas de administrador y no usuarios con
 * quizzes vivos (primero se borran sus quizzes). Al borrar se quitan sus likes
 * (restando el contador), sus intentos y sus comentarios; un comentario con
 * respuestas de otras personas queda como «[comentario eliminado]».
 */
export async function deleteUser(req, res) {
  const user = await findUser(req.params.id);
  if (String(user._id) === String(req.user._id)) throw ApiError.conflict('SELF_DELETE', 'No puedes borrar tu propia cuenta');
  if (user.role === Roles.ADMIN) throw ApiError.forbidden('No se pueden borrar cuentas de administrador');
  const quizzes = await quizRepository.countByOwner(user._id);
  if (quizzes) throw ApiError.conflict('IN_USE', `No se puede borrar: tiene ${quizzes} quiz(zes); bórralos primero`);

  // Likes: cada like borrado resta 1 al quiz (condición > 0 por si hubo concurrencia)
  const likes = await Like.find({ userId: user._id }, 'quizId');
  for (const like of likes) {
    const r = await Like.deleteOne({ _id: like._id });
    if (r.deletedCount) await quizRepository.decrementLikes(like.quizId);
  }
  // Comentarios: primero sus respuestas (restan replyCount al padre), luego los de primer nivel
  const replies = await Comment.find({ 'author.userId': user._id, parentId: { $ne: null } }, 'parentId');
  for (const c of replies) {
    const r = await Comment.deleteOne({ _id: c._id, replyCount: 0 });
    if (r.deletedCount) await Comment.updateOne({ _id: c.parentId, replyCount: { $gt: 0 } }, { $inc: { replyCount: -1 } });
  }
  await Comment.deleteMany({ 'author.userId': user._id, parentId: null, replyCount: 0 });
  await Comment.updateMany({ 'author.userId': user._id }, { $set: { deleted: true, body: '' } });
  // Padres eliminados que se quedaron sin respuestas desaparecen
  await Comment.deleteMany({ deleted: true, replyCount: 0 });
  await Attempt.deleteMany({ userId: user._id });
  await User.deleteOne({ _id: user._id });
  res.json({ deleted: true });
}

// ================================================================= quizzes
const QUIZ_SORT = { title: 'title', owner: 'owner.username', category: 'category.name', playCount: 'playCount', likesCount: 'likesCount', updatedAt: 'updatedAt' };

/**
 * GET /api/admin/quizzes?q=&categoria=&sort=&order=&page=&limit=
 * Todos los quizzes vivos, de cualquier autor. Editar y borrar usan las mismas
 * rutas del editor (PUT y DELETE /api/quizzes/:id), que también aceptan al admin.
 */
export async function listQuizzes(req, res) {
  const { q = '', categoria, sort = 'updatedAt', order = 'desc' } = req.query;
  const { page, limit, skip } = pagination(req.query, { limit: 10 });
  const filter = {};
  if (q.trim()) {
    const text = normalize(q.trim());
    filter.$or = [{ searchText: { $regex: escapeRegex(text) } }, { 'owner.username': { $regex: escapeRegex(text) } }];
  }
  if (categoria) filter['category.slug'] = categoria;
  const dir = order === 'asc' ? 1 : -1;
  const [items, total] = await quizRepository.adminList(filter, { [QUIZ_SORT[sort]]: dir, _id: dir }, skip, limit);
  res.json({
    items: items.map((qz) => ({ ...qz.toCard(), version: qz.version, updatedAt: qz.updatedAt.toISOString() })),
    page, totalPages: Math.max(1, Math.ceil(total / limit)), total,
  });
}

// =============================================================== categorías
/** Cuántos quizzes vivos usan cada categoría y cada etiqueta. */
async function usage() {
  const [cats, tags] = await Promise.all([quizRepository.countPerCategory(), quizRepository.countPerTag()]);
  return { cats: new Map(cats.map((c) => [String(c._id), c.n])), tags: new Map(tags.map((t) => [String(t._id), t.n])) };
}

const categoryView = (c, u) => ({
  categoryId: String(c._id), name: c.name, slug: c.slug, quizCount: u.cats.get(String(c._id)) || 0,
  tags: c.tags.map((t) => ({ tagId: String(t._id), name: t.name, slug: t.slug, quizCount: u.tags.get(String(t._id)) || 0 })),
});

async function findCategory(id) {
  const category = await Category.findById(parseId(id, 'La categoría no existe'));
  if (!category) throw ApiError.notFound('La categoría no existe');
  return category;
}

function findTag(category, tagId) {
  const tag = category.tags.id(parseId(tagId, 'La etiqueta no existe'));
  if (!tag) throw ApiError.notFound('La etiqueta no existe');
  return tag;
}

/** Ningún nombre de etiqueta puede repetirse dentro de la misma categoría. */
function assertUniqueTag(category, name, exceptId = null) {
  const slug = slugify(name);
  if (category.tags.some((t) => t.slug === slug && String(t._id) !== String(exceptId))) {
    throw ApiError.conflict('DUPLICATE', 'Esa etiqueta ya existe en la categoría', [{ path: 'name', message: 'Esa etiqueta ya existe en la categoría' }]);
  }
}

/** GET /api/admin/categories — con el número de quizzes que usan cada una */
export async function listCategories(req, res) {
  const [categories, u] = await Promise.all([Category.find().sort({ name: 1 }), usage()]);
  res.json(categories.map((c) => categoryView(c, u)));
}

/** POST /api/admin/categories { name } */
export async function createCategory(req, res) {
  const category = await Category.create({ name: req.body.name, slug: slugify(req.body.name) }); // slug repetido → 409
  res.status(201).json(categoryView(category, await usage()));
}

/**
 * PUT /api/admin/categories/:id { name }
 * Los quizzes guardan una copia del nombre y el slug, así que se actualizan también.
 */
export async function renameCategory(req, res) {
  const category = await findCategory(req.params.id);
  category.name = req.body.name;
  category.slug = slugify(req.body.name);
  await category.save();
  await quizRepository.renameCategory(category);
  res.json(categoryView(category, await usage()));
}

/** DELETE /api/admin/categories/:id — solo si ningún quiz vivo la usa */
export async function deleteCategory(req, res) {
  const category = await findCategory(req.params.id);
  const inUse = await quizRepository.countByCategory(category._id);
  if (inUse) throw ApiError.conflict('IN_USE', `No se puede borrar: ${inUse} quiz(zes) usan esta categoría`);
  await Category.deleteOne({ _id: category._id });
  res.json({ deleted: true });
}

/** POST /api/admin/categories/:id/tags { name } */
export async function createTag(req, res) {
  const category = await findCategory(req.params.id);
  assertUniqueTag(category, req.body.name);
  category.tags.push({ name: req.body.name, slug: slugify(req.body.name) });
  await category.save();
  res.status(201).json(categoryView(category, await usage()));
}

/** PUT /api/admin/categories/:id/tags/:tagId { name } */
export async function renameTag(req, res) {
  const category = await findCategory(req.params.id);
  const tag = findTag(category, req.params.tagId);
  assertUniqueTag(category, req.body.name, tag._id);
  tag.name = req.body.name;
  tag.slug = slugify(req.body.name);
  await category.save();
  await quizRepository.renameTag(tag);
  await quizRepository.refreshSearchText({ 'tags.tagId': tag._id });
  res.json(categoryView(category, await usage()));
}

/** DELETE /api/admin/categories/:id/tags/:tagId — solo si ningún quiz vivo la usa */
export async function deleteTag(req, res) {
  const category = await findCategory(req.params.id);
  const tag = findTag(category, req.params.tagId);
  const inUse = await quizRepository.countByTag(tag._id);
  if (inUse) throw ApiError.conflict('IN_USE', `No se puede borrar: ${inUse} quiz(zes) usan esta etiqueta`);
  await Category.updateOne({ _id: category._id }, { $pull: { tags: { _id: tag._id } } });
  res.json(categoryView(await findCategory(category._id), await usage()));
}
