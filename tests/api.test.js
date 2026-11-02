/* Pruebas de la API contra MongoDB real (ver tests/helpers.js para la base que usan).
     npm test
   Cada prueba arranca con los datos de ejemplo recién sembrados. */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { app, as, setup, teardown, reset, IDS, models, sampleInput, playQuiz } from './helpers.js';
import request from 'supertest';

const { Quiz, QuizVersion, Attempt, Like, Comment } = models;
const id = (key) => String(IDS[key]);
const ATTEMPT = { algebra1: '66f0e000000000000000' + '0001', algebra2: '66f0e000000000000000' + '0002', aws1: '66f0e000000000000000' + '0003' };

before(setup);
after(teardown);
beforeEach(reset);

// ======================================================================
describe('Modelos', () => {
  it('QuizVersion.build marca cambios y redacta el resumen', async () => {
    const versions = await QuizVersion.find({ quizId: IDS.algebra }).sort({ version: 1 });
    assert.deepEqual(versions.map((v) => v.version), [1, 2, 3]);
    assert.equal(versions[2].changeSummary, 'Cambió la pregunta 1 y agregó la pregunta 10 · Límite de tiempo: 20 min → 30 min');
    assert.deepEqual(versions[2].questions.map((q) => q.change).filter((c) => c !== 'unchanged'), ['modified', 'new']);
  });

  it('Regla «todo o nada» al calificar', async () => {
    const version = await QuizVersion.findOne({ quizId: IDS.aws });
    const q = version.questions[1]; // tres correctas de cuatro
    const correct = q.correctOptionIds();
    assert.equal(correct.length, 3);
    assert.ok(q.isAnswerCorrect([...correct].reverse()));
    assert.ok(!q.isAnswerCorrect(correct.slice(0, 2)), 'faltó una correcta');
    assert.ok(!q.isAnswerCorrect(q.options.map((o) => String(o._id))), 'sobró una incorrecta');
  });

  it('La pregunta exige una opción correcta y opciones distintas', async () => {
    const message = async (options) => {
      const err = await QuizVersion.build({ quizId: IDS.git, questions: [{ text: 'x', options }] }).validate().catch((e) => e);
      return err.errors['questions.0.options'].message;
    };
    assert.equal(await message([{ text: 'a' }, { text: 'b' }]), 'Marca al menos una opción correcta');
    assert.equal(await message([{ text: 'a', isCorrect: true }, { text: 'A' }]), 'Hay opciones repetidas');
  });

  it('toPublic() no revela isCorrect ni la explicación', async () => {
    const v = await QuizVersion.findOne({ quizId: IDS.aws });
    const text = JSON.stringify(v.toPublic());
    assert.ok(!text.includes('isCorrect') && !text.includes('explanation'));
  });
});

// ======================================================================
describe('API · sesión', () => {
  it('Login con contraseña incorrecta o correo inexistente da el mismo 401', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'ana@correo.com', password: 'mala' }).expect(401);
    const b = await request(app).post('/api/auth/login').send({ email: 'nadie@correo.com', password: 'mala' }).expect(401);
    assert.equal(a.body.error.message, b.body.error.message);
  });

  it('Registro: 409 si el usuario existe, 400 si la contraseña es corta, y deja la sesión iniciada', async () => {
    const dup = await request(app).post('/api/auth/register').send({ username: 'ana_dev', email: 'x@correo.com', password: 'quiztopia123' }).expect(409);
    assert.equal(dup.body.error.fields[0].path, 'username');
    const short = await request(app).post('/api/auth/register').send({ username: 'nuevo', email: 'n@correo.com', password: '123' }).expect(400);
    assert.equal(short.body.error.fields[0].path, 'password');
    const agent = await as(null);
    const ok = await agent.post('/api/auth/register').send({ username: 'Nuevo_User', email: ' N@Correo.com ', password: 'quiztopia123' }).expect(201);
    assert.equal(ok.body.user.username, 'nuevo_user');
    assert.equal((await agent.get('/api/auth/me')).body.username, 'nuevo_user');
    // El correo se guarda igual que se busca en el login
    await request(app).post('/api/auth/login').send({ email: 'n@correo.com', password: 'quiztopia123' }).expect(200);
  });

  it('La cookie de sesión es httpOnly y logout la borra', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'ana@correo.com', password: 'quiztopia123' }).expect(200);
    assert.match(res.headers['set-cookie'][0], /HttpOnly/i);
    assert.ok(!JSON.stringify(res.body).includes('passwordHash'));
    const agent = await as('ana');
    await agent.post('/api/auth/logout').expect(200);
    assert.equal((await agent.get('/api/auth/me')).body, null);
  });

  it('Sin sesión: me es null y crear quiz da 401', async () => {
    assert.equal((await request(app).get('/api/auth/me').expect(200)).body, null);
    await request(app).post('/api/quizzes').send(sampleInput()).expect(401);
  });
});

