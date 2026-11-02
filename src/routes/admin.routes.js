import { Router } from 'express';
import { allowRoles } from '../middleware/auth.js';
import * as admin from '../controllers/admin.controller.js';
import {
  validateUserList, validateUserCreate, validateUserUpdate, validateUserId, validateQuizList,
  validateCategoryCreate, validateCategoryUpdate, validateCategoryId,
  validateTagCreate, validateTagUpdate, validateTagId,
} from '../validators/index.js';

/* Administración · montado en /api/admin
   allowRoles('admin') protege todo el router: 401 sin sesión, 403 con otro rol.
   El rol no se cambia desde la API. Editar y borrar quizzes usan PUT y DELETE
   /api/quizzes/:id, que aceptan al creador o a un admin. */
const router = Router();
router.use(allowRoles('admin'));

// Usuarios
router.get('/users', validateUserList, admin.listUsers);
router.post('/users', validateUserCreate, admin.createUser);
router.put('/users/:id', validateUserUpdate, admin.updateUser);
router.delete('/users/:id', validateUserId, admin.deleteUser);

// Quizzes (solo listado)
router.get('/quizzes', validateQuizList, admin.listQuizzes);

// Categorías
router.get('/categories', admin.listCategories);
router.post('/categories', validateCategoryCreate, admin.createCategory);
router.put('/categories/:id', validateCategoryUpdate, admin.renameCategory);
router.delete('/categories/:id', validateCategoryId, admin.deleteCategory);

// Etiquetas de una categoría
router.post('/categories/:id/tags', validateTagCreate, admin.createTag);
router.put('/categories/:id/tags/:tagId', validateTagUpdate, admin.renameTag);
router.delete('/categories/:id/tags/:tagId', validateTagId, admin.deleteTag);

export default router;
