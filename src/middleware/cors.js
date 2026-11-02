import cors from 'cors';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/* ============================================================================
   middleware/cors.js — CORS restringido a una lista blanca de orígenes.

   Orígenes permitidos:
     1. Los de CORS_ORIGIN en .env (separados por coma).
     2. El propio servidor: la SPA se sirve desde el mismo dominio que la API.
   Peticiones sin cabecera Origin (curl, Postman, supertest, navegación
   normal) no son de otro sitio y pasan.

   Un origen que no está en la lista recibe 403 CORS_NOT_ALLOWED y la petición
   nunca llega a la ruta ni al controlador.
   ========================================================================== */

/** true si el Origin apunta a este mismo servidor (mismo host y puerto). */
function isSameHost(origin, req) {
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false; // Origin mal formado o "null"
  }
}

export function isAllowedOrigin(origin, req) {
  if (!origin) return true;
  return env.corsOrigins.includes(origin) || isSameHost(origin, req);
}

export const corsMiddleware = cors((req, callback) => {
  const origin = req.get('origin');
  if (!isAllowedOrigin(origin, req)) {
    return callback(new ApiError(403, 'CORS_NOT_ALLOWED', `Origen no permitido por CORS: ${origin}`));
  }
  return callback(null, {
    origin: origin || false,      // refleja solo el origen ya aprobado (nunca "*")
    credentials: true,            // permite enviar la cookie de sesión
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600,                  // el navegador guarda la respuesta del preflight 10 min
  });
});