// ======================================================================
describe('API · catálogo', () => {
  const search = (q, extra = {}) => request(app).get('/api/quizzes').query({ q, ...extra }).expect(200).then((r) => r.body);

  it('Filtros de búsqueda y calificadores ignorados', async () => {
    const mates = await search('categoria:matematicas');
    assert.ok(mates.items.length === 2 && mates.items.every((q) => q.category.slug === 'matematicas'));
    assert.equal((await search('autor:@luis_m')).total, 2);
    assert.equal((await search('etiqueta:aws')).items[0].title, 'AWS Cloud Practitioner: servicios básicos');
    assert.ok((await search('preguntas:>=6')).items.every((q) => q.questionCount >= 6));
    assert.deepEqual((await search('matrices nivel:basico')).ignored, ['nivel:basico']);
    assert.equal((await search('MATRICES')).total, 1, 'ignora mayúsculas');
    assert.equal((await search('álgebra')).total, 1, 'ignora acentos');
  });

  it('sort:populares ordena por likes y los borrados no aparecen', async () => {
    const r = await search('sort:populares', { limit: 50 });
    const likes = r.items.map((q) => q.likesCount);
    assert.deepEqual(likes, [...likes].sort((a, b) => b - a));
    assert.ok(!r.items.some((q) => q.title.startsWith('Física')));
  });

  it('Paginación con page y limit (acotados)', async () => {
    const p2 = await search('', { page: 2, limit: 3 });
    assert.deepEqual([p2.page, p2.totalPages, p2.items.length, p2.total], [2, 3, 3, 7]);
    const weird = await search('', { page: -4, limit: 9999 });
    assert.deepEqual([weird.page, weird.items.length], [1, 7]);
  });
});

// ======================================================================
describe('API · detalle y likes', () => {
  it('Permisos de quien ve el quiz', async () => {
    const ana = await as('ana');
    const d = (await ana.get(`/api/quizzes/${id('algebra')}`).expect(200)).body;
    assert.deepEqual([d.isOwner, d.completed, d.likedByMe, d.canLike, d.canComment], [false, true, true, true, true]);
    const v = (await request(app).get(`/api/quizzes/${id('algebra')}`).expect(200)).body;
    assert.deepEqual([v.canLike, v.canComment], [false, false]);
    await request(app).get(`/api/quizzes/${id('borrado')}`).expect(404);
    await request(app).get('/api/quizzes/no-es-un-id').expect(404);
  });

  it('Like: exige haber completado, no al propio quiz, y suma una sola vez', async () => {
    const ana = await as('ana');
    await ana.post(`/api/quizzes/${id('python')}/likes`).expect(403);
    await ana.post(`/api/quizzes/${id('git')}/likes`).expect(403);
    const before = (await ana.get(`/api/quizzes/${id('aws')}`)).body.likesCount;
    await ana.post(`/api/quizzes/${id('aws')}/likes`).expect(200);
    const again = (await ana.post(`/api/quizzes/${id('aws')}/likes`).expect(200)).body;
    assert.equal(again.likesCount, before + 1);
    assert.equal((await ana.delete(`/api/quizzes/${id('aws')}/likes`).expect(200)).body.likesCount, before);
    assert.equal((await ana.delete(`/api/quizzes/${id('aws')}/likes`).expect(200)).body.likesCount, before, 'quitar dos veces no resta dos');
  });

  it('Versiones y snapshot: isCorrect solo para el dueño', async () => {
    const ana = await as('ana');
    const versions = (await ana.get(`/api/quizzes/${id('algebra')}/versions`).expect(200)).body;
    assert.deepEqual(versions.map((v) => [v.version, v.isCurrent]), [[3, true], [2, false], [1, false]]);
    const snap = (await ana.get(`/api/versions/${versions[1].versionId}`).expect(200)).body;
    assert.ok(!JSON.stringify(snap).includes('isCorrect'));
    const luis = await as('luis');
    const own = (await luis.get(`/api/versions/${versions[1].versionId}`).expect(200)).body;
    assert.ok(own.questions[0].options.some((o) => o.isCorrect));
  });
});

