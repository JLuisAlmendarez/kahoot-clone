/* ============================================================================
   api.js — API simulada con el mismo contrato que tendrá Express.
   Cada función es async, equivale a un endpoint y devuelve los objetos del
   diagrama 2 (QuizCard, QuizDetail, AttemptReview…). Los errores llegan como
   ApiError con status HTTP, igual que los recibiría fetch().

   Para cambiar a la API real, cada función se reemplaza por un fetch():
     search: (p) => http('GET', '/api/quizzes?' + new URLSearchParams(p))
   y las páginas no cambian.

   createApi({ db, session }) permite crear instancias independientes
   (las pruebas usan una base en memoria para no tocar tus datos).
   ========================================================================== */
(function (global) {
  'use strict';
  const QT = global.QT;
  const { ApiError, ValidationError, DuplicateKeyError, DomainError, Validator, log, withTimeout, AttemptStatus, LIMITS } = QT;
  const { Quiz, QuizVersion, Attempt, Like, Comment, User } = QT.models;

  const now = () => new Date();
  const perf = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const normalize = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // ------------------------------------------------------------- sesión
  /** Guarda el userId de la sesión (en el servidor real es una cookie httpOnly con JWT). */
  function storageSession(storage, key = 'quiztopia-session') {
    return {
      get() { try { return storage.getItem(key); } catch (e) { return null; } },
      set(id) { try { storage.setItem(key, id); } catch (e) { /* sin storage */ } },
      clear() { try { storage.removeItem(key); } catch (e) { /* sin storage */ } },
    };
  }
  function memorySession() {
    let id = null;
    return { get: () => id, set: (v) => { id = v; }, clear: () => { id = null; } };
  }

  // ------------------------------------------------- búsqueda con filtros
  /** Interpreta "matrices categoria:quimica preguntas:>5 sort:populares". */
  class SearchQuery {
    static KEYS = ['categoria', 'autor', 'etiqueta', 'preguntas', 'sort'];
    constructor(q = '') {
      this.raw = String(q).slice(0, 200);
      this.text = [];
      this.filters = {};
      this.ignored = [];
      for (const token of this.raw.trim().split(/\s+/).filter(Boolean)) {
        const m = token.match(/^([a-záéíóú]+):(.+)$/i);
        if (!m) { this.text.push(normalize(token)); continue; }
        const key = normalize(m[1]);
        const value = normalize(m[2]).replace(/^@/, '');
        if (key === 'preguntas') {
          const p = value.match(/^(>=|<=|>|<|=)?(\d+)$/);
          if (p) this.filters.preguntas = { op: p[1] || '=', n: Number(p[2]) };
          else this.ignored.push(token);
        } else if (key === 'sort') {
          if (['populares', 'recientes'].includes(value)) this.filters.sort = value;
          else this.ignored.push(token);
        } else if (SearchQuery.KEYS.includes(key)) {
          this.filters[key] = value;
        } else {
          this.ignored.push(token);
        }
      }
    }
    /** ¿El quiz cumple todos los filtros? */
    matches(quiz) {
      const f = this.filters;
      if (f.categoria && quiz.category.slug !== f.categoria) return false;
      if (f.autor && quiz.owner.username !== f.autor) return false;
      if (f.etiqueta && !quiz.tags.some((t) => t.slug === f.etiqueta)) return false;
      if (f.preguntas) {
        const { op, n } = f.preguntas; const c = quiz.questionCount;
        const ok = { '>': c > n, '<': c < n, '>=': c >= n, '<=': c <= n, '=': c === n }[op];
        if (!ok) return false;
      }
      if (this.text.length) {
        const haystack = normalize([quiz.title, quiz.description, ...quiz.tags.map((t) => t.name)].join(' '));
        if (!this.text.every((t) => haystack.includes(t))) return false;
      }
      return true;
    }
    comparator() {
      return this.filters.sort === 'populares'
        ? (a, b) => b.likesCount - a.likesCount || b.createdAt - a.createdAt
        : (a, b) => b.createdAt - a.createdAt;
    }
  }

  // ------------------------------------------- errores → respuestas HTTP
  const DOMAIN_STATUS = {
    QUIZ_DELETED: 404, VERSION_MISMATCH: 409, ATTEMPT_CLOSED: 409, TIME_UP: 409, ALREADY_ANSWERED: 409,
    INVALID_QUESTION: 400, INVALID_OPTION: 400,
  };
  function toApiError(err) {
    if (err instanceof ApiError) return err;
    if (err instanceof ValidationError) return ApiError.badRequest(err.message, err.fields);
    if (err instanceof DuplicateKeyError) {
      const field = err.keys[err.keys.length - 1];
      const messages = { username: 'Ese nombre de usuario ya está en uso', email: 'Ya existe una cuenta con ese correo' };
      const message = messages[field] || `Ese valor de ${field} ya está en uso`;
      return ApiError.conflict(message, [{ path: field, message }]);
    }
    if (err instanceof DomainError) return new ApiError(DOMAIN_STATUS[err.code] || 400, err.code, err.message);
    const e = new ApiError(500, 'INTERNAL', err && err.message ? err.message : 'Error inesperado');
    e.cause = err;
    return e;
  }

  // ======================================================================
  function createApi({ db, session = memorySession(), timeoutMs = 10000, rateLimit = 10 } = {}) {
    /** Envuelve un handler: mide el tiempo, registra en consola y traduce errores. */
    const endpoint = (method, path, handler) => async (...args) => {
      const t0 = perf();
      const label = typeof args[0] === 'string' ? path.replace(/:\w+/, args[0]) : path;
      try {
        const result = await withTimeout(Promise.resolve().then(() => handler(...args)), timeoutMs);
        log.request(method, label, args.length ? args : undefined, result, perf() - t0);
        return result;
      } catch (raw) {
        const err = toApiError(raw);
        log.request(method, label, args.length ? args : undefined, null, perf() - t0, err);
        throw err;
      }
    };

    // ---------------- ayudantes ----------------
    const resolveId = (id) => (QT.seed && QT.seed.aliases && QT.seed.aliases[id]) || id;

    async function currentUser() {
      const id = session.get();
      return id ? db.users.findById(id) : null;
    }
    async function requireUser() {
      const user = await currentUser();
      if (!user) throw ApiError.unauthorized();
      return user;
    }
    async function liveQuiz(id) {
      const quiz = await db.quizzes.findById(resolveId(id));
      if (!quiz || quiz.isDeleted) throw ApiError.notFound('Este quiz no existe o fue eliminado');
      return quiz;
    }
    async function hasCompleted(userId, quizId) {
      if (!userId) return false;
      return !!(await db.attempts.findOne((a) => a.userId === userId && a.quizId === quizId && a.status === AttemptStatus.COMPLETED));
    }
    async function ownAttempt(id, user) {
      const attempt = await db.attempts.findById(resolveId(id));
      if (!attempt) throw ApiError.notFound('Este intento no existe o ya expiró');
      if (attempt.userId !== user._id) throw ApiError.forbidden('Este intento es de otra persona');
      return attempt;
    }
    const versionLabel = (t) => (t ? `${t} min` : 'Sin límite');

    /** Valida la forma de QuizInput antes de construir modelos. */
    function readQuizInput(input = {}) {
      const v = new Validator();
      v.string(input.title, 'title', { min: LIMITS.title[0], max: LIMITS.title[1], label: 'El título' })
        .string(input.description, 'description', { required: false, max: LIMITS.description, label: 'La descripción' })
        .objectId(input.categoryId, 'categoryId', { label: 'La categoría' })
        .array(input.tagIds || [], 'tagIds', { max: LIMITS.tags, label: 'Las etiquetas' })
        .array(input.questions, 'questions', { min: LIMITS.questions[0], max: LIMITS.questions[1], label: 'Las preguntas' });
      if (input.timeLimit !== null && input.timeLimit !== undefined) {
        v.integer(input.timeLimit, 'timeLimit', { min: LIMITS.timeLimit[0], max: LIMITS.timeLimit[1], label: 'El límite de tiempo' });
      }
      v.throwIfErrors('Revisa los datos del quiz');
      return {
        title: input.title.trim(), description: (input.description || '').trim(), categoryId: input.categoryId,
        tagIds: [...new Set(input.tagIds || [])], timeLimit: input.timeLimit ?? null,
        questions: input.questions.map((q) => ({
          text: q.text, explanation: q.explanation || null,
          options: (q.options || []).map((o) => ({ text: o.text, isCorrect: !!o.isCorrect })),
        })),
      };
    }
    async function resolveCategoryAndTags(categoryId, tagIds) {
      const [category, all] = await Promise.all([db.categories.findById(categoryId), db.categories.find()]);
      if (!category) throw ApiError.badRequest('La categoría no existe', [{ path: 'categoryId', message: 'Elige una categoría válida' }]);
      const tags = tagIds.map((id) => {
        for (const c of all) { const t = c.findTag(id); if (t) return t.toRef(); }
        throw ApiError.badRequest('Etiqueta inválida', [{ path: 'tagIds', message: `La etiqueta ${id} no existe` }]);
      });
      return { category: category.toRef(), tags };
    }
    const commentView = (c, me, quiz) => ({
      commentId: c._id, parentId: c.parentId,
      author: c.deleted ? null : { userId: c.author.userId, username: c.author.username, initials: c.author.initials },
      body: c.deleted ? '' : c.body, deleted: c.deleted, replyCount: c.replyCount,
      isMine: !!me && c.author.userId === me._id && !c.deleted,
      isQuizOwner: !c.deleted && c.author.userId === quiz.owner.userId,
      createdAt: c.createdAt.toISOString(),
    });
    const sessionView = async (attempt, version, quiz) => ({
      attemptId: attempt._id, quizId: quiz._id, quizTitle: quiz.title, version: version.version,
      deadlineAt: attempt.deadlineAt ? attempt.deadlineAt.toISOString() : null,
      answeredQuestionIds: attempt.answers.map((a) => a.questionId),
      questions: version.toPublic().questions,
    });

    // ==================================================================
    const auth = {
      /** POST /api/auth/register */
      register: endpoint('POST', '/api/auth/register', async ({ username, email, password } = {}) => {
        User.validatePassword(password);
        const user = new User({ username, email, passwordHash: 'x'.repeat(20) });
        user.validate(); // valida username y correo antes de cifrar
        user.passwordHash = await User.hashPassword(password);
        const saved = await db.users.insertOne(user);
        session.set(saved._id);
        return { user: saved.toPublic() };
      }),
      /** POST /api/auth/login — mismo mensaje si falla el correo o la contraseña */
      login: endpoint('POST', '/api/auth/login', async ({ email, password } = {}) => {
        const user = await db.users.findOne((u) => u.email === normalize(email).trim());
        if (!user || !(await user.checkPassword(String(password || '')))) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
        session.set(user._id);
        return { user: user.toPublic() };
      }),
      /** POST /api/auth/logout */
      logout: endpoint('POST', '/api/auth/logout', async () => { session.clear(); return { ok: true }; }),
      /** GET /api/auth/me — null si no hay sesión (en el servidor sería 401) */
      me: endpoint('GET', '/api/auth/me', async () => {
        const user = await currentUser();
        if (!user && session.get()) session.clear();
        return user ? user.toPublic() : null;
      }),
    };

    const categories = {
      /** GET /api/categories */
      list: endpoint('GET', '/api/categories', async () => {
        const list = await db.categories.find(() => true, { sort: (a, b) => a._id.localeCompare(b._id) });
        return list.map((c) => ({ categoryId: c._id, name: c.name, slug: c.slug, tags: c.tags.map((t) => ({ tagId: t._id, name: t.name, slug: t.slug })) }));
      }),
    };

    const quizzes = {
      /** GET /api/quizzes?q=&page=&limit= */
      search: endpoint('GET', '/api/quizzes', async ({ q = '', page = 1, limit = 12 } = {}) => {
        const query = new SearchQuery(q);
        page = Math.max(1, parseInt(page, 10) || 1);
        limit = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
        const list = await db.quizzes.find((x) => !x.isDeleted && query.matches(x), { sort: query.comparator() });
        const totalPages = Math.max(1, Math.ceil(list.length / limit));
        return {
          items: list.slice((page - 1) * limit, page * limit).map((x) => x.toCard()),
          page, totalPages, total: list.length, ignored: query.ignored,
        };
      }),

      /** GET /api/quizzes/:id — versión vigente y permisos de quien pregunta */
      get: endpoint('GET', '/api/quizzes/:id', async (id) => {
        const [quiz, me] = await Promise.all([liveQuiz(id), currentUser()]);
        const [completed, like] = await Promise.all([
          hasCompleted(me && me._id, quiz._id),
          me ? db.likes.findOne((l) => l.userId === me._id && l.quizId === quiz._id) : null,
        ]);
        const isOwner = quiz.isOwnedBy(me && me._id);
        return {
          ...quiz.toCard(), description: quiz.description, version: quiz.version, createdAt: quiz.createdAt.toISOString(),
          isOwner, completed, likedByMe: !!like,
          canLike: !!me && completed && !isOwner, canComment: !!me && (completed || isOwner),
        };
      }),

      /** GET /api/quizzes/:id/versions */
      versions: endpoint('GET', '/api/quizzes/:id/versions', async (id) => {
        const quiz = await liveQuiz(id);
        const list = await db.quizVersions.find((v) => v.quizId === quiz._id, { sort: (a, b) => b.version - a.version });
        return list.map((v) => ({
          versionId: v._id, version: v.version, isCurrent: v._id === quiz.currentVersionId, createdAt: v.createdAt.toISOString(),
          changeSummary: v.changeSummary, questionCount: v.questionCount, timeLimit: v.timeLimit,
          timeLimitLabel: versionLabel(v.timeLimit), attemptCount: v.attemptCount,
        }));
      }),

      /** GET /api/versions/:versionId — snapshot; isCorrect solo para el dueño */
      version: endpoint('GET', '/api/versions/:versionId', async (versionId) => {
        const version = await db.quizVersions.findById(versionId);
        if (!version) throw ApiError.notFound('Esta versión no existe');
        const [quiz, me] = await Promise.all([liveQuiz(version.quizId), currentUser()]);
        const owner = quiz.isOwnedBy(me && me._id);
        return {
          versionId: version._id, version: version.version, isCurrent: version._id === quiz.currentVersionId,
          quiz: { quizId: quiz._id, title: quiz.title }, createdAt: version.createdAt.toISOString(),
          timeLimit: version.timeLimit, timeLimitLabel: versionLabel(version.timeLimit),
          questionCount: version.questionCount, attemptCount: version.attemptCount,
          questions: version.questions.map((q) => ({
            position: q.position, text: q.text, change: q.change, multiple: q.multiple,
            options: q.options.map((o) => (owner ? { text: o.text, isCorrect: o.isCorrect } : { text: o.text })),
          })),
        };
      }),

      /** POST /api/quizzes — crea el quiz y su versión 1 en una transacción */
      create: endpoint('POST', '/api/quizzes', async (input) => {
        const me = await requireUser();
        const data = readQuizInput(input);
        const { category, tags } = await resolveCategoryAndTags(data.categoryId, data.tagIds);
        return db.transaction(async () => {
          const at = now();
          const quiz = new Quiz({ owner: me.toRef(), title: data.title, description: data.description, category, tags, createdAt: at });
          const version = QuizVersion.build({ quizId: quiz._id, questions: data.questions, timeLimit: data.timeLimit, now: at });
          version.validate();
          quiz.publishVersion(version, at);
          await db.quizVersions.insertOne(version);
          await db.quizzes.insertOne(quiz);
          return { quizId: quiz._id, version: quiz.version, versionCreated: true };
        });
      }),

      /** GET /api/quizzes/:id/edit — contenido vigente con isCorrect (solo dueño) */
      getForEdit: endpoint('GET', '/api/quizzes/:id/edit', async (id) => {
        const [quiz, me] = await Promise.all([liveQuiz(id), requireUser()]);
        if (!quiz.isOwnedBy(me._id)) throw ApiError.forbidden('Solo el creador puede editar este quiz');
        const version = await db.quizVersions.findById(quiz.currentVersionId);
        return {
          quizId: quiz._id, version: quiz.version, title: quiz.title, description: quiz.description,
          categoryId: quiz.category.categoryId, tagIds: quiz.tags.map((t) => t.tagId), timeLimit: version.timeLimit,
          questions: version.questions.map((q) => ({ text: q.text, explanation: q.explanation || '', options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) })),
        };
      }),

      /** PUT /api/quizzes/:id — crea versión nueva solo si cambió el contenido */
      update: endpoint('PUT', '/api/quizzes/:id', async (id, input) => {
        const [quiz, me] = await Promise.all([liveQuiz(id), requireUser()]);
        if (!quiz.isOwnedBy(me._id)) throw ApiError.forbidden('Solo el creador puede editar este quiz');
        const data = readQuizInput(input);
        const { category, tags } = await resolveCategoryAndTags(data.categoryId, data.tagIds);
        const current = await db.quizVersions.findById(quiz.currentVersionId);
        const contentChanged = !current.sameContentAs(data.questions, data.timeLimit);
        return db.transaction(async () => {
          const at = now();
          quiz.updateDetails({ title: data.title, description: data.description, category, tags }, at);
          if (contentChanged) {
            const next = QuizVersion.build({ quizId: quiz._id, previous: current, questions: data.questions, timeLimit: data.timeLimit, now: at });
            next.validate();
            quiz.publishVersion(next, at);
            await db.quizVersions.insertOne(next);
          }
          quiz.validate();
          await db.quizzes.updateOne(quiz._id, (q) => Object.assign(q, quiz));
          return { quizId: quiz._id, version: quiz.version, versionCreated: contentChanged };
        });
      }),

      /** DELETE /api/quizzes/:id — borrado lógico y expiración en cascada */
      remove: endpoint('DELETE', '/api/quizzes/:id', async (id) => {
        const [quiz, me] = await Promise.all([liveQuiz(id), requireUser()]);
        if (!quiz.isOwnedBy(me._id)) throw ApiError.forbidden('Solo el creador puede borrar este quiz');
        return db.transaction(async () => {
          const at = now();
          const expiresAt = quiz.softDelete(at);
          await db.quizzes.updateOne(quiz._id, (q) => { q.deletedAt = quiz.deletedAt; q.expiresAt = expiresAt; q.updatedAt = at; });
          const byQuiz = (d) => d.quizId === quiz._id;
          const counts = await Promise.all([
            db.quizVersions.updateMany(byQuiz, (d) => { d.expiresAt = expiresAt; }),
            db.attempts.updateMany(byQuiz, (d) => { d.abandon(at); d.expiresAt = expiresAt; }),
            db.likes.updateMany(byQuiz, (d) => { d.expiresAt = expiresAt; }),
            db.comments.updateMany(byQuiz, (d) => { d.expiresAt = expiresAt; }),
          ]);
          return { quizId: quiz._id, deletedAt: at.toISOString(), expiresAt: expiresAt.toISOString(), affected: counts.reduce((a, b) => a + b, 0) };
        });
      }),

      /** GET /api/users/me/quizzes */
      mine: endpoint('GET', '/api/users/me/quizzes', async () => {
        const me = await requireUser();
        const list = await db.quizzes.find((q) => q.isOwnedBy(me._id) && !q.isDeleted, { sort: (a, b) => b.updatedAt - a.updatedAt });
        return list.map((q) => ({ ...q.toCard(), version: q.version, updatedAt: q.updatedAt.toISOString() }));
      }),

      /** POST /api/quizzes/:id/likes */
      like: endpoint('POST', '/api/quizzes/:id/likes', async (id) => {
        const [quiz, me] = await Promise.all([liveQuiz(id), requireUser()]);
        if (quiz.isOwnedBy(me._id)) throw ApiError.forbidden('No puedes dar like a tu propio quiz');
        if (!(await hasCompleted(me._id, quiz._id))) throw ApiError.forbidden('Completa el quiz para poder darle like');
        return db.transaction(async () => {
          const existing = await db.likes.findOne((l) => l.userId === me._id && l.quizId === quiz._id);
          if (!existing) {
            await db.likes.insertOne(new Like({ userId: me._id, quizId: quiz._id }));
            await db.quizzes.updateOne(quiz._id, (q) => { q.likesCount += 1; }); // $inc atómico
          }
          const fresh = await db.quizzes.findById(quiz._id);
          return { likesCount: fresh.likesCount, likedByMe: true };
        });
      }),

      /** DELETE /api/quizzes/:id/likes */
      unlike: endpoint('DELETE', '/api/quizzes/:id/likes', async (id) => {
        const [quiz, me] = await Promise.all([liveQuiz(id), requireUser()]);
        return db.transaction(async () => {
          const existing = await db.likes.findOne((l) => l.userId === me._id && l.quizId === quiz._id);
          if (existing) {
            await db.likes.deleteOne(existing._id);
            await db.quizzes.updateOne(quiz._id, (q) => { q.likesCount = Math.max(0, q.likesCount - 1); });
          }
          const fresh = await db.quizzes.findById(quiz._id);
          return { likesCount: fresh.likesCount, likedByMe: false };
        });
      }),
    };

    const attempts = {
      /** POST /api/quizzes/:id/attempts — inicia con la versión vigente */
      start: endpoint('POST', '/api/quizzes/:id/attempts', async (quizId) => {
        const [quiz, me] = await Promise.all([liveQuiz(quizId), requireUser()]);
        const version = await db.quizVersions.findById(quiz.currentVersionId);
        // Un intento abierto a la vez por quiz: el anterior queda interrumpido
        await db.attempts.updateMany((a) => a.userId === me._id && a.quizId === quiz._id && a.isOpen, (a) => a.abandon(now()));
        const attempt = await db.attempts.insertOne(Attempt.start({ user: me, quiz, version, now: now() }));
        return sessionView(attempt, version, quiz);
      }),

      /** GET /api/attempts/:id/play — recupera un intento en curso (para jugar.html) */
      play: endpoint('GET', '/api/attempts/:id/play', async (attemptId) => {
        const me = await requireUser();
        const attempt = await ownAttempt(attemptId, me);
        if (!attempt.isOpen) throw new ApiError(409, 'ATTEMPT_CLOSED', 'Este intento ya terminó');
        const [version, quiz] = await Promise.all([db.quizVersions.findById(attempt.versionId), db.quizzes.findById(attempt.quizId)]);
        return sessionView(attempt, version, quiz);
      }),

      /** POST /api/attempts/:id/answers — califica y devuelve el feedback */
      answer: endpoint('POST', '/api/attempts/:id/answers', async (attemptId, { questionId, selectedOptionIds } = {}) => {
        const me = await requireUser();
        const attempt = await ownAttempt(attemptId, me);
        const version = await db.quizVersions.findById(attempt.versionId);
        let answer;
        await db.attempts.updateOne(attempt._id, (a) => { answer = a.answer(version, questionId, selectedOptionIds, now()); });
        const question = version.question(questionId);
        return {
          isCorrect: answer.isCorrect, correctOptionIds: question.correctOptionIds(), explanation: question.explanation,
          answered: attempt.answers.length + 1, total: attempt.total,
        };
      }),

      /** POST /api/attempts/:id/finish { reason?: "timeout" } */
      finish: endpoint('POST', '/api/attempts/:id/finish', async (attemptId, { reason = null } = {}) => {
        const me = await requireUser();
        const attempt = await ownAttempt(attemptId, me);
        return db.transaction(async () => {
          let result;
          await db.attempts.updateOne(attempt._id, (a) => { result = a.finish(reason, now()); });
          await db.quizzes.updateOne(attempt.quizId, (q) => { q.playCount += 1; });
          await db.quizVersions.updateOne(attempt.versionId, (v) => { v.attemptCount += 1; });
          return { attemptId: attempt._id, ...result };
        });
      }),

      /** POST /api/attempts/:id/abandon */
      abandon: endpoint('POST', '/api/attempts/:id/abandon', async (attemptId) => {
        const me = await requireUser();
        const attempt = await ownAttempt(attemptId, me);
        let changed = false;
        await db.attempts.updateOne(attempt._id, (a) => { changed = a.abandon(now()); });
        return { abandoned: changed };
      }),

      /**
       * Equivalente a navigator.sendBeacon al cerrar la pestaña: síncrono y sin
       * esperar respuesta, porque la página ya se está cerrando.
       */
      abandonBeacon(attemptId) {
        const id = resolveId(attemptId);
        const doc = db.attempts.findByIdSync(id);
        if (!doc || doc.userId !== session.get() || !doc.isOpen) return false;
        db.attempts.updateSync(id, (a) => a.abandon(now()));
        log.info(`sendBeacon simulado: intento ${id} interrumpido`);
        return true;
      },

      /** GET /api/attempts/:id — revisión con la versión que se jugó */
      review: endpoint('GET', '/api/attempts/:id', async (attemptId) => {
        const me = await requireUser();
        const attempt = await ownAttempt(attemptId, me);
        if (attempt.status === AttemptStatus.IN_PROGRESS) throw new ApiError(409, 'ATTEMPT_OPEN', 'Este intento sigue en curso');
        if (attempt.status === AttemptStatus.ABANDONED) throw new ApiError(409, 'ATTEMPT_ABANDONED', 'Los intentos interrumpidos no tienen revisión');
        const [version, quiz] = await Promise.all([db.quizVersions.findById(attempt.versionId), db.quizzes.findById(attempt.quizId)]);
        const byQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]));
        const duration = Math.max(0, Math.round(((attempt.finishedAt || now()) - attempt.startedAt) / 60000));
        return {
          attemptId: attempt._id, version: attempt.version, isCurrentVersion: quiz.currentVersionId === attempt.versionId,
          quiz: { quizId: quiz._id, title: quiz.title, version: quiz.version, deleted: quiz.isDeleted, expiresAt: quiz.expiresAt ? quiz.expiresAt.toISOString() : null },
          status: attempt.status, timedOut: attempt.timedOut, score: attempt.score, total: attempt.total, percentage: attempt.percentage,
          startedAt: attempt.startedAt.toISOString(), finishedAt: attempt.finishedAt ? attempt.finishedAt.toISOString() : null,
          durationLabel: duration < 1 ? 'menos de 1 min' : `${duration} min`,
          questions: version.questions.map((q) => {
            const a = byQuestion.get(q._id);
            const selected = new Set(a ? a.selectedOptionIds : []);
            return {
              position: q.position, text: q.text, explanation: q.explanation, multiple: q.multiple,
              status: !a ? 'unanswered' : a.isCorrect ? 'correct' : 'wrong',
              options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, selected: selected.has(o._id) })),
            };
          }),
        };
      }),

      /** GET /api/attempts?quizId=&page=&limit= — historial agrupado por quiz */
      history: endpoint('GET', '/api/attempts', async ({ quizId = null, page = 1, limit = 10 } = {}) => {
        const me = await requireUser();
        const target = quizId ? resolveId(quizId) : null;
        const mine = await db.attempts.find((a) => a.userId === me._id && !a.isOpen, { sort: (a, b) => b.startedAt - a.startedAt });
        const quizIds = [...new Set(mine.map((a) => a.quizId))];
        const quizDocs = new Map((await Promise.all(quizIds.map((id) => db.quizzes.findById(id)))).filter(Boolean).map((q) => [q._id, q]));
        const groups = [];
        for (const a of mine) {
          if (target && a.quizId !== target) continue;
          const q = quizDocs.get(a.quizId);
          if (!q) continue;
          let g = groups.find((x) => x.quiz.quizId === q._id);
          if (!g) {
            g = { quiz: { quizId: q._id, title: q.title, version: q.version, deleted: q.isDeleted, expiresAt: q.expiresAt ? q.expiresAt.toISOString() : null }, attempts: [] };
            groups.push(g);
          }
          g.attempts.push({ attemptId: a._id, status: a.status, timedOut: a.timedOut, score: a.score, total: a.total, version: a.version, startedAt: a.startedAt.toISOString() });
        }
        page = Math.max(1, parseInt(page, 10) || 1);
        const totalPages = Math.max(1, Math.ceil(groups.length / limit));
        return {
          groups: groups.slice((page - 1) * limit, page * limit), page, totalPages,
          totalQuizzes: quizIds.filter((id) => quizDocs.has(id)).length, totalAttempts: mine.length,
          playedQuizzes: quizIds.filter((id) => quizDocs.has(id)).map((id) => ({ quizId: id, title: quizDocs.get(id).title })),
        };
      }),
    };

    const comments = {
      /** GET /api/quizzes/:id/comments?page=&limit= — primer nivel, más recientes primero */
      list: endpoint('GET', '/api/quizzes/:id/comments', async (quizId, { page = 1, limit = 3 } = {}) => {
        const [quiz, me] = await Promise.all([liveQuiz(quizId), currentUser()]);
        const top = await db.comments.find((c) => c.quizId === quiz._id && !c.isReply, { sort: (a, b) => b.createdAt - a.createdAt });
        const totalPages = Math.max(1, Math.ceil(top.length / limit));
        return { items: top.slice((page - 1) * limit, page * limit).map((c) => commentView(c, me, quiz)), page, totalPages, total: top.length };
      }),

      /** GET /api/comments/:id/replies */
      replies: endpoint('GET', '/api/comments/:id/replies', async (commentId) => {
        const parent = await db.comments.findById(commentId);
        if (!parent) throw ApiError.notFound('El comentario no existe');
        const [quiz, me] = await Promise.all([liveQuiz(parent.quizId), currentUser()]);
        const list = await db.comments.find((c) => c.parentId === parent._id, { sort: (a, b) => a.createdAt - b.createdAt });
        return { items: list.map((c) => commentView(c, me, quiz)) };
      }),

      /** POST /api/quizzes/:id/comments { body, parentId? } */
      create: endpoint('POST', '/api/quizzes/:id/comments', async (quizId, { body, parentId = null } = {}) => {
        const [quiz, me] = await Promise.all([liveQuiz(quizId), requireUser()]);
        if (!quiz.isOwnedBy(me._id) && !(await hasCompleted(me._id, quiz._id))) throw ApiError.forbidden('Completa el quiz para participar en el foro');
        const since = new Date(Date.now() - 60000);
        const recent = await db.comments.count((c) => c.author.userId === me._id && c.createdAt > since);
        if (recent >= rateLimit) throw ApiError.tooMany('Vas muy rápido: espera un momento antes de volver a comentar');
        let parent = null;
        if (parentId) {
          parent = await db.comments.findById(parentId);
          if (!parent || parent.quizId !== quiz._id) throw ApiError.badRequest('El comentario al que respondes no existe');
          if (parent.isReply) parent = await db.comments.findById(parent.parentId); // solo dos niveles
          if (parent.deleted) throw ApiError.badRequest('No se puede responder a un comentario eliminado');
        }
        return db.transaction(async () => {
          const saved = await db.comments.insertOne(new Comment({ quizId: quiz._id, parentId: parent ? parent._id : null, author: me.toRef(), body }));
          if (parent) await db.comments.updateOne(parent._id, (c) => { c.replyCount += 1; });
          return commentView(saved, me, quiz);
        });
      }),

      /** DELETE /api/comments/:id */
      remove: endpoint('DELETE', '/api/comments/:id', async (commentId) => {
        const me = await requireUser();
        const comment = await db.comments.findById(commentId);
        if (!comment || comment.deleted) throw ApiError.notFound('El comentario no existe');
        if (comment.author.userId !== me._id) throw ApiError.forbidden('Solo puedes borrar tus comentarios');
        return db.transaction(async () => {
          if (!comment.isReply && comment.replyCount > 0) {
            await db.comments.updateOne(comment._id, (c) => c.markDeleted());
            return { softDeleted: true };
          }
          await db.comments.deleteOne(comment._id);
          if (comment.isReply) {
            const parent = await db.comments.updateOne(comment.parentId, (c) => { c.replyCount = Math.max(0, c.replyCount - 1); });
            // Si el padre ya estaba eliminado y se quedó sin respuestas, desaparece
            if (parent && parent.deleted && parent.replyCount === 0) await db.comments.deleteOne(parent._id);
          }
          return { softDeleted: false };
        });
      }),
    };

    return { auth, categories, quizzes, attempts, comments, session, db, resolveId };
  }

  Object.assign(QT, { createApi, storageSession, memorySession, SearchQuery, toApiError });
})(typeof window !== 'undefined' ? window : globalThis);
