import { Router } from 'express';
import * as categories from '../controllers/categories.controller.js';

/* Categorías públicas · montado en /api/categories */
const router = Router();

router.get('/', categories.list);

export default router;