// ======================================================================
describe('API · jugar', () => {
  it('Flujo completo: iniciar, responder, terminar y revisar', async () => {
    const luis = await as('luis');
    const before = (await luis.get(`/api/quizzes/${id('aws')}`)).body.playCount;
    const s = (await luis.post(`/api/quizzes/${id('aws')}/attempts`).expect(201)).body;
    assert.ok(!JSON.stringify(s).includes('isCorrect'));
    const version = await QuizVersion.findById((await Quiz.findById(IDS.aws)).currentVersionId);
    const correct = Object.fromEntries(version.questions.map((q) => [String(q._id), q.correctOptionIds()]));
    const [q1, q2, q3] = s.questions;
    const answer = (q, ids) => luis.post(`/api/attempts/${s.attemptId}/answers`).send({ questionId: q.questionId, selectedOptionIds: ids });
    const fb1 = (await answer(q1, correct[q1.questionId]).expect(200)).body;
    assert.deepEqual([fb1.isCorrect, fb1.answered, fb1.total], [true, 1, 4]);
    assert.equal((await answer(q2, correct[q2.questionId].slice(0, 1)).expect(200)).body.isCorrect, false);
    assert.equal((await answer(q1, correct[q1.questionId]).expect(409)).body.error.code, 'ALREADY_ANSWERED');
    await answer(q3, correct[q3.questionId]).expect(200);
    const fin = (await luis.post(`/api/attempts/${s.attemptId}/finish`).send({}).expect(200)).body;
    assert.deepEqual([fin.score, fin.total, fin.timedOut], [2, 4, false]);
    const review = (await luis.get(`/api/attempts/${s.attemptId}`).expect(200)).body;
    assert.deepEqual(review.questions.map((q) => q.status), ['correct', 'wrong', 'correct', 'unanswered']);
    assert.equal((await luis.get(`/api/quizzes/${id('aws')}`)).body.playCount, before + 1);
    await luis.post(`/api/attempts/${s.attemptId}/finish`).send({}).expect(409);
  });

  it('Cerrar la pestaña (sendBeacon) deja el intento interrumpido y sin revisión', async () => {
    const luis = await as('luis');
    const s = (await luis.post(`/api/quizzes/${id('osi')}/attempts`).expect(201)).body;
    // sendBeacon manda text/plain sin cuerpo útil
    await luis.post(`/api/attempts/${s.attemptId}/abandon`).set('Content-Type', 'text/plain').send('').expect(200);
    assert.equal((await luis.get(`/api/attempts/${s.attemptId}`).expect(409)).body.error.code, 'ATTEMPT_ABANDONED');
    await luis.get(`/api/attempts/${s.attemptId}/play`).expect(409);
  });

  it('Un intento con el tiempo vencido se responde con TIME_UP y se califica al leerlo', async () => {
    const luis = await as('luis');
    const s = (await luis.post(`/api/quizzes/${id('aws')}/attempts`).expect(201)).body;
    await Attempt.updateOne({ _id: s.attemptId }, { $set: { deadlineAt: new Date(Date.now() - 60000) } });
    const q = s.questions[0];
    const r = await luis.post(`/api/attempts/${s.attemptId}/answers`).send({ questionId: q.questionId, selectedOptionIds: [q.options[0].optionId] }).expect(409);
    assert.equal(r.body.error.code, 'TIME_UP');
    const review = (await luis.get(`/api/attempts/${s.attemptId}`).expect(200)).body;
    assert.deepEqual([review.status, review.timedOut], ['completed', true]);
  });

  it('Nadie puede ver ni responder intentos ajenos', async () => {
    const luis = await as('luis');
    await luis.get(`/api/attempts/${ATTEMPT.aws1}`).expect(403);
    await luis.post(`/api/attempts/${ATTEMPT.aws1}/abandon`).expect(403);
  });
});

