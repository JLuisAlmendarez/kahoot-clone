import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';

/* Punto de entrada: conecta a MongoDB y levanta el servidor HTTP. */
try {
  await connectDB();
  console.log(`[Quiztopia] Conectado a MongoDB (${env.mongoUri.replace(/\/\/[^@]*@/, '//***@')})`);
} catch (err) {
  console.error(`[Quiztopia] No se pudo conectar a MongoDB en ${env.mongoUri.replace(/\/\/[^@]*@/, "//***@")}`);
  console.error('  Revisa que Mongo esté corriendo y que MONGODB_URI en .env sea correcta.');
  console.error(`  Detalle: ${err.message}`);
  process.exit(1);
}

createApp().listen(env.port, () => {
  console.log(`[Quiztopia] Listo en http://localhost:${env.port}`);
});
