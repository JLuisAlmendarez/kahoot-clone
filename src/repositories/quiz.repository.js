import { Quiz } from '../models/index.js';

/**
 * Repository del recurso principal (Quiz). Es la única capa que usa el modelo
 * de Mongoose `Quiz`: los controladores le piden los datos por operación y no
 * construyen consultas sobre la colección.
 * @module repositories/quiz
 */

/**
 * @typedef {import('mongoose').Types.ObjectId|string} Id
 * @typedef {import('mongoose').HydratedDocument<any>} QuizDoc
 */

/**
 * Busca un quiz por su id.
 * @param {Id} id Id del quiz.
 * @param {string} [projection] Campos a regresar, por ejemplo 'likesCount'.
 * @returns {Promise<QuizDoc|null>}
 */
export const findById = (id, projection) => Quiz.findById(id, projection);

/**
 * Busca varios quizzes por sus ids.
 * @param {Id[]} ids Ids de los quizzes.
 * @returns {Promise<QuizDoc[]>}
 */
export const findByIds = (ids) => Quiz.find({ _id: { $in: ids } });

/**
 * Página del catálogo público con el total de coincidencias.
 * @param {Object} filter Filtro construido por SearchQuery.
 * @param {Object} sort Orden construido por SearchQuery.
 * @param {number} skip Documentos a saltar.
 * @param {number} limit Documentos por página.
 * @returns {Promise<[QuizDoc[], number]>} Quizzes de la página y total.
 */
export const search = (filter, sort, skip, limit) => Promise.all([
  Quiz.find(filter).sort(sort).skip(skip).limit(limit),
  Quiz.countDocuments(filter),
]);

/**
 * Página de quizzes para la administración, con orden alfabético en español y total.
 * @param {Object} filter Filtro de búsqueda y categoría.
 * @param {Object} sort Orden, por ejemplo { updatedAt: -1, _id: -1 }.
 * @param {number} skip Documentos a saltar.
 * @param {number} limit Documentos por página.
 * @returns {Promise<[QuizDoc[], number]>} Quizzes de la página y total.
 */
export const adminList = (filter, sort, skip, limit) => Promise.all([
  Quiz.find(filter).collation({ locale: 'es' }).sort(sort).skip(skip).limit(limit),
  Quiz.countDocuments(filter),
]);

/**
 * Quizzes de un usuario, del más reciente al más antiguo.
 * @param {Id} userId Id del dueño.
 * @returns {Promise<QuizDoc[]>}
 */
export const findByOwner = (userId) => Quiz.find({ 'owner.userId': userId }).sort({ updatedAt: -1 });

/**
 * Crea un documento de quiz sin guardarlo, para que el controlador aplique la versión y lo valide.
 * @param {Object} data Datos del quiz.
 * @returns {QuizDoc}
 */
export const build = (data) => new Quiz(data);

/**
 * Guarda un quiz construido con build().
 * @param {QuizDoc} quiz Documento a guardar.
 * @returns {Promise<QuizDoc>}
 */
export const save = (quiz) => quiz.save();

/**
 * Texto normalizado de búsqueda para título, descripción y etiquetas.
 * @param {{title?: string, description?: string, tags?: Array<{name: string}>}} data Datos del quiz.
 * @returns {string}
 */
export const searchTextFor = (data) => Quiz.searchTextFor(data);

/**
 * Actualiza con $set los campos que controla el editor y regresa el documento nuevo.
 * Regresa null si el filtro ya no coincide (otra edición publicó una versión antes).
 * @param {Object} filter Filtro con el _id y, si aplica, la versión esperada.
 * @param {Object} set Campos a actualizar.
 * @returns {Promise<QuizDoc|null>}
 */
export const updateEditable = (filter, set) => Quiz.findOneAndUpdate(filter, { $set: set }, { new: true, runValidators: true });

/**
 * Elimina un quiz por id.
 * @param {Id} id Id del quiz.
 * @returns {Promise<{deletedCount: number}>}
 */
export const deleteById = (id) => Quiz.deleteOne({ _id: id });

/**
 * Suma 1 al contador de likes de forma atómica.
 * @param {Id} id Id del quiz.
 * @returns {Promise<Object>}
 */