// ======================================================================
describe('API · editor', () => {
  it('Crear: errores con la ruta del campo', async () => {
    const ana = await as('ana');
    const bad = sampleInput({ title: 'x', questions: [{ text: 'x', options: [{ text: 'a' }, { text: 'b' }] }] });
    const err = (await ana.post('/api/quizzes').send(bad).expect(400)).body.error;
    assert.deepEqual(err.fields.map((f) => f.path), ['title', 'questions.0.options']);
  });

  it('Crear: el quiz aparece en el catálogo con versión 1', async () => {
    const ana = await as('ana');
    const r = (await ana.post('/api/quizzes').send(sampleInput()).expect(201)).body;
    assert.deepEqual([r.version, r.versionCreated], [1, true]);
    const found = (await request(app).get('/api/quizzes').query({ q: 'estequiometria' })).body;
    assert.equal(found.items[0].questionCount, 2);
  });

  it('Editar solo el título no crea versión; editar preguntas sí', async () => {
    const ana = await as('ana');
    const data = (await ana.get(`/api/quizzes/${id('git')}/edit`).expect(200)).body;
    const r1 = (await ana.put(`/api/quizzes/${id('git')}`).send({ ...data, title: 'Git desde cero (2026)' }).expect(200)).body;
    assert.deepEqual([r1.version, r1.versionCreated], [1, false]);
    data.title = 'Git desde cero (2026)';
    data.questions[0].text = '¿Qué comando inicia un repositorio?';
    const r2 = (await ana.put(`/api/quizzes/${id('git')}`).send(data).expect(200)).body;
    assert.deepEqual([r2.version, r2.versionCreated], [2, true]);
    const versions = (await ana.get(`/api/quizzes/${id('git')}/versions`)).body;
    assert.equal(versions[0].changeSummary, 'Cambió la pregunta 1');
    assert.equal((await request(app).get('/api/quizzes').query({ q: '2026' })).body.total, 1, 'el título nuevo se puede buscar');
  });

  it('Un intento viejo se sigue revisando con su versión', async () => {
    const ana = await as('ana');
    const review = (await ana.get(`/api/attempts/${ATTEMPT.algebra1}`).expect(200)).body;
    assert.deepEqual([review.version, review.isCurrentVersion, review.total, review.score], [2, false, 9, 6]);
    assert.equal(review.questions[0].text, '¿Qué matrices son **invertibles**?');
  });

  it('Solo el dueño puede editar o borrar', async () => {
    const ana = await as('ana');
    await ana.get(`/api/quizzes/${id('algebra')}/edit`).expect(403);
    await ana.put(`/api/quizzes/${id('algebra')}`).send(sampleInput()).expect(403);
    await ana.delete(`/api/quizzes/${id('algebra')}`).expect(403);
  });

  it('Borrar: elimina de inmediato el quiz, sus versiones, intentos, likes y comentarios', async () => {
    const byQuiz = { quizId: IDS.algebra };
    const before = await Promise.all([QuizVersion, Attempt, Like, Comment].map((M) => M.countDocuments(byQuiz)));
    const luis = await as('luis');
    const r = (await luis.delete(`/api/quizzes/${id('algebra')}`).expect(200)).body;
    assert.equal(r.deleted, true);
    assert.deepEqual([r.removed.versions, r.removed.attempts, r.removed.likes, r.removed.comments], before);
    assert.equal(await Quiz.findById(IDS.algebra), null);
    const after = await Promise.all([QuizVersion, Attempt, Like, Comment].map((M) => M.countDocuments(byQuiz)));
    assert.deepEqual(after, [0, 0, 0, 0], 'no debe quedar nada relacionado');
    assert.equal((await request(app).get('/api/quizzes').query({ q: 'matrices' })).body.total, 0);
    await request(app).get(`/api/quizzes/${id('algebra')}`).expect(404);
    const ana = await as('ana');
    await ana.get(`/api/attempts/${ATTEMPT.algebra2}`).expect(404);
    await luis.delete(`/api/quizzes/${id('algebra')}`).expect(404);
  });

  it('Un admin también borra definitivamente el quiz de otra persona', async () => {
    const admin = await as('admin');
    await admin.delete(`/api/quizzes/${id('aws')}`).expect(200);
    assert.equal(await Quiz.findById(IDS.aws), null);
    assert.equal(await QuizVersion.countDocuments({ quizId: IDS.aws }), 0);
  });

  it('Al arrancar se limpian los quizzes que quedaron con borrado lógico (versión anterior)', async () => {
    const { purgeSoftDeleted } = await import('../src/config/db.js');
    await Quiz.collection.updateOne({ _id: IDS.algebra }, { $set: { deletedAt: new Date(), expiresAt: new Date() } });
    await Attempt.collection.updateMany({ quizId: IDS.git }, { $set: { expiresAt: null } });
    await purgeSoftDeleted();
    assert.equal(await Quiz.findById(IDS.algebra), null);
    assert.equal(await Attempt.countDocuments({ quizId: IDS.algebra }), 0);
    assert.equal(await Quiz.collection.countDocuments({ expiresAt: { $exists: true } }), 0);
    assert.equal(await Attempt.collection.countDocuments({ expiresAt: { $exists: true } }), 0);
    assert.ok(await Quiz.findById(IDS.git), 'los demás quizzes no se tocan');
  });
});

// ======================================================================
describe('API · foro', () => {
  it('Solo comenta quien completó el quiz; responder una respuesta se queda en 2 niveles', async () => {
    const luis = await as('luis');
    await luis.post(`/api/quizzes/${id('aws')}/comments`).send({ body: 'Hola' }).expect(403);
    const ana = await as('ana');
    const page = (await ana.get(`/api/quizzes/${id('algebra')}/comments`).expect(200)).body;
    assert.deepEqual([page.items.length, page.total, page.totalPages], [3, 5, 2]);
    const page2 = (await ana.get(`/api/quizzes/${id('algebra')}/comments`).query({ page: 2 })).body;
    const thread = [...page.items, ...page2.items].find((c) => c.replyCount === 2);
    const replies = (await ana.get(`/api/comments/${thread.commentId}/replies`).expect(200)).body;
    const reply = (await ana.post(`/api/quizzes/${id('algebra')}/comments`).send({ body: 'Gracias', parentId: replies.items[0].commentId }).expect(201)).body;
    assert.equal(reply.parentId, thread.commentId);
  });

  it('Borrar un comentario con respuestas lo deja como [eliminado]', async () => {
    const ana = await as('ana');
    const mine = (await ana.get(`/api/quizzes/${id('algebra')}/comments`)).body.items.find((c) => c.isMine);
    const luis = await as('luis');
    await luis.post(`/api/quizzes/${id('algebra')}/comments`).send({ body: 'Buena idea', parentId: mine.commentId }).expect(201);
    await luis.delete(`/api/comments/${mine.commentId}`).expect(403);
    assert.equal((await ana.delete(`/api/comments/${mine.commentId}`).expect(200)).body.softDeleted, true);
  });

  it('Más de 10 comentarios por minuto da 429', async () => {
    const ana = await as('ana');
    for (let i = 0; i < 10; i++) await ana.post(`/api/quizzes/${id('algebra')}/comments`).send({ body: `Comentario ${i}` }).expect(201);
    await ana.post(`/api/quizzes/${id('algebra')}/comments`).send({ body: 'Uno más' }).expect(429);
  });
});

