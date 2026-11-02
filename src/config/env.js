import 'dotenv/config';

/** Configuración leída del entorno (.env). Ver .env.example. */
export const env = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/quiztopia',
  jwtSecret: process.env.JWT_SECRET || 'cambia-este-secreto-en-produccion',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Orígenes extra que pueden llamar a la API desde el navegador (CORS). El propio servidor siempre puede.
  corsOrigins: (process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean),
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
};

if (env.isProduction && env.jwtSecret === 'cambia-este-secreto-en-produccion') {
  throw new Error('Define JWT_SECRET en el entorno antes de correr en producción.');
}
