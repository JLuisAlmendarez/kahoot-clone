import { Router } from 'express';
import authRoutes from './auth.routes.js';
import categoriesRoutes from './categories.routes.js';
import quizzesRoutes from './quizzes.routes.js';
import versionsRoutes from './versions.routes.js';
import usersRoutes from './users.routes.js';
import attemptsRoutes, { quizAttemptsRouter } from './attempts.routes.js';
import commentsRoutes, { quizCommentsRouter } from './comments.routes.js';
import adminRoutes from './admin.routes.js';

/* ============================================================================
   routes/index.js — Junta los routers de cada recurso bajo /api.
   Cada archivo *.routes.js es un express.Router() con sus rutas:
     método + URL → (sesión) → validadores express-validator → controlador.
   Express 5 pasa al errorHandler cualquier error que lance un controlador
   async, sin try/catch.
   ========================================================================== */
const api = Router();

api.use('/auth', authRoutes);
api.use('/categories', categoriesRoutes);
api.use('/quizzes/:id/attempts', quizAttemptsRouter);
api.use('/quizzes/:id/comments', quizCommentsRouter);
api.use('/quizzes', quizzesRoutes);
api.use('/versions', versionsRoutes);
api.use('/users', usersRoutes);
api.use('/attempts', attemptsRoutes);
api.use('/comments', commentsRoutes);
api.use('/admin', adminRoutes);

export default api;