// ======================================================================
describe('API · perfil', () => {
  it('Historial agrupado por quiz con los estados correctos', async () => {
    const ana = await as('ana');
    const h = (await ana.get('/api/attempts').expect(200)).body;
    assert.deepEqual([h.totalQuizzes, h.totalAttempts], [3, 4]);
    const statuses = h.groups.flatMap((g) => g.attempts.map((a) => a.status));
    assert.ok(statuses.includes('abandoned') && statuses.includes('completed'));
    const mine = (await ana.get('/api/users/me/quizzes').expect(200)).body;
    assert.deepEqual(mine.map((q) => q.title).sort(), ['GCP: IAM y proyectos', 'Git desde cero']);
  });
});

// ======================================================================
describe('Concurrencia (bugs corregidos de la versión anterior)', () => {
  it('Dos likes simultáneos cuentan uno y el contador coincide con los documentos', async () => {
    const gael = await as('gael');
    await playQuiz(gael, id('git'));
    const before = (await Quiz.findById(IDS.git)).likesCount;
    const results = await Promise.all(Array.from({ length: 5 }, () => gael.post(`/api/quizzes/${id('git')}/likes`)));
    assert.ok(results.every((r) => r.status === 200));
    assert.equal((await Quiz.findById(IDS.git)).likesCount, before + 1);
    assert.equal(await Like.countDocuments({ quizId: IDS.git, userId: IDS.gael }), 1);
  });

  it('Editar el quiz mientras otros juegan no pierde playCount ni likes', async () => {
    const ana = await as('ana');
    const players = await Promise.all(['luis', 'gael', 'ricardo'].map((u) => as(u)));
    const sessions = await Promise.all(players.map((p) => p.post(`/api/quizzes/${id('git')}/attempts`).expect(201).then((r) => r.body)));
    const before = (await Quiz.findById(IDS.git)).playCount;
    const data = (await ana.get(`/api/quizzes/${id('git')}/edit`)).body;
    await Promise.all([
      ...players.map((p, i) => p.post(`/api/attempts/${sessions[i].attemptId}/finish`).send({}).expect(200)),
      ana.put(`/api/quizzes/${id('git')}`).send({ ...data, title: 'Git desde cero, editado' }).expect(200),
      ana.put(`/api/quizzes/${id('git')}`).send({ ...data, description: 'Otra descripción' }).expect(200),
    ]);
    assert.equal((await Quiz.findById(IDS.git)).playCount, before + 3);
  });

  it('Responder la misma pregunta dos veces a la vez solo suma un punto', async () => {
    const luis = await as('luis');
    const s = (await luis.post(`/api/quizzes/${id('aws')}/attempts`).expect(201)).body;
    const version = await QuizVersion.findById((await Quiz.findById(IDS.aws)).currentVersionId);
    const q = version.questions[0];
    const send = () => luis.post(`/api/attempts/${s.attemptId}/answers`).send({ questionId: String(q._id), selectedOptionIds: q.correctOptionIds() });
    const codes = (await Promise.all([send(), send(), send()])).map((r) => r.status).sort();
    assert.deepEqual(codes, [200, 409, 409]);
    const attempt = await Attempt.findById(s.attemptId);
    assert.deepEqual([attempt.answers.length, attempt.score], [1, 1]);
  });

  it('Terminar dos veces a la vez solo cuenta un intento', async () => {
    const luis = await as('luis');
    const s = (await luis.post(`/api/quizzes/${id('osi')}/attempts`).expect(201)).body;
    const before = (await Quiz.findById(IDS.osi)).playCount;
    const codes = (await Promise.all([1, 2, 3].map(() => luis.post(`/api/attempts/${s.attemptId}/finish`).send({})))).map((r) => r.status).sort();
    assert.deepEqual(codes, [200, 409, 409]);
    assert.equal((await Quiz.findById(IDS.osi)).playCount, before + 1);
  });
});

