/* ============================================================================
   seed/seed.js — Borra la base y carga los datos de ejemplo.
     npm run seed
   Usuarios: ana@correo.com, luis@correo.com, ricardo@correo.com, gael@correo.com
   Administrador: admin@correo.com
   Contraseña de todos: quiztopia123

   likesCount, playCount y attemptCount arrancan con valores que simulan la
   actividad de otros usuarios; a partir de ahí cambian con cada acción.
   ========================================================================== */
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { User, Category, Quiz, QuizVersion, Attempt, Like, Comment } from '../models/index.js';
import { AttemptStatus, slugify } from '../shared/rules.js';
import { USERS, PASSWORD, CATEGORIES, QUIZZES } from './data.js';

/** ObjectId fijo y legible: tipo + número (así los enlaces de ejemplo no cambian entre siembras). */
const oid = (kind, n) => new mongoose.Types.ObjectId(('66f0' + kind).padEnd(20, '0') + n.toString(16).padStart(4, '0'));
const D = (isoDate) => new Date(isoDate);

export const IDS = {
  ana: oid('a', 1), luis: oid('a', 2), ricardo: oid('a', 3), gael: oid('a', 4), admin: oid('a', 5),
  aws: oid('c', 1), python: oid('c', 2), algebra: oid('c', 3), derivadas: oid('c', 4),
  osi: oid('c', 5), git: oid('c', 6), gcp: oid('c', 7),
  borrado: oid('c', 8), // id de un quiz que no existe (para probar el 404)
  catCertificaciones: oid('b', 1), catProgramacion: oid('b', 2), catMatematicas: oid('b', 3),
  catQuimica: oid('b', 4), catFisica: oid('b', 5), catBiologia: oid('b', 6),
};

/** Intento ya respondido. picks[i] = índices marcados en la pregunta i (undefined = sin responder). */
function playedAttempt({ id, user, quiz, version, startedAt, minutes, picks, status = AttemptStatus.COMPLETED, timedOut = false }) {
  const start = D(startedAt);
  const answers = [];
  let score = 0;
  version.questions.forEach((q, i) => {
    if (!picks[i]) return;
    const ids = picks[i].map((k) => q.options[k]._id);
    const isCorrect = q.isAnswerCorrect(ids);
    if (isCorrect) score += 1;
    answers.push({ questionId: q._id, selectedOptionIds: ids, isCorrect, answeredAt: new Date(start.getTime() + (i + 1) * 40000) });
  });
  return {
    _id: id, userId: user._id, quizId: quiz._id, versionId: version._id, version: version.version,
    total: version.questionCount, startedAt: start, status, timedOut, score, answers,
    deadlineAt: version.timeLimit ? new Date(start.getTime() + version.timeLimit * 60000) : null,
    finishedAt: new Date(start.getTime() + minutes * 60000),
  };
}

