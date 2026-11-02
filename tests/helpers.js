/* Entorno común de las pruebas: conecta a una base de PRUEBAS (nunca a la tuya)
   y la vuelve a sembrar antes de cada prueba.

   Base usada: MONGODB_URI_TEST, o si no existe, MONGODB_URI con "_test" al
   final del nombre de la base (quiztopia → quiztopia_test). */
import 'dotenv/config';

process.env.NODE_ENV = 'test';

function testUri() {
  if (process.env.MONGODB_URI_TEST) return process.env.MONGODB_URI_TEST;
  const base = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/quiztopia';
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '') || 'quiztopia';
  url.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;
  return url.toString();
}

const { default: request } = await import('supertest');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { createApp } = await import('../src/app.js');
const { seedDatabase, IDS } = await import('../src/seed/seed.js');
const models = await import('../src/models/index.js');

export { IDS, models };
export const app = createApp();
export const PASSWORD = 'quiztopia123';

export async function setup() {
  await connectDB(testUri());
}
export async function teardown() {
  await disconnectDB();
}
export async function reset() {
  await seedDatabase();
}

/** Cliente HTTP que conserva la cookie de sesión. as('ana') inicia sesión con ana@correo.com. */
export async function as(user) {
  const agent = request.agent(app);
  if (user) {
    const res = await agent.post('/api/auth/login').send({ email: `${user}@correo.com`, password: PASSWORD });
    if (res.status !== 200) throw new Error(`No se pudo iniciar sesión como ${user}: ${res.status}`);
  }
  return agent;
}

/** Entrada válida para el editor. */
export const sampleInput = (overrides = {}) => ({
  title: 'Química: estequiometría básica', description: 'Moles y masa molar.', categoryId: String(IDS.catQuimica),
  tagIds: [], timeLimit: 15,
  questions: [
    { text: '¿Masa molar del agua?', explanation: '2 + 16 = 18', options: [{ text: '16 g/mol' }, { text: '18 g/mol', isCorrect: true }] },
    { text: '¿Cuántos moles hay en 36 g de agua?', options: [{ text: '2 mol', isCorrect: true }, { text: '1 mol' }] },
  ],
  ...overrides,
});

/** Juega un intento completo respondiendo todo bien (o mal) y lo termina. */
export async function playQuiz(agent, quizId, { correct = true } = {}) {
  const { body: session } = await agent.post(`/api/quizzes/${quizId}/attempts`).expect(201);
  const quiz = await models.Quiz.findById(quizId);
  const version = await models.QuizVersion.findById(quiz.currentVersionId);
  for (const q of version.questions) {
    const ids = correct ? q.correctOptionIds() : [String(q.options.find((o) => !o.isCorrect)._id)];
    await agent.post(`/api/attempts/${session.attemptId}/answers`).send({ questionId: String(q._id), selectedOptionIds: ids }).expect(200);
  }
  const { body: result } = await agent.post(`/api/attempts/${session.attemptId}/finish`).send({}).expect(200);
  return { session, result };
}