// ======================================================================
describe('Validación con express-validator (antes del controlador)', () => {
  const fieldsOf = (res) => res.body.error.fields.map((f) => f.path);

  it('Registro y login: 400 con el campo exacto', async () => {
    const reg = await request(app).post('/api/auth/register').send({ username: 'a!', email: 'no-es-correo', password: 'quiztopia123' }).expect(400);
    assert.equal(reg.body.error.code, 'VALIDATION_ERROR');
    assert.deepEqual(fieldsOf(reg), ['username', 'email']);
    const login = await request(app).post('/api/auth/login').send({ email: 'sin-arroba', password: '' }).expect(400);
    assert.deepEqual(fieldsOf(login), ['email', 'password']);
  });

  it('Editor: rutas anidadas en notación de punto, como Mongoose', async () => {
    const ana = await as('ana');
    const bad = sampleInput({ timeLimit: 0, tagIds: ['x'] });
    bad.questions[1].options[0].text = '   ';
    const res = await ana.post('/api/quizzes').send(bad).expect(400);
    assert.deepEqual(fieldsOf(res), ['tagIds.0', 'timeLimit', 'questions.1.options.0.text']);
    assert.equal(res.body.error.message, 'Revisa los datos del quiz');
  });

  it('Un id mal formado en la URL responde 404 sin consultar la base', async () => {
    const ana = await as('ana');
    await ana.get('/api/attempts/123/play').expect(404);
    await ana.delete('/api/comments/xyz').expect(404);
    await request(app).get('/api/versions/no-es-id').expect(404);
  });

  it('Intentos, foro y búsqueda validan body y query', async () => {
    const luis = await as('luis');
    const s = (await luis.post(`/api/quizzes/${id('osi')}/attempts`).expect(201)).body;
    const ans = await luis.post(`/api/attempts/${s.attemptId}/answers`).send({ questionId: 'x', selectedOptionIds: [] }).expect(400);
    assert.deepEqual(fieldsOf(ans), ['questionId', 'selectedOptionIds']);
    await luis.post(`/api/attempts/${s.attemptId}/finish`).send({ reason: 'porque si' }).expect(400);
    // El navegador manda { reason: null } al terminar normal: debe aceptarse
    await luis.post(`/api/attempts/${s.attemptId}/finish`).send({ reason: null }).expect(200);
    const ana = await as('ana');
    const c = await ana.post(`/api/quizzes/${id('algebra')}/comments`).send({ body: '   ' }).expect(400);
    assert.deepEqual(fieldsOf(c), ['body']);
    await request(app).get('/api/quizzes').query({ q: 'x'.repeat(201) }).expect(400);
    await request(app).get('/api/quizzes').query({ page: 'dos' }).expect(400);
  });
});

