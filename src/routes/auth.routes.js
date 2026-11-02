import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { validateRegister, validateLogin } from '../validators/index.js';

/* Sesión · montado en /api/auth */
const router = Router();

router.post('/register', validateRegister, auth.register);
router.post('/login', validateLogin, auth.login);
router.post('/logout', auth.logout);
router.get('/me', auth.me);

export default router;
