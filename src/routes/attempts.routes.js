import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as attempts from '../controllers/attempts.controller.js';
import { validateQuizId, validateAttemptId, validateAnswer, validateFinish, validateHistory } from '../validators/index.js';

/* Intentos · montado en /api/attempts (todas exigen sesión) */
const router = Router();
router.use(requireAuth);

router.get('/', validateHistory, attempts.history);
router.get('/:id', validateAttemptId, attempts.review);
router.get('/:id/play', validateAttemptId, attempts.play);
router.post('/:id/answers', validateAnswer, attempts.answer);
router.post('/:id/finish', validateFinish, attempts.finish);
router.post('/:id/abandon', validateAttemptId, attempts.abandon);

export default router;

/* Iniciar un intento de un quiz · montado en /api/quizzes/:id/attempts
   mergeParams deja ver el :id del quiz que viene en la ruta padre. */
export const quizAttemptsRouter = Router({ mergeParams: true });

quizAttemptsRouter.post('/', requireAuth, validateQuizId, attempts.start);