// ======================================================================
describe('Administración (rol admin)', () => {
  it('Solo el admin entra: 401 sin sesión, 403 con rol user', async () => {
    await request(app).get('/api/admin/users').expect(401);
    const ana = await as('ana');
    assert.equal((await ana.get('/api/auth/me')).body.role, 'user');
    await ana.get('/api/admin/users').expect(403);
    await ana.post('/api/admin/categories').send({ name: 'Historia' }).expect(403);
    const admin = await as('admin');
    assert.equal((await admin.get('/api/auth/me')).body.role, 'admin');
  });

  it('Usuarios: búsqueda, filtro por rol, orden por columna y paginado', async () => {
    const admin = await as('admin');
    const asc = (await admin.get('/api/admin/users').query({ sort: 'username', order: 'asc' }).expect(200)).body;
    const names = asc.items.map((u) => u.username);
    assert.deepEqual(names, [...names].sort());
    assert.equal(asc.total, 5);
    assert.equal((await admin.get('/api/admin/users').query({ q: 'LUIS' })).body.items[0].username, 'luis_m');
    assert.equal((await admin.get('/api/admin/users').query({ role: 'admin' })).body.total, 1);
    const p2 = (await admin.get('/api/admin/users').query({ page: 2, limit: 2 })).body;
    assert.deepEqual([p2.page, p2.totalPages, p2.items.length], [2, 3, 2]);
    const luis = asc.items.find((u) => u.username === 'luis_m');
    assert.equal(luis.quizCount, 2);
    await admin.get('/api/admin/users').query({ sort: 'passwordHash' }).expect(400);
  });

  it('Usuarios: alta, edición (propaga el nombre) y nunca se puede asignar el rol', async () => {
    const admin = await as('admin');
    const created = (await admin.post('/api/admin/users').send({ username: 'Nuevo_Admin', email: 'nuevo@correo.com', password: 'quiztopia123' }).expect(201)).body;
    assert.deepEqual([created.username, created.role], ['nuevo_admin', 'user']);
    await admin.post('/api/admin/users').send({ username: 'otro', email: 'otro@correo.com', password: 'quiztopia123', role: 'admin' }).expect(400);
    await admin.post('/api/admin/users').send({ username: 'ana_dev', email: 'z@correo.com', password: 'quiztopia123' }).expect(409);
    await request(app).post('/api/auth/login').send({ email: 'nuevo@correo.com', password: 'quiztopia123' }).expect(200);

    const r = (await admin.put(`/api/admin/users/${id('luis')}`).send({ username: 'luis_mtz', email: 'luis@correo.com' }).expect(200)).body;
    assert.equal(r.username, 'luis_mtz');
    assert.equal((await Quiz.findById(IDS.algebra)).owner.username, 'luis_mtz');
    assert.equal((await request(app).get('/api/quizzes').query({ q: 'autor:luis_mtz' })).body.total, 2);
    await admin.put(`/api/admin/users/${id('luis')}`).send({ username: 'luis_mtz', email: 'luis@correo.com', role: 'admin' }).expect(400);
    await admin.put(`/api/admin/users/${id('ana')}`).send({ username: 'ana_dev', email: 'ana@correo.com', password: 'nueva-clave-123' }).expect(200);
    await request(app).post('/api/auth/login').send({ email: 'ana@correo.com', password: 'nueva-clave-123' }).expect(200);
    await admin.patch(`/api/admin/users/${id('ana')}/role`).send({ role: 'admin' }).expect(404); // la ruta ya no existe
  });

  it('Borrar usuario: no a sí mismo, no admins, no con quizzes; limpia likes e intentos', async () => {
    const admin = await as('admin');
    assert.equal((await admin.delete(`/api/admin/users/${id('admin')}`).expect(409)).body.error.code, 'SELF_DELETE');
    assert.equal((await admin.delete(`/api/admin/users/${id('luis')}`).expect(409)).body.error.code, 'IN_USE');
    // ana tiene quizzes: primero el admin borra sus quizzes con la ruta del editor
    for (const q of await Quiz.find({ 'owner.userId': IDS.ana })) await admin.delete(`/api/quizzes/${q._id}`).expect(200);
    const likesBefore = (await Quiz.findById(IDS.algebra)).likesCount;
    await admin.delete(`/api/admin/users/${id('ana')}`).expect(200);
    assert.equal((await Quiz.findById(IDS.algebra)).likesCount, likesBefore - 1, 'su like se restó');
    assert.equal(await Attempt.countDocuments({ userId: IDS.ana }), 0);
    assert.equal(await Comment.countDocuments({ 'author.userId': IDS.ana }), 0);
    await request(app).post('/api/auth/login').send({ email: 'ana@correo.com', password: 'quiztopia123' }).expect(401);
  });

  it('Quizzes: el admin lista, edita y borra quizzes de otros', async () => {
    const admin = await as('admin');
    const list = (await admin.get('/api/admin/quizzes').query({ sort: 'title', order: 'asc' }).expect(200)).body;
    assert.equal(list.total, 7);
    const titles = list.items.map((q) => q.title);
    assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b, 'es')));
    assert.equal((await admin.get('/api/admin/quizzes').query({ q: 'luis_m' })).body.total, 2);
    const detail = (await admin.get(`/api/quizzes/${id('algebra')}`)).body;
    assert.deepEqual([detail.isOwner, detail.canManage], [false, true]);
    await admin.get(`/api/quizzes/${id('algebra')}/edit`).expect(200);
    const upd = (await admin.put(`/api/quizzes/${id('aws')}`).send(sampleInput({ title: 'Editado por admin' })).expect(200)).body;
    assert.equal(upd.versionCreated, true);
    assert.equal((await Quiz.findById(IDS.aws)).owner.username, 'ricardo_e', 'el autor no cambia');
    await admin.delete(`/api/quizzes/${id('aws')}`).expect(200);
    const ana = await as('ana');
    await ana.get('/api/admin/quizzes').expect(403);
  });

  it('Categorías: alta, duplicado, renombrar actualiza los quizzes y no se borra si está en uso', async () => {
    const admin = await as('admin');
    const created = (await admin.post('/api/admin/categories').send({ name: 'Historia' }).expect(201)).body;
    assert.deepEqual([created.slug, created.quizCount], ['historia', 0]);
    const dup = await admin.post('/api/admin/categories').send({ name: 'historia' }).expect(409);
    assert.equal(dup.body.error.fields[0].path, 'name');
    await admin.post('/api/admin/categories').send({ name: 'x' }).expect(400);

    await admin.put(`/api/admin/categories/${IDS.catMatematicas}`).send({ name: 'Mate' }).expect(200);
    const quiz = await Quiz.findById(IDS.algebra);
    assert.deepEqual([quiz.category.name, quiz.category.slug], ['Mate', 'mate']);
    assert.equal((await request(app).get('/api/quizzes').query({ q: 'categoria:mate' })).body.total, 2);

    const inUse = await admin.delete(`/api/admin/categories/${IDS.catMatematicas}`).expect(409);
    assert.equal(inUse.body.error.code, 'IN_USE');
    await admin.delete(`/api/admin/categories/${created.categoryId}`).expect(200);
  });

  it('Etiquetas: alta, duplicado en la categoría, renombrar y borrar solo si nadie la usa', async () => {
    const admin = await as('admin');
    const cats = (await admin.get('/api/admin/categories').expect(200)).body;
    const prog = cats.find((c) => c.slug === 'programacion');
    const python = prog.tags.find((t) => t.slug === 'python');
    assert.ok(python.quizCount >= 1);
    const withTag = (await admin.post(`/api/admin/categories/${prog.categoryId}/tags`).send({ name: 'Rust' }).expect(201)).body;
    await admin.post(`/api/admin/categories/${prog.categoryId}/tags`).send({ name: 'rust' }).expect(409);
    const rust = withTag.tags.find((t) => t.slug === 'rust');
    await admin.put(`/api/admin/categories/${prog.categoryId}/tags/${python.tagId}`).send({ name: 'Python 3' }).expect(200);
    assert.ok((await request(app).get('/api/quizzes').query({ q: 'etiqueta:python-3' })).body.total >= 1);
    assert.ok((await request(app).get('/api/quizzes').query({ q: 'python 3' })).body.total >= 1, 'searchText actualizado');
    await admin.delete(`/api/admin/categories/${prog.categoryId}/tags/${python.tagId}`).expect(409);
    const after = (await admin.delete(`/api/admin/categories/${prog.categoryId}/tags/${rust.tagId}`).expect(200)).body;
    assert.ok(!after.tags.some((t) => t.slug === 'rust'));
  });
});

