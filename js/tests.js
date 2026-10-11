/* ============================================================================
   tests.js — Pruebas que se corren desde la consola del navegador:
       await QT.test()            todas
       await QT.test('Attempt')   solo las que contengan ese texto
   Cada prueba usa una base nueva EN MEMORIA, así que no toca tus datos.
   También se pueden correr con Node:  node tests/run-node.js
   ========================================================================== */
(function (global) {
  'use strict';
  const QT = global.QT;

  // ------------------------------------------------------------ aserciones
  class AssertionError extends Error { constructor(m) { super(m); this.name = 'AssertionError'; } }
  const assert = (cond, msg = 'Se esperaba verdadero') => { if (!cond) throw new AssertionError(msg); };
  const equal = (actual, expected, msg) => {
    const a = JSON.stringify(actual); const e = JSON.stringify(expected);
    if (a !== e) throw new AssertionError(`${msg || 'Valores distintos'}: se esperaba ${e} y llegó ${a}`);
  };
  /** La promesa debe rechazar con ese status HTTP (número) o ese code (texto). */
  async function rejects(promise, expected, msg) {
    try { await promise; } catch (err) {
      const ok = typeof expected === 'number' ? err.status === expected : err.code === expected || err.name === expected;
      if (!ok) throw new AssertionError(`${msg || 'Error distinto'}: se esperaba ${expected} y llegó ${err.status || ''} ${err.code || err.name}: ${err.message}`);
      return err;
    }
    throw new AssertionError(`${msg || 'Se esperaba un error'} (${expected}) y la promesa se resolvió`);
  }
  function throws(fn, expected, msg) {
    try { fn(); } catch (err) {
      if (expected && err.code !== expected && err.name !== expected) throw new AssertionError(`${msg || 'Error distinto'}: se esperaba ${expected} y llegó ${err.code || err.name}`);
      return err;
    }
    throw new AssertionError(`${msg || 'Se esperaba una excepción'} (${expected})`);
  }

  // ------------------------------------------------- entorno de cada prueba
  async function makeEnv() {
    const db = new QT.MockDB({ storage: null, latency: [0, 0] });
    await QT.seed(db);
    const api = QT.createApi({ db, session: QT.memorySession() });
    const ids = QT.seed.ids;
    return { db, api, ids, as: (key) => api.session.set(key ? ids[key] : null) };
  }
  /** Respuestas correctas de una versión: { questionId: [optionIds] } */
  const correctMap = (version) => Object.fromEntries(version.questions.map((q) => [q._id, q.correctOptionIds()]));
  const sampleInput = (overrides = {}) => ({
    title: 'Química: estequiometría básica', description: 'Moles y masa molar.', categoryId: QT.seed.ids.catQuimica,
    tagIds: [], timeLimit: 15,
    questions: [
      { text: '¿Masa molar del agua?', explanation: '2 + 16 = 18', options: [{ text: '16 g/mol' }, { text: '18 g/mol', isCorrect: true }] },
      { text: '¿Cuántos moles hay en 36 g de agua?', options: [{ text: '2 mol', isCorrect: true }, { text: '1 mol' }] },
    ],
    ...overrides,
  });

  // ================================================================ pruebas
  const TESTS = [];
  const test = (group, name, fn) => TESTS.push({ group, name, fn });

  // ---------------- Núcleo: objetos, sincronía y asincronía ----------------
  test('Núcleo', 'ObjectId genera 1000 ids válidos y distintos', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => QT.ObjectId.generate()));
    equal(ids.size, 1000, 'ids repetidos');
    assert([...ids].every(QT.ObjectId.isValid), 'algún id no es de 24 hex');
  });
  test('Núcleo', 'ObjectId guarda la fecha de creación', () => {
    const d = new Date('2026-10-11T12:00:00Z');
    equal(QT.ObjectId.getTimestamp(QT.ObjectId.generate(d)).toISOString(), d.toISOString());
  });
  test('Núcleo', 'Validator junta todos los errores con su ruta', () => {
    const v = new QT.Validator('quiz').string('', 'title').integer(3.5, 'timeLimit').array([], 'questions', { min: 1 });
    equal(v.errors.map((e) => e.path), ['quiz.title', 'quiz.timeLimit', 'quiz.questions']);
    throws(() => v.throwIfErrors(), 'ValidationError');
  });
  test('Núcleo', 'El código síncrono corre antes que las promesas y los timers', async () => {
    const order = [];
    setTimeout(() => order.push('timeout'), 0);
    Promise.resolve().then(() => order.push('microtarea'));
    order.push('síncrono');
    await QT.sleep(5);
    equal(order, ['síncrono', 'microtarea', 'timeout']);
  });
  test('Núcleo', 'withTimeout rechaza con 504 cuando la promesa tarda (Promise.race)', async () => {
    await rejects(QT.withTimeout(QT.sleep(50), 10), 504);
    equal(await QT.withTimeout(Promise.resolve('ok'), 50), 'ok');
  });
  test('Núcleo', 'Promise.all corre en paralelo y Promise.allSettled no se detiene por un error', async () => {
    const t0 = Date.now();
    await Promise.all([QT.sleep(30), QT.sleep(30), QT.sleep(30)]);
    assert(Date.now() - t0 < 80, 'no corrió en paralelo');
    const r = await Promise.allSettled([Promise.resolve(1), Promise.reject(new Error('x')), Promise.resolve(3)]);
    equal(r.map((x) => x.status), ['fulfilled', 'rejected', 'fulfilled']);
  });
  test('Núcleo', 'addMonths respeta fin de mes', () => {
    equal(QT.addMonths(new Date(2027, 0, 31), 1).getDate(), 28);
    equal(QT.addMonths(new Date(2026, 9, 5), 3).getMonth(), 0);
  });

  // ---------------- Modelos (diagrama 1) ----------------
  test('Modelos', 'User rechaza usuario y correo inválidos', () => {
    const err = throws(() => new QT.models.User({ username: 'a b', email: 'no-es-correo', passwordHash: 'x'.repeat(30) }).validate(), 'ValidationError');
    equal(err.fields.map((f) => f.path).sort(), ['email', 'username']);
  });
  test('Modelos', 'hashPassword y checkPassword son asíncronos y comparan bien', async () => {
    const user = new QT.models.User({ username: 'prueba', email: 'p@correo.com', passwordHash: await QT.models.User.hashPassword('secreta123') });
    const pending = user.checkPassword('secreta123');
    assert(pending instanceof Promise, 'checkPassword debe devolver una promesa');
    assert(await pending, 'la contraseña correcta no coincide');
    assert(!(await user.checkPassword('otra')), 'una contraseña incorrecta coincidió');
  });
  test('Modelos', 'Question calcula multiple y exige una correcta y opciones distintas', () => {
    const { Question } = QT.models;
    const q = new Question({ position: 1, text: 'x', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: true }] });
    assert(q.multiple, 'debería ser de varias respuestas');
    const err = throws(() => new Question({ position: 1, text: 'x', options: [{ text: 'a' }, { text: 'A' }] }).validate(), 'ValidationError');
    equal(err.fields.map((f) => f.message), ['Marca al menos una opción correcta', 'Hay opciones repetidas']);
  });
  test('Modelos', 'Regla «todo o nada» al calificar', () => {
    const q = new QT.models.Question({ position: 1, text: 'x', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: true }, { text: 'c' }] });
    const [a, b, c] = q.options.map((o) => o._id);
    assert(q.isAnswerCorrect([b, a]), 'marcar todas las correctas debe valer');
    assert(!q.isAnswerCorrect([a]), 'faltó una correcta');
    assert(!q.isAnswerCorrect([a, b, c]), 'sobró una incorrecta');
  });
  test('Modelos', 'toPublic() no revela isCorrect ni la explicación', async () => {
    const { db, ids } = await makeEnv();
    const quiz = db.quizzes.findByIdSync(ids.aws);
    const pub = db.quizVersions.findByIdSync(quiz.currentVersionId).toPublic();
    const text = JSON.stringify(pub);
    assert(!text.includes('isCorrect') && !text.includes('explanation'), 'se filtró información de la respuesta');
  });
  test('Modelos', 'QuizVersion.build marca cambios y redacta el resumen', async () => {
    const { db, ids } = await makeEnv();
    const versions = db.quizVersions.all().filter((v) => v.quizId === ids.algebra).sort((a, b) => a.version - b.version);
    equal(versions.map((v) => v.version), [1, 2, 3]);
    equal(versions[2].changeSummary, 'Cambió la pregunta 1 y agregó la pregunta 10 · Límite de tiempo: 20 min → 30 min');
    equal(versions[2].questions.map((q) => q.change).filter((c) => c !== 'unchanged'), ['modified', 'new']);
  });
  test('Modelos', 'Quiz.publishVersion exige versiones consecutivas', async () => {
    const { db, ids } = await makeEnv();
    const quiz = db.quizzes.findByIdSync(ids.algebra);
    const wrong = new QT.models.QuizVersion({ quizId: quiz._id, version: 7, questions: [{ text: 'x', options: [{ text: 'a', isCorrect: true }, { text: 'b' }] }] });
    throws(() => quiz.publishVersion(wrong), 'VERSION_MISMATCH');
  });
  test('Modelos', 'softDelete programa la expiración a 3 meses', async () => {
    const { db, ids } = await makeEnv();
    const quiz = db.quizzes.findByIdSync(ids.git);
    const at = new Date('2026-10-11T12:00:00Z');
    equal(quiz.softDelete(at).toISOString(), QT.addMonths(at, 3).toISOString());
    throws(() => quiz.softDelete(at), 'QUIZ_DELETED');
  });
  test('Modelos', 'Attempt valida respuestas, tiempo y estado', async () => {
    const { db, ids } = await makeEnv();
    const quiz = db.quizzes.findByIdSync(ids.aws);
    const version = db.quizVersions.findByIdSync(quiz.currentVersionId);
    const user = db.users.findByIdSync(ids.luis);
    const t0 = new Date('2026-10-11T12:00:00Z');
    const attempt = QT.models.Attempt.start({ user, quiz, version, now: t0 });
    equal(attempt.deadlineAt.toISOString(), '2026-10-11T12:05:00.000Z');
    const [q1, q2] = version.questions;
    attempt.answer(version, q1._id, q1.correctOptionIds(), t0);
    throws(() => attempt.answer(version, q1._id, q1.correctOptionIds(), t0), 'ALREADY_ANSWERED');
    throws(() => attempt.answer(version, q2._id, ['ffffffffffffffffffffffff'], t0), 'INVALID_OPTION');
    throws(() => attempt.answer(version, q2._id, q2.correctOptionIds(), new Date('2026-10-11T12:06:00Z')), 'TIME_UP');
    const result = attempt.finish(null, new Date('2026-10-11T12:06:00Z'));
    equal(result, { score: 1, total: 4, percentage: 25, timedOut: true });
    throws(() => attempt.answer(version, q2._id, q2.correctOptionIds(), t0), 'ATTEMPT_CLOSED');
  });

  // ---------------- Base simulada ----------------
  test('Base', 'Todas las operaciones devuelven promesas', async () => {
    const { db } = await makeEnv();
    const p = db.users.find();
    assert(p instanceof Promise, 'find debe ser asíncrono');
    equal((await p).length, 4);
  });
  test('Base', 'Índice único: username repetido lanza error 11000', async () => {
    const { db } = await makeEnv();
    const u = new QT.models.User({ username: 'ANA_DEV', email: 'otra@correo.com', passwordHash: 'x'.repeat(30) });
    const err = await rejects(db.users.insertOne(u), 'DuplicateKeyError');
    equal(err.code, 11000);
  });
  test('Base', 'Una transacción que falla no deja cambios a medias', async () => {
    const { db, ids } = await makeEnv();
    const before = db.quizzes.findByIdSync(ids.aws).likesCount;
    await rejects(db.transaction(async () => {
      await db.quizzes.updateOne(ids.aws, (q) => { q.likesCount += 100; });
      throw new Error('falla a la mitad');
    }), 'Error');
    equal(db.quizzes.findByIdSync(ids.aws).likesCount, before);
  });
  test('Base', '20 incrementos en paralelo no pierden ninguno ($inc atómico)', async () => {
    const db = new QT.MockDB({ latency: [1, 15] });
    await QT.seed(db);
    const id = QT.seed.ids.osi;
    const before = db.quizzes.findByIdSync(id).likesCount;
    await Promise.all(Array.from({ length: 20 }, () => db.quizzes.updateOne(id, (q) => { q.likesCount += 1; })));
    equal(db.quizzes.findByIdSync(id).likesCount, before + 20);
  });
  test('Base', 'TTL borra lo que ya venció', async () => {
    const { db, ids } = await makeEnv();
    const removed = db.sweepExpired(new Date('2027-02-01T00:00:00Z'));
    assert(removed > 0, 'no borró nada');
    assert(!db.quizzes.findByIdSync(ids.fisica), 'el quiz vencido sigue ahí');
    assert(db.quizzes.findByIdSync(ids.algebra), 'borró un quiz vigente');
  });

  // ---------------- API: sesión ----------------
  test('API · sesión', 'Login con contraseña incorrecta o correo inexistente da el mismo 401', async () => {
    const { api } = await makeEnv();
    const a = await rejects(api.auth.login({ email: 'ana@correo.com', password: 'mala' }), 401);
    const b = await rejects(api.auth.login({ email: 'nadie@correo.com', password: 'mala' }), 401);
    equal(a.message, b.message, 'los mensajes revelan si el correo existe');
  });
  test('API · sesión', 'Registro: 409 si el usuario existe, 400 si la contraseña es corta', async () => {
    const { api } = await makeEnv();
    const dup = await rejects(api.auth.register({ username: 'ana_dev', email: 'x@correo.com', password: 'quiztopia123' }), 409);
    equal(dup.fields[0].path, 'username');
    await rejects(api.auth.register({ username: 'nuevo', email: 'n@correo.com', password: '123' }), 400);
    const ok = await api.auth.register({ username: 'Nuevo_User', email: 'N@Correo.com', password: 'quiztopia123' });
    equal(ok.user.username, 'nuevo_user');
    equal((await api.auth.me()).username, 'nuevo_user');
  });
  test('API · sesión', 'Sin sesión: me() es null y crear quiz da 401', async () => {
    const { api } = await makeEnv();
    equal(await api.auth.me(), null);
    await rejects(api.quizzes.create(sampleInput()), 401);
  });

  // ---------------- API: catálogo ----------------
  test('API · catálogo', 'Filtros de búsqueda y calificadores ignorados', async () => {
    const { api } = await makeEnv();
    const mates = await api.quizzes.search({ q: 'categoria:matematicas' });
    assert(mates.items.length === 2 && mates.items.every((q) => q.category.slug === 'matematicas'), 'categoria: falló');
    equal((await api.quizzes.search({ q: 'autor:@luis_m' })).total, 2);
    equal((await api.quizzes.search({ q: 'etiqueta:aws' })).items[0].title, 'AWS Cloud Practitioner: servicios básicos');
    assert((await api.quizzes.search({ q: 'preguntas:>=6' })).items.every((q) => q.questionCount >= 6), 'preguntas: falló');
    equal((await api.quizzes.search({ q: 'matrices nivel:basico' })).ignored, ['nivel:basico']);
    equal((await api.quizzes.search({ q: 'MATRICES' })).total, 1, 'la búsqueda debe ignorar mayúsculas');
  });
  test('API · catálogo', 'sort:populares ordena por likes y los borrados no aparecen', async () => {
    const { api } = await makeEnv();
    const r = await api.quizzes.search({ q: 'sort:populares', limit: 50 });
    const likes = r.items.map((q) => q.likesCount);
    equal(likes, [...likes].sort((a, b) => b - a));
    assert(!r.items.some((q) => q.title.startsWith('Física')), 'apareció un quiz eliminado');
  });
  test('API · catálogo', 'Paginación con page y limit', async () => {
    const { api } = await makeEnv();
    const p2 = await api.quizzes.search({ page: 2, limit: 3 });
    equal([p2.page, p2.totalPages, p2.items.length, p2.total], [2, 3, 3, 7]);
  });

  // ---------------- API: detalle, likes y versiones ----------------
  test('API · detalle', 'Permisos de quien ve el quiz', async () => {
    const { api, as } = await makeEnv();
    as('ana');
    const d = await api.quizzes.get('q-algebra');
    equal([d.isOwner, d.completed, d.likedByMe, d.canLike, d.canComment], [false, true, true, true, true]);
    as(null);
    const v = await api.quizzes.get('q-algebra');
    equal([v.canLike, v.canComment], [false, false]);
    await rejects(api.quizzes.get('q-fisica'), 404, 'un quiz borrado debe dar 404');
  });
  test('API · detalle', 'Like: exige haber completado, no al propio quiz, y suma una sola vez', async () => {
    const { api, as } = await makeEnv();
    as('ana');
    await rejects(api.quizzes.like('q-python'), 403);
    await rejects(api.quizzes.like('q-git'), 403);
    const before = (await api.quizzes.get('q-aws')).likesCount;
    await api.quizzes.like('q-aws');
    const again = await api.quizzes.like('q-aws');
    equal(again.likesCount, before + 1, 'el segundo like no debe sumar');
    equal((await api.quizzes.unlike('q-aws')).likesCount, before);
  });
  test('API · detalle', 'Versiones y snapshot: isCorrect solo para el dueño', async () => {
    const { api, as } = await makeEnv();
    as('ana');
    const versions = await api.quizzes.versions('q-algebra');
    equal(versions.map((v) => [v.version, v.isCurrent]), [[3, true], [2, false], [1, false]]);
    const snap = await api.quizzes.version(versions[1].versionId);
    assert(!JSON.stringify(snap).includes('isCorrect'), 'un no dueño vio las respuestas');
    as('luis');
    const own = await api.quizzes.version(versions[1].versionId);
    assert(own.questions[0].options.some((o) => o.isCorrect), 'el dueño no ve las correctas');
  });

  // ---------------- API: jugar y revisar ----------------
  test('API · jugar', 'Flujo completo: iniciar, responder, terminar y revisar', async () => {
    const { api, db, as } = await makeEnv();
    as('luis');
    const before = (await api.quizzes.get('q-aws')).playCount;
    const s = await api.attempts.start('q-aws');
    assert(!JSON.stringify(s).includes('isCorrect'), 'la sesión de juego reveló respuestas');
    const version = db.quizVersions.findByIdSync(db.quizzes.findByIdSync(QT.seed.ids.aws).currentVersionId);
    const correct = correctMap(version);
    const [q1, q2, q3] = s.questions;
    const fb1 = await api.attempts.answer(s.attemptId, { questionId: q1.questionId, selectedOptionIds: correct[q1.questionId] });
    equal([fb1.isCorrect, fb1.answered, fb1.total], [true, 1, 4]);
    const fb2 = await api.attempts.answer(s.attemptId, { questionId: q2.questionId, selectedOptionIds: correct[q2.questionId].slice(0, 1) });
    assert(!fb2.isCorrect, 'una respuesta incompleta se calificó como correcta');
    await rejects(api.attempts.answer(s.attemptId, { questionId: q1.questionId, selectedOptionIds: correct[q1.questionId] }), 409);
    await api.attempts.answer(s.attemptId, { questionId: q3.questionId, selectedOptionIds: correct[q3.questionId] });
    const fin = await api.attempts.finish(s.attemptId);
    equal([fin.score, fin.total, fin.timedOut], [2, 4, false]);
    const review = await api.attempts.review(s.attemptId);
    equal(review.questions.map((q) => q.status), ['correct', 'wrong', 'correct', 'unanswered']);
    equal((await api.quizzes.get('q-aws')).playCount, before + 1);
  });
  test('API · jugar', 'Cerrar la pestaña (sendBeacon) deja el intento interrumpido y sin revisión', async () => {
    const { api, as } = await makeEnv();
    as('luis');
    const s = await api.attempts.start('q-osi');
    assert(api.attempts.abandonBeacon(s.attemptId), 'no se marcó como interrumpido');
    await rejects(api.attempts.review(s.attemptId), 'ATTEMPT_ABANDONED');
    await rejects(api.attempts.play(s.attemptId), 409);
  });
  test('API · jugar', 'Nadie puede ver ni responder intentos ajenos', async () => {
    const { api, as } = await makeEnv();
    as('luis');
    await rejects(api.attempts.review('a-aws-1'), 403);
  });

  // ---------------- API: crear, editar y borrar ----------------
  test('API · editor', 'Crear: errores con la ruta del campo', async () => {
    const { api, as } = await makeEnv();
    as('ana');
    const bad = sampleInput({ questions: [{ text: 'x', options: [{ text: 'a' }, { text: 'b' }] }] });
    const err = await rejects(api.quizzes.create(bad), 400);
    equal(err.fields.map((f) => f.path), ['questions.0.options']);
  });
  test('API · editor', 'Crear: el quiz aparece en el catálogo con versión 1', async () => {
    const { api, as } = await makeEnv();
    as('ana');
    const r = await api.quizzes.create(sampleInput());
    equal([r.version, r.versionCreated], [1, true]);
    const found = await api.quizzes.search({ q: 'estequiometria' });
    equal(found.items[0].questionCount, 2);
  });
  test('API · editor', 'Editar solo el título no crea versión; editar preguntas sí', async () => {
    const { api, as } = await makeEnv();
    as('ana');
    const data = await api.quizzes.getForEdit('q-git');
    const r1 = await api.quizzes.update('q-git', { ...data, title: 'Git desde cero (2026)' });
    equal([r1.version, r1.versionCreated], [1, false]);
    data.questions[0].text = '¿Qué comando inicia un repositorio?';
    const r2 = await api.quizzes.update('q-git', data);
    equal([r2.version, r2.versionCreated], [2, true]);
    const versions = await api.quizzes.versions('q-git');
    equal(versions[0].changeSummary, 'Cambió la pregunta 1');
  });
  test('API · editor', 'Un intento viejo se sigue revisando con su versión', async () => {
    const { api, as } = await makeEnv();
    as('ana');
    const review = await api.attempts.review('a-algebra-1');
    equal([review.version, review.isCurrentVersion, review.total, review.score], [2, false, 9, 6]);
    equal(review.questions[0].text, '¿Qué matrices son **invertibles**?');
  });
  test('API · editor', 'Solo el dueño puede editar o borrar', async () => {
    const { api, as } = await makeEnv();
    as('ana');
    await rejects(api.quizzes.getForEdit('q-algebra'), 403);
    await rejects(api.quizzes.remove('q-algebra'), 403);
  });
  test('API · editor', 'Borrar: sale del catálogo, los intentos siguen 3 meses y luego el TTL limpia todo', async () => {
    const { api, db, as } = await makeEnv();
    as('luis');
    const r = await api.quizzes.remove('q-algebra');
    equal((await api.quizzes.search({ q: 'matrices' })).total, 0);
    as('ana');
    const review = await api.attempts.review('a-algebra-2');
    equal([review.quiz.deleted, review.quiz.expiresAt], [true, r.expiresAt]);
    db.sweepExpired(new Date(new Date(r.expiresAt).getTime() + 1000));
    const left = db.attempts.all().concat(db.comments.all(), db.quizVersions.all()).filter((d) => d.quizId === QT.seed.ids.algebra);
    equal(left.length, 0, 'quedaron documentos del quiz borrado');
  });

  // ---------------- API: foro e historial ----------------
  test('API · foro', 'Solo comenta quien completó el quiz; responder una respuesta se queda en 2 niveles', async () => {
    const { api, as } = await makeEnv();
    as('luis');
    await rejects(api.comments.create('q-aws', { body: 'Hola' }), 403);
    as('ana');
    const page = await api.comments.list('q-algebra');
    equal([page.items.length, page.total, page.totalPages], [3, 5, 2]);
    const thread = page.items.find((c) => c.replyCount === 2) || (await api.comments.list('q-algebra', { page: 2 })).items.find((c) => c.replyCount === 2);
    const replies = await api.comments.replies(thread.commentId);
    const reply = await api.comments.create('q-algebra', { body: 'Gracias', parentId: replies.items[0].commentId });
    equal(reply.parentId, thread.commentId);
  });
  test('API · foro', 'Borrar un comentario con respuestas lo deja como [eliminado]', async () => {
    const { api, as } = await makeEnv();
    as('ana');
    const mine = (await api.comments.list('q-algebra')).items.find((c) => c.isMine);
    as('luis');
    await api.comments.create('q-algebra', { body: 'Buena idea', parentId: mine.commentId });
    await rejects(api.comments.remove(mine.commentId), 403, 'borró un comentario ajeno');
    as('ana');
    equal((await api.comments.remove(mine.commentId)).softDeleted, true);
  });
  test('API · foro', 'Más de 10 comentarios por minuto da 429', async () => {
    const { api, as } = await makeEnv();
    as('ana');
    for (let i = 0; i < 10; i++) await api.comments.create('q-algebra', { body: `Comentario ${i}` });
    await rejects(api.comments.create('q-algebra', { body: 'Uno más' }), 429);
  });
  test('API · perfil', 'Historial agrupado por quiz con los estados correctos', async () => {
    const { api, as } = await makeEnv();
    as('ana');
    const h = await api.attempts.history();
    equal([h.totalQuizzes, h.totalAttempts], [4, 5]);
    const fisica = h.groups.find((g) => g.quiz.title.startsWith('Física'));
    assert(fisica.quiz.deleted && fisica.quiz.expiresAt, 'falta el aviso de quiz eliminado');
    const statuses = h.groups.flatMap((g) => g.attempts.map((a) => a.status));
    assert(statuses.includes('abandoned') && statuses.includes('completed'), 'faltan estados');
    equal((await api.quizzes.mine()).map((q) => q.title).sort(), ['GCP: IAM y proyectos', 'Git desde cero']);
  });

  // ================================================================ runner
  async function run(filter = '') {
    const selected = TESTS.filter((t) => !filter || `${t.group} ${t.name}`.toLowerCase().includes(String(filter).toLowerCase()));
    const prevLog = QT.log.enabled;
    QT.log.enabled = false;
    const results = [];
    const t0 = Date.now();
    for (const t of selected) {
      const start = Date.now();
      try {
        await t.fn();
        results.push({ grupo: t.group, prueba: t.name, ok: true, ms: Date.now() - start });
      } catch (err) {
        results.push({ grupo: t.group, prueba: t.name, ok: false, ms: Date.now() - start, error: err });
      }
    }
    QT.log.enabled = prevLog;
    const failed = results.filter((r) => !r.ok);
    const groups = [...new Set(results.map((r) => r.grupo))];
    const isNode = typeof window === 'undefined';
    if (isNode) {
      for (const g of groups) {
        console.log(`\n${g}`);
        results.filter((r) => r.grupo === g).forEach((r) => console.log(`  ${r.ok ? '✔' : '✘'} ${r.prueba}${r.ok ? '' : `\n      → ${r.error.message}`}`));
      }
      console.log(`\n${results.length - failed.length}/${results.length} pruebas pasaron en ${Date.now() - t0} ms`);
    } else {
      console.group(`%cPruebas de Quiztopia: ${results.length - failed.length}/${results.length} pasaron (${Date.now() - t0} ms)`,
        `font-weight:700;color:${failed.length ? '#b91c1c' : '#15803d'}`);
      for (const g of groups) {
        const rows = results.filter((r) => r.grupo === g);
        const bad = rows.some((r) => !r.ok);
        (bad ? console.group : console.groupCollapsed)(`${bad ? '✘' : '✔'} ${g} (${rows.filter((r) => r.ok).length}/${rows.length})`);
        rows.forEach((r) => (r.ok ? console.log(`%c✔%c ${r.prueba} %c${r.ms} ms`, 'color:#15803d', '', 'color:#6b7280') : console.error(`✘ ${r.prueba}\n`, r.error)));
        console.groupEnd();
      }
      console.groupEnd();
    }
    return { passed: results.length - failed.length, failed: failed.length, results };
  }

  QT.test = run;
  QT.testing = { assert, equal, rejects, throws, makeEnv, TESTS };
})(typeof window !== 'undefined' ? window : globalThis);