export const incrementLikes = (id) => Quiz.updateOne({ _id: id }, { $inc: { likesCount: 1 } });

/**
 * Resta 1 al contador de likes de forma atómica, sin bajar de 0.
 * @param {Id} id Id del quiz.
 * @returns {Promise<Object>}
 */
export const decrementLikes = (id) => Quiz.updateOne({ _id: id, likesCount: { $gt: 0 } }, { $inc: { likesCount: -1 } });

/**
 * Suma 1 al contador de partidas jugadas de forma atómica.
 * @param {Id} id Id del quiz.
 * @returns {Promise<Object>}
 */
export const incrementPlays = (id) => Quiz.updateOne({ _id: id }, { $inc: { playCount: 1 } });

/**
 * Cuántos quizzes tiene un usuario.
 * @param {Id} userId Id del dueño.
 * @returns {Promise<number>}
 */
export const countByOwner = (userId) => Quiz.countDocuments({ 'owner.userId': userId });

/**
 * Cuántos quizzes tiene cada usuario de la lista, en una sola consulta.
 * @param {Id[]} userIds Ids de los usuarios.
 * @returns {Promise<Array<{_id: Id, n: number}>>}
 */
export const countByOwners = (userIds) => Quiz.aggregate([
  { $match: { 'owner.userId': { $in: userIds } } },
  { $group: { _id: '$owner.userId', n: { $sum: 1 } } },
]);

/**
 * Actualiza el nombre de usuario copiado en los quizzes de ese dueño.
 * @param {Id} userId Id del dueño.
 * @param {string} username Nombre nuevo.
 * @returns {Promise<Object>}
 */
export const renameOwner = (userId, username) => Quiz.updateMany({ 'owner.userId': userId }, { $set: { 'owner.username': username } });

/**
 * Cuántos quizzes usan cada categoría.
 * @returns {Promise<Array<{_id: Id, n: number}>>}
 */
export const countPerCategory = () => Quiz.aggregate([{ $group: { _id: '$category.categoryId', n: { $sum: 1 } } }]);

/**
 * Cuántos quizzes usan cada etiqueta.
 * @returns {Promise<Array<{_id: Id, n: number}>>}
 */
export const countPerTag = () => Quiz.aggregate([{ $unwind: '$tags' }, { $group: { _id: '$tags.tagId', n: { $sum: 1 } } }]);

/**
 * Cuántos quizzes usan una categoría.
 * @param {Id} categoryId Id de la categoría.
 * @returns {Promise<number>}
 */
export const countByCategory = (categoryId) => Quiz.countDocuments({ 'category.categoryId': categoryId });

/**
 * Cuántos quizzes usan una etiqueta.
 * @param {Id} tagId Id de la etiqueta.
 * @returns {Promise<number>}
 */
export const countByTag = (tagId) => Quiz.countDocuments({ 'tags.tagId': tagId });

/**
 * Actualiza la copia del nombre y el slug de una categoría en los quizzes que la usan.
 * @param {{_id: Id, name: string, slug: string}} category Categoría renombrada.
 * @returns {Promise<Object>}
 */
export const renameCategory = (category) => Quiz.updateMany(
  { 'category.categoryId': category._id },
  { $set: { 'category.name': category.name, 'category.slug': category.slug } },
);

/**
 * Actualiza la copia del nombre y el slug de una etiqueta en los quizzes que la usan.
 * @param {{_id: Id, name: string, slug: string}} tag Etiqueta renombrada.
 * @returns {Promise<Object>}
 */
export const renameTag = (tag) => Quiz.updateMany(
  { 'tags.tagId': tag._id },
  { $set: { 'tags.$[t].name': tag.name, 'tags.$[t].slug': tag.slug } },
  { arrayFilters: [{ 't.tagId': tag._id }] },
);

/**
 * Recalcula el texto de búsqueda de los quizzes que cumplen el filtro.
 * @param {Object} filter Filtro, por ejemplo { 'tags.tagId': id }.
 * @returns {Promise<void>}
 */
export const refreshSearchText = async (filter) => {
  const quizzes = await Quiz.find(filter, 'title description tags');
  await Promise.all(quizzes.map((q) => Quiz.updateOne({ _id: q._id }, { $set: { searchText: Quiz.searchTextFor(q) } })));
};
