import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as comments from '../controllers/comments.controller.js';
import { validateCommentList, validateComment, validateCommentId } from '../validators/index.js';

/* Foro: un comentario y sus respuestas · montado en /api/comments */
const router = Router();

router.get('/:id/replies', validateCommentId, comments.replies);
router.delete('/:id', requireAuth, validateCommentId, comments.remove);

export default router;

/* Comentarios de primer nivel de un quiz · montado en /api/quizzes/:id/comments
   mergeParams deja ver el :id del quiz que viene en la ruta padre. */
export const quizCommentsRouter = Router({ mergeParams: true });

quizCommentsRouter.get('/', validateCommentList, comments.list);
quizCommentsRouter.post('/', requireAuth, validateComment, comments.create);
