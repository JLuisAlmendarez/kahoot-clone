import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as quizzes from '../controllers/quizzes.controller.js';
import { validateSearch, validateQuizId, validateQuiz, validateQuizUpdate } from '../validators/index.js';

/* CRUD principal: quizzes · montado en /api/quizzes
   Los intentos y comentarios de un quiz tienen su propio router
   (ver attempts.routes.js y comments.routes.js). */
const router = Router();

// Leer (público)
router.get('/', validateSearch, quizzes.search);
router.get('/:id', validateQuizId, quizzes.detail);
router.get('/:id/versions', validateQuizId, quizzes.versions);

// Crear, editar y borrar (el creador o un admin)
router.post('/', requireAuth, validateQuiz, quizzes.create);
router.get('/:id/edit', requireAuth, validateQuizId, quizzes.getForEdit);
router.put('/:id', requireAuth, validateQuizUpdate, quizzes.update);
router.delete('/:id', requireAuth, validateQuizId, quizzes.remove);

// Likes
router.post('/:id/likes', requireAuth, validateQuizId, quizzes.like);
router.delete('/:id/likes', requireAuth, validateQuizId, quizzes.unlike);

export default router;
