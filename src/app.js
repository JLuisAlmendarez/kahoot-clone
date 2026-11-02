import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { loadUser } from './middleware/auth.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler, apiNotFound } from './middleware/errorHandler.js';
import apiRoutes from './routes/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const viewsDir = path.join(here, 'views');

/** Crea la app de Express (sin escuchar en un puerto, para poder probarla con supertest). */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // Cabeceras de seguridad. Todo se sirve desde el mismo origen (sin CDN), así la CSP queda estricta.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: env.isProduction ? [] : null,
      },
    },
  }));
  if (!env.isTest) app.use(morgan('dev'));
  app.use(express.json({ limit: '200kb' }));
  // sendBeacon manda el cuerpo como text/plain; lo aceptamos solo para que no falle
  app.use(express.text({ type: 'text/plain', limit: '1kb' }));
  app.use(cookieParser());

  // ---------------------------------------------------------------- API
  // CORS va primero: un origen no permitido se rechaza antes de leer la sesión.
  app.use('/api', corsMiddleware, loadUser, apiRoutes, apiNotFound);

  // ------------------------------------------------- archivos estáticos
  const vendor = (p) => path.join(root, 'node_modules', p);
  app.use('/vendor/bootstrap', express.static(vendor('bootstrap/dist')));
  app.use('/vendor/bootstrap-icons', express.static(vendor('bootstrap-icons/font')));
  app.use('/vendor/marked', express.static(vendor('marked')));
  app.use('/vendor/dompurify', express.static(vendor('dompurify/dist')));
  app.use('/shared', express.static(path.join(here, 'shared')));
  app.use(express.static(viewsDir, { index: false }));

  // SPA: cualquier otra ruta GET sin extensión (/quiz/123, /perfil…) devuelve index.html
  // y el router del navegador decide qué vista mostrar
  app.get(/^(?!\/api\/)[^.]*$/, (req, res) => res.sendFile(path.join(viewsDir, 'index.html')));

  app.use(errorHandler);
  return app;
}
