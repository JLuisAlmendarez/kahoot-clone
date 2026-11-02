import { Router } from 'express';
import * as quizzes from '../controllers/quizzes.controller.js';
import { validateVersionId } from '../validators/index.js';

/* Snapshot de una versión de quiz · montado en /api/versions */
const router = Router();

router.get('/:versionId', validateVersionId, quizzes.version);

export default router;
