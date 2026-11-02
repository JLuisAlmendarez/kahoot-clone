import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as quizzes from '../controllers/quizzes.controller.js';

/* Datos del usuario con sesión · montado en /api/users */
const router = Router();

router.get('/me/quizzes', requireAuth, quizzes.mine);

export default router;