/** Vacía las colecciones y carga los datos de ejemplo. Requiere una conexión abierta. */
export async function seedDatabase() {
  await Promise.all([User, Category, Quiz, QuizVersion, Attempt, Like, Comment].map((m) => m.deleteMany({})));

  // ---------------------------------------------------------- usuarios
  const passwordHash = await User.hashPassword(PASSWORD);
  const users = {};
  for (const [key, u] of Object.entries(USERS)) {
    users[key] = new User({ _id: IDS[key], ...u, createdAt: D(u.createdAt), passwordHash });
  }
  await User.insertMany(Object.values(users));

  // -------------------------------------------------------- categorías
  const categories = {};
  CATEGORIES.forEach(([name, tags], i) => {
    categories[name] = new Category({ _id: oid('b', i + 1), name, slug: slugify(name), tags: tags.map((t) => ({ name: t, slug: slugify(t) })) });
  });
  await Category.insertMany(Object.values(categories));
  const tagBySlug = (slug) => {
    for (const c of Object.values(categories)) { const t = c.tags.find((x) => x.slug === slug); if (t) return t; }
    throw new Error(`Etiqueta no encontrada: ${slug}`);
  };

  // ------------------------------------------------ quizzes y versiones
  const quizzes = {};
  const versions = {};
  const allVersions = [];
  for (const [key, owner, cat, tags, title, description, vs, likes, plays] of QUIZZES) {
    const quiz = new Quiz({
      _id: IDS[key], owner: users[owner].toRef(), title, description, category: categories[cat].toRef(),
      tags: tags.map((s) => { const t = tagBySlug(s); return { tagId: t._id, name: t.name, slug: t.slug }; }),
      likesCount: likes, playCount: plays, createdAt: D(vs[0].at),
    });
    versions[key] = [];
    let previous = null;
    for (const v of vs) {
      const version = QuizVersion.build({ quizId: quiz._id, previous, questions: v.questions, timeLimit: v.timeLimit, now: D(v.at) });
      version.attemptCount = v.attempts ?? plays;
      await version.validate(); // calcula questionCount, multiple y hasMultiple
      quiz.applyVersion(version);
      quiz.updatedAt = D(v.at);
      versions[key].push(version);
      allVersions.push(version);
      previous = version;
    }
    quizzes[key] = quiz;
  }

  await QuizVersion.insertMany(allVersions);
  await Quiz.insertMany(Object.values(quizzes));

  // ---------------------------------------------------------- intentos
  const [, algV2, algV3] = versions.algebra;
  await Attempt.insertMany([
    playedAttempt({ id: oid('e', 1), user: users.ana, quiz: quizzes.algebra, version: algV2, startedAt: '2026-09-28T16:05:00Z', minutes: 20, timedOut: true,
      picks: [[1, 2], [0], [1], [0], [0], [0], [0], [1]] }),          // 6/9, la P9 sin responder
    playedAttempt({ id: oid('e', 2), user: users.ana, quiz: quizzes.algebra, version: algV3, startedAt: '2026-10-06T00:20:00Z', minutes: 22,
      picks: [[0, 2], [0], [0], [0], [0], [0], [0], [1], [0], [0]] }), // 8/10
    playedAttempt({ id: oid('e', 3), user: users.ana, quiz: quizzes.aws, version: versions.aws[0], startedAt: '2026-10-09T18:00:00Z', minutes: 5, timedOut: true,
      picks: [[0], [0, 3], [0]] }),                                     // 2/4, la P4 sin responder
    playedAttempt({ id: oid('e', 4), user: users.ana, quiz: quizzes.derivadas, version: versions.derivadas[0], startedAt: '2026-10-08T15:00:00Z', minutes: 3,
      status: AttemptStatus.ABANDONED, picks: [[0], [0]] }),
    // Intentos de otros usuarios (habilitan sus comentarios en el foro)
    playedAttempt({ id: oid('e', 6), user: users.gael, quiz: quizzes.algebra, version: algV3, startedAt: '2026-09-30T20:00:00Z', minutes: 25, picks: Array(10).fill([0]) }),
    playedAttempt({ id: oid('e', 7), user: users.ricardo, quiz: quizzes.algebra, version: algV3, startedAt: '2026-09-30T21:00:00Z', minutes: 18, picks: Array(10).fill([0]) }),
  ]);

  await Like.create({ _id: oid('f', 1), userId: users.ana._id, quizId: quizzes.algebra._id, createdAt: D('2026-10-06T00:45:00Z') });

  // ------------------------------------------------- foro de Álgebra lineal
  const c = (n, author, body, at, parent = null, extra = {}) => ({
    _id: oid('1', n), quizId: quizzes.algebra._id, parentId: parent, author: users[author].toRef(), body, createdAt: D(at), ...extra,
  });
  await Comment.insertMany([
    c(1, 'gael', 'No entiendo la pregunta 4, ¿por qué una matriz con determinante 0 no tiene inversa?', '2026-10-01T16:30:00Z', null, { replyCount: 2 }),
    c(2, 'ricardo', 'Porque `A⁻¹ = adj(A) / det(A)` y no se puede dividir entre 0.', '2026-10-01T17:02:00Z', oid('1', 1)),
    c(3, 'luis', 'Exacto. Agregué esa explicación en la versión 3 👍', '2026-10-01T18:15:00Z', oid('1', 1)),
    c(4, 'ana', 'Muy buen repaso. Me faltaría una pregunta sobre **matrices ortogonales**.', '2026-10-06T01:00:00Z'),
    c(5, 'gael', '', '2026-10-03T20:00:00Z', null, { deleted: true, replyCount: 1 }),
    c(6, 'luis', 'Creo que se refería a la pregunta 2.', '2026-10-03T21:00:00Z', oid('1', 5)),
    c(7, 'ricardo', 'Recuerden que en la pregunta 1 hay que marcar **todas** las correctas.', '2026-10-07T15:00:00Z'),
    c(8, 'luis', 'Ya está la versión 3 con 30 minutos de límite.', '2026-09-25T18:05:00Z'),
  ]);

  return { users: Object.keys(users).length, quizzes: Object.keys(quizzes).length, versions: allVersions.length };
}

// ------------------------------------------- ejecución desde la terminal
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { connectDB, disconnectDB } = await import('../config/db.js');
  const { env } = await import('../config/env.js');
  try {
    await connectDB();
    const r = await seedDatabase();
    console.log(`[seed] Listo en ${env.mongoUri}: ${r.users} usuarios, ${r.quizzes} quizzes, ${r.versions} versiones.`);
    console.log(`[seed] Entra con ana@correo.com · contraseña: ${PASSWORD}`);
  } catch (err) {
    console.error('[seed] Falló:', err.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}