// ======================================================================
describe('SPA', () => {
  it('Las rutas del navegador devuelven index.html y /api desconocida da 404 JSON', async () => {
    const page = await request(app).get('/quiz/123').expect(200);
    assert.match(page.headers['content-type'], /html/);
    assert.match(page.text, /<div id="app"/);
    const api = await request(app).get('/api/no-existe').expect(404);
    assert.equal(api.body.error.code, 'NOT_FOUND');
  });

  it('Sirve las librerías y las reglas compartidas sin CDN, con CSP estricta', async () => {
    await request(app).get('/vendor/bootstrap/css/bootstrap.min.css').expect(200);
    await request(app).get('/vendor/marked/marked.min.js').expect(200);
    await request(app).get('/vendor/dompurify/purify.min.js').expect(200);
    const rules = await request(app).get('/shared/rules.js').expect(200);
    assert.match(rules.headers['content-type'], /javascript/);
    const page = await request(app).get('/');
    assert.match(page.headers['content-security-policy'], /script-src 'self'/);
  });
});

// ======================================================================
describe('CORS restringido', () => {
  const ORIGIN = 'http://localhost:5173';
  let saved;
  before(async () => {
    const { env } = await import('../src/config/env.js');
    saved = env.corsOrigins;
    env.corsOrigins = [ORIGIN]; // como si .env tuviera CORS_ORIGIN=http://localhost:5173
  });
  after(async () => {
    const { env } = await import('../src/config/env.js');
    env.corsOrigins = saved;
  });

  it('Un origen de la lista recibe las cabeceras CORS con credenciales', async () => {
    const res = await request(app).get('/api/categories').set('Origin', ORIGIN).expect(200);
    assert.equal(res.headers['access-control-allow-origin'], ORIGIN);
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
    const preflight = await request(app).options('/api/quizzes')
      .set('Origin', ORIGIN).set('Access-Control-Request-Method', 'PUT').expect(204);
    assert.match(preflight.headers['access-control-allow-methods'], /PUT/);
  });

  it('Un origen fuera de la lista recibe 403 y no llega al controlador', async () => {
    const before = await Quiz.countDocuments();
    const ana = await as('ana');
    const res = await ana.post('/api/quizzes').set('Origin', 'http://malicioso.com').send(sampleInput()).expect(403);
    assert.equal(res.body.error.code, 'CORS_NOT_ALLOWED');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
    assert.equal(await Quiz.countDocuments(), before, 'no se creó el quiz');
    await request(app).options('/api/quizzes')
      .set('Origin', 'http://malicioso.com').set('Access-Control-Request-Method', 'POST').expect(403);
  });

  it('La propia SPA (mismo servidor) y clientes sin Origin (Postman, curl) pasan', async () => {
    await request(app).get('/api/categories').set('Host', 'mi-app.com').set('Origin', 'https://mi-app.com').expect(200);
    const res = await request(app).get('/api/categories').expect(200);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });
});
