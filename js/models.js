/* ============================================================================
   models.js — Las clases del diagrama 1 (documentos de MongoDB).
   Cada clase «colección» extiende Doc; cada «incrustado» extiende Embedded.
   - collectErrors(v) declara las reglas de validación (como un esquema).
   - validate() lanza ValidationError si algo no cumple.
   - Los métodos de dominio (publishVersion, answer, finish, softDelete…)
     cambian el documento y protegen sus reglas de negocio.
   Al pasar a Express + Mongoose, estas reglas se copian a los esquemas y los
   métodos a schema.methods / statics.
   ========================================================================== */
(function (global) {
  'use strict';
  const QT = global.QT;
  const { ObjectId, Validator, addMonths, initials, slugify } = QT;

  // ------------------------------------------------------------------ enums
  const AttemptStatus = Object.freeze({ IN_PROGRESS: 'in_progress', COMPLETED: 'completed', ABANDONED: 'abandoned' });
  const QuestionChange = Object.freeze({ UNCHANGED: 'unchanged', MODIFIED: 'modified', NEW: 'new' });

  const LIMITS = Object.freeze({
    username: [3, 20], password: 8, email: 254, title: [3, 100], description: 2000,
    questions: [1, 50], options: [2, 10], questionText: 1000, explanation: 1000, optionText: 300,
    tags: 5, timeLimit: [1, 300], comment: 1000, deleteMonths: 3, graceMs: 5000,
  });
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const USERNAME = /^[A-Za-z0-9_]+$/;

  /** Error de una regla de negocio (no de formato). La API lo traduce a 409/400/403. */
  class DomainError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'DomainError';
      this.code = code;
    }
  }

  const toDate = (v) => (v === undefined || v === null ? null : v instanceof Date ? v : new Date(v));

  // ------------------------------------------------------------ clases base
  class Embedded {
    /** Reglas de validación. Cada subclase agrega las suyas. */
    collectErrors(v) { return v; }
    validate() {
      const v = this.collectErrors(new Validator());
      v.throwIfErrors();
      return true;
    }
    /** Copia plana lista para guardar o enviar (Date → ISO). */
    toObject() { return JSON.parse(JSON.stringify(this)); }
  }

  class Doc extends Embedded {
    static collection = '';
    constructor(data = {}) {
      super();
      this._id = data._id || ObjectId.generate();
    }
    collectErrors(v) { return v.objectId(this._id, '_id'); }
    /** Reconstruye la instancia desde datos planos (lo que se lee de la base). */
    static fromJSON(data) { return new this(data); }
  }

  // ======================================================================
  // users
  // ======================================================================
  class User extends Doc {
    static collection = 'users';
    constructor({ _id, username, email, passwordHash, createdAt } = {}) {
      super({ _id });
      this.username = typeof username === 'string' ? username.trim().toLowerCase() : username;
      this.email = typeof email === 'string' ? email.trim().toLowerCase() : email;
      this.passwordHash = passwordHash;
      this.createdAt = toDate(createdAt) || new Date();
    }
    collectErrors(v) {
      super.collectErrors(v);
      return v
        .string(this.username, 'username', { min: LIMITS.username[0], max: LIMITS.username[1], pattern: USERNAME, label: 'El nombre de usuario', patternMessage: 'Usa solo letras, números y guion bajo' })
        .string(this.email, 'email', { max: LIMITS.email, pattern: EMAIL, label: 'El correo', patternMessage: 'Escribe un correo válido' })
        .string(this.passwordHash, 'passwordHash', { min: 20, label: 'La contraseña cifrada' })
        .date(this.createdAt, 'createdAt');
    }
    get initials() { return initials(this.username); }
    toRef() { return new UserRef({ userId: this._id, username: this.username }); }
    toPublic() { return { userId: this._id, username: this.username, initials: this.initials, createdAt: this.createdAt.toISOString() }; }

    /** Valida la contraseña en texto plano (nunca se guarda así). */
    static validatePassword(plain) {
      const v = new Validator();
      v.string(plain, 'password', { min: LIMITS.password, max: 128, label: 'La contraseña' });
      v.throwIfErrors();
    }

    /**
     * Cifra la contraseña de forma asíncrona (SHA-256 con sal).
     * En el servidor real se usa bcrypt con coste 10; aquí solo se simula.
     */
    static async hashPassword(plain, salt = ObjectId.generate().slice(8)) {
      return `${salt}:${await sha256(salt + plain)}`;
    }
    async checkPassword(plain) {
      const [salt, hash] = String(this.passwordHash).split(':');
      return (await sha256(salt + plain)) === hash;
    }
  }

  /** SHA-256 con Web Crypto (asíncrono). Si no está disponible, usa un hash simple. */
  async function sha256(text) {
    const subtle = global.crypto && global.crypto.subtle;
    if (subtle && typeof TextEncoder !== 'undefined') {
      const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0x811c9dc5; // FNV-1a de respaldo (solo para la demo)
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0').repeat(8);
  }

  // ======================================================================
  // Subdocumentos reutilizados (referencias extendidas)
  // ======================================================================
  class UserRef extends Embedded {
    constructor({ userId, username } = {}) { super(); this.userId = userId; this.username = username; }
    collectErrors(v) { return v.objectId(this.userId, 'userId').string(this.username, 'username', { min: 3, max: 20 }); }
    get initials() { return initials(this.username); }
  }
  class CategoryRef extends Embedded {
    constructor({ categoryId, name, slug } = {}) { super(); this.categoryId = categoryId; this.name = name; this.slug = slug; }
    collectErrors(v) { return v.objectId(this.categoryId, 'categoryId').string(this.name, 'name').string(this.slug, 'slug'); }
  }
  class TagRef extends Embedded {
    constructor({ tagId, name, slug } = {}) { super(); this.tagId = tagId; this.name = name; this.slug = slug; }
    collectErrors(v) { return v.objectId(this.tagId, 'tagId').string(this.name, 'name').string(this.slug, 'slug'); }
  }

  // ======================================================================
  // categories (con sus etiquetas incrustadas)
  // ======================================================================
  class Tag extends Embedded {
    constructor({ _id, name, slug } = {}) { super(); this._id = _id || ObjectId.generate(); this.name = name; this.slug = slug || slugify(name || ''); }
    collectErrors(v) {
      return v.objectId(this._id, '_id').string(this.name, 'name', { min: 2, max: 30 }).string(this.slug, 'slug', { pattern: /^[a-z0-9-]+$/ });
    }
    toRef() { return new TagRef({ tagId: this._id, name: this.name, slug: this.slug }); }
  }

  class Category extends Doc {
    static collection = 'categories';
    constructor({ _id, name, slug, tags = [] } = {}) {
      super({ _id });
      this.name = name;
      this.slug = slug || slugify(name || '');
      this.tags = tags.map((t) => (t instanceof Tag ? t : new Tag(t)));
    }
    collectErrors(v) {
      super.collectErrors(v);
      v.string(this.name, 'name', { min: 2, max: 20 }).string(this.slug, 'slug', { pattern: /^[a-z0-9-]+$/ }).array(this.tags, 'tags');
      this.tags.forEach((t, i) => v.nested(t, `tags.${i}`));
      return v;
    }
    toRef() { return new CategoryRef({ categoryId: this._id, name: this.name, slug: this.slug }); }
    findTag(tagId) { return this.tags.find((t) => t._id === tagId) || null; }
  }

  // ======================================================================
  // quizVersions (snapshot inmutable con preguntas y opciones incrustadas)
  // ======================================================================
  class Option extends Embedded {
    constructor({ _id, position, text, isCorrect = false } = {}) {
      super();
      this._id = _id || ObjectId.generate();
      this.position = position;
      this.text = typeof text === 'string' ? text.trim() : text;
      this.isCorrect = isCorrect;
    }
    collectErrors(v) {
      return v.objectId(this._id, '_id').integer(this.position, 'position', { min: 1 })
        .string(this.text, 'text', { min: 1, max: LIMITS.optionText, label: 'El texto de la opción' })
        .boolean(this.isCorrect, 'isCorrect');
    }
  }

  class Question extends Embedded {
    constructor({ _id, position, text, explanation = null, change = QuestionChange.NEW, options = [] } = {}) {
      super();
      this._id = _id || ObjectId.generate();
      this.position = position;
      this.text = typeof text === 'string' ? text.trim() : text;
      this.explanation = explanation ? String(explanation).trim() || null : null;
      this.change = change;
      this.options = options.map((o, i) => (o instanceof Option ? o : new Option({ position: i + 1, ...o })));
      /** /multiple: derivado, se calcula al crear la pregunta. */
      this.multiple = this.options.filter((o) => o.isCorrect).length > 1;
    }
    collectErrors(v) {
      v.objectId(this._id, '_id').integer(this.position, 'position', { min: 1 })
        .string(this.text, 'text', { min: 1, max: LIMITS.questionText, label: 'El enunciado' })
        .string(this.explanation, 'explanation', { required: false, max: LIMITS.explanation, label: 'La explicación' })
        .oneOf(this.change, 'change', Object.values(QuestionChange))
        .array(this.options, 'options', { min: LIMITS.options[0], max: LIMITS.options[1], label: 'Las opciones' });
      this.options.forEach((o, i) => v.nested(o, `options.${i}`));
      if (this.options.length && !this.options.some((o) => o.isCorrect)) v.add('options', 'Marca al menos una opción correcta');
      const texts = this.options.map((o) => (o.text || '').toLowerCase()).filter(Boolean);
      if (new Set(texts).size !== texts.length) v.add('options', 'Hay opciones repetidas');
      return v;
    }
    correctOptionIds() { return this.options.filter((o) => o.isCorrect).map((o) => o._id); }
    /** Regla «todo o nada»: el conjunto marcado debe ser igual al conjunto correcto. */
    isAnswerCorrect(selectedIds) {
      const correct = new Set(this.correctOptionIds());
      const chosen = new Set(selectedIds);
      return chosen.size === correct.size && [...chosen].every((id) => correct.has(id));
    }
    /** Huella del contenido, para saber si cambió entre versiones. */
    contentKey() {
      return JSON.stringify([this.text, this.explanation || '', this.options.map((o) => [o.text, o.isCorrect])]);
    }
  }

  class QuizVersion extends Doc {
    static collection = 'quizVersions';
    constructor({ _id, quizId, version, timeLimit = null, questions = [], changeSummary = 'Versión original', attemptCount = 0, createdAt, expiresAt = null } = {}) {
      super({ _id });
      this.quizId = quizId;
      this.version = version;
      this.timeLimit = timeLimit === undefined ? null : timeLimit;
      this.questions = questions.map((q, i) => (q instanceof Question ? q : new Question({ position: i + 1, ...q })));
      this.changeSummary = changeSummary;
      this.attemptCount = attemptCount;
      this.createdAt = toDate(createdAt) || new Date();
      this.expiresAt = toDate(expiresAt);
      // Derivados: se guardan para no recalcular en cada lectura
      this.questionCount = this.questions.length;
      this.hasMultiple = this.questions.some((q) => q.multiple);
    }
    collectErrors(v) {
      super.collectErrors(v);
      v.objectId(this.quizId, 'quizId').integer(this.version, 'version', { min: 1 })
        .array(this.questions, 'questions', { min: LIMITS.questions[0], max: LIMITS.questions[1], label: 'Las preguntas' })
        .string(this.changeSummary, 'changeSummary').integer(this.attemptCount, 'attemptCount', { min: 0 })
        .date(this.createdAt, 'createdAt').date(this.expiresAt, 'expiresAt', { required: false });
      if (this.timeLimit !== null) v.integer(this.timeLimit, 'timeLimit', { min: LIMITS.timeLimit[0], max: LIMITS.timeLimit[1], label: 'El límite de tiempo' });
      this.questions.forEach((q, i) => v.nested(q, `questions.${i}`));
      return v;
    }
    question(questionId) { return this.questions.find((q) => q._id === questionId) || null; }

    /** Lo que ve el jugador: sin isCorrect ni explicación (llegan al responder). */
    toPublic() {
      return {
        versionId: this._id, version: this.version, timeLimit: this.timeLimit,
        questions: this.questions.map((q) => ({
          questionId: q._id, position: q.position, text: q.text, multiple: q.multiple,
          options: q.options.map((o) => ({ optionId: o._id, text: o.text })),
        })),
      };
    }

    /** ¿El contenido de entrada es igual al de esta versión? (decide si hay versión nueva) */
    sameContentAs(questionsInput, timeLimit) {
      if ((this.timeLimit ?? null) !== (timeLimit ?? null)) return false;
      if (questionsInput.length !== this.questions.length) return false;
      return questionsInput.every((q, i) => new Question({ position: i + 1, ...q }).contentKey() === this.questions[i].contentKey());
    }

    /**
     * Construye la siguiente versión a partir de las preguntas del editor.
     * Marca cada pregunta como new / modified / unchanged y redacta changeSummary.
     */
    static build({ quizId, previous = null, questions, timeLimit = null, now = new Date() }) {
      const prevQs = previous ? previous.questions : [];
      const built = questions.map((input, i) => {
        const q = new Question({
          position: i + 1, text: input.text, explanation: input.explanation,
          options: (input.options || []).map((o, j) => ({ position: j + 1, text: o.text, isCorrect: !!o.isCorrect })),
        });
        const old = prevQs[i];
        q.change = !previous || !old ? QuestionChange.NEW : old.contentKey() === q.contentKey() ? QuestionChange.UNCHANGED : QuestionChange.MODIFIED;
        if (!previous) q.change = QuestionChange.NEW;
        return q;
      });
      const version = new QuizVersion({
        quizId, version: previous ? previous.version + 1 : 1, timeLimit, questions: built, createdAt: now,
        changeSummary: previous ? QuizVersion.describeChanges(previous, built, timeLimit) : 'Versión original',
      });
      return version;
    }

    /** "Cambió la pregunta 1 y agregó la pregunta 10 · Límite de tiempo: 20 → 30 min" */
    static describeChanges(previous, questions, timeLimit) {
      const list = (nums) => (nums.length === 1 ? `la pregunta ${nums[0]}` : `las preguntas ${nums.slice(0, -1).join(', ')} y ${nums[nums.length - 1]}`);
      const modified = questions.filter((q) => q.change === QuestionChange.MODIFIED).map((q) => q.position);
      const added = questions.filter((q) => q.change === QuestionChange.NEW).map((q) => q.position);
      const removed = Math.max(previous.questions.length - questions.length, 0);
      const parts = [];
      if (modified.length) parts.push(`cambió ${list(modified)}`);
      if (added.length) parts.push(`agregó ${list(added)}`);
      if (removed) parts.push(`quitó ${removed === 1 ? '1 pregunta' : `${removed} preguntas`}`);
      let text = parts.join(' y ');
      text = text ? text[0].toUpperCase() + text.slice(1) : '';
      const label = (t) => (t ? `${t} min` : 'sin límite');
      if ((previous.timeLimit ?? null) !== (timeLimit ?? null)) {
        text += `${text ? ' · ' : ''}Límite de tiempo: ${label(previous.timeLimit)} → ${label(timeLimit)}`;
      }
      return text || 'Reordenó el contenido';
    }
  }

  // ======================================================================
  // quizzes
  // ======================================================================
  class Quiz extends Doc {
    static collection = 'quizzes';
    constructor(data = {}) {
      super(data);
      const d = data;
      this.owner = d.owner instanceof UserRef ? d.owner : new UserRef(d.owner);
      this.title = typeof d.title === 'string' ? d.title.trim() : d.title;
      this.description = d.description ? String(d.description) : '';
      this.category = d.category instanceof CategoryRef ? d.category : new CategoryRef(d.category);
      this.tags = (d.tags || []).map((t) => (t instanceof TagRef ? t : new TagRef(t)));
      this.currentVersionId = d.currentVersionId || null;
      this.version = d.version || 0;
      this.timeLimit = d.timeLimit ?? null;
      this.questionCount = d.questionCount || 0;
      this.hasMultiple = !!d.hasMultiple;
      this.likesCount = d.likesCount || 0;
      this.playCount = d.playCount || 0;
      this.deletedAt = toDate(d.deletedAt);
      this.expiresAt = toDate(d.expiresAt);
      this.createdAt = toDate(d.createdAt) || new Date();
      this.updatedAt = toDate(d.updatedAt) || this.createdAt;
    }
    collectErrors(v) {
      super.collectErrors(v);
      v.nested(this.owner, 'owner')
        .string(this.title, 'title', { min: LIMITS.title[0], max: LIMITS.title[1], label: 'El título' })
        .string(this.description, 'description', { required: false, max: LIMITS.description, label: 'La descripción' })
        .nested(this.category, 'category')
        .array(this.tags, 'tags', { max: LIMITS.tags, label: 'Las etiquetas' })
        .objectId(this.currentVersionId, 'currentVersionId', { label: 'La versión vigente' })
        .integer(this.version, 'version', { min: 1 })
        .integer(this.likesCount, 'likesCount', { min: 0 }).integer(this.playCount, 'playCount', { min: 0 })
        .date(this.deletedAt, 'deletedAt', { required: false }).date(this.expiresAt, 'expiresAt', { required: false });
      this.tags.forEach((t, i) => v.nested(t, `tags.${i}`));
      if (new Set(this.tags.map((t) => t.tagId)).size !== this.tags.length) v.add('tags', 'Hay etiquetas repetidas');
      return v;
    }
    get isDeleted() { return this.deletedAt !== null; }
    isOwnedBy(userId) { return !!userId && this.owner.userId === userId; }

    /** Apunta el quiz a una versión nueva y copia sus datos derivados. */
    publishVersion(version, now = new Date()) {
      if (this.isDeleted) throw new DomainError('QUIZ_DELETED', 'El quiz fue eliminado');
      if (version.quizId !== this._id) throw new DomainError('VERSION_MISMATCH', 'La versión pertenece a otro quiz');
      if (version.version !== this.version + 1) throw new DomainError('VERSION_MISMATCH', `Se esperaba la versión ${this.version + 1}`);
      this.currentVersionId = version._id;
      this.version = version.version;
      this.timeLimit = version.timeLimit;
      this.questionCount = version.questionCount;
      this.hasMultiple = version.hasMultiple;
      this.updatedAt = now;
      return this;
    }

    /** Cambios que NO crean versión. */
    updateDetails({ title, description, category, tags }, now = new Date()) {
      if (this.isDeleted) throw new DomainError('QUIZ_DELETED', 'El quiz fue eliminado');
      if (title !== undefined) this.title = String(title).trim();
      if (description !== undefined) this.description = description || '';
      if (category) this.category = category;
      if (tags) this.tags = tags;
      this.updatedAt = now;
      return this;
    }

    /** Borrado lógico: desaparece del catálogo y se programa su eliminación en 3 meses. */
    softDelete(now = new Date()) {
      if (this.isDeleted) throw new DomainError('QUIZ_DELETED', 'El quiz ya estaba eliminado');
      this.deletedAt = now;
      this.expiresAt = addMonths(now, LIMITS.deleteMonths);
      this.updatedAt = now;
      return this.expiresAt;
    }

    toCard() {
      return {
        quizId: this._id, title: this.title,
        category: { ...this.category, slug: this.category.slug }, owner: { userId: this.owner.userId, username: this.owner.username, initials: this.owner.initials },
        tags: this.tags.map((t) => ({ ...t })), timeLimit: this.timeLimit, questionCount: this.questionCount,
        likesCount: this.likesCount, playCount: this.playCount, hasMultiple: this.hasMultiple,
      };
    }
  }

  // ======================================================================
  // attempts (con sus respuestas incrustadas)
  // ======================================================================
  class Answer extends Embedded {
    constructor({ questionId, selectedOptionIds = [], isCorrect = false, answeredAt } = {}) {
      super();
      this.questionId = questionId;
      this.selectedOptionIds = [...selectedOptionIds];
      this.isCorrect = isCorrect;
      this.answeredAt = toDate(answeredAt) || new Date();
    }
    collectErrors(v) {
      v.objectId(this.questionId, 'questionId').array(this.selectedOptionIds, 'selectedOptionIds', { min: 1, max: LIMITS.options[1] }).boolean(this.isCorrect, 'isCorrect');
      this.selectedOptionIds.forEach((id, i) => v.objectId(id, `selectedOptionIds.${i}`));
      return v;
    }
  }

  class Attempt extends Doc {
    static collection = 'attempts';
    static GRACE_MS = LIMITS.graceMs;
    constructor(data = {}) {
      super(data);
      const d = data;
      this.userId = d.userId;
      this.quizId = d.quizId;
      this.versionId = d.versionId;
      this.version = d.version;
      this.status = d.status || AttemptStatus.IN_PROGRESS;
      this.timedOut = !!d.timedOut;
      this.score = d.score ?? 0;
      this.total = d.total;
      this.answers = (d.answers || []).map((a) => (a instanceof Answer ? a : new Answer(a)));
      this.startedAt = toDate(d.startedAt) || new Date();
      this.deadlineAt = toDate(d.deadlineAt);
      this.finishedAt = toDate(d.finishedAt);
      this.expiresAt = toDate(d.expiresAt);
    }
    collectErrors(v) {
      super.collectErrors(v);
      v.objectId(this.userId, 'userId').objectId(this.quizId, 'quizId').objectId(this.versionId, 'versionId')
        .integer(this.version, 'version', { min: 1 }).oneOf(this.status, 'status', Object.values(AttemptStatus))
        .boolean(this.timedOut, 'timedOut').integer(this.score, 'score', { min: 0 }).integer(this.total, 'total', { min: 1 })
        .array(this.answers, 'answers', { max: LIMITS.questions[1] })
        .date(this.startedAt, 'startedAt').date(this.deadlineAt, 'deadlineAt', { required: false }).date(this.finishedAt, 'finishedAt', { required: false });
      this.answers.forEach((a, i) => v.nested(a, `answers.${i}`));
      if (this.score > this.total) v.add('score', 'El puntaje no puede superar el total');
      return v;
    }

    /** Crea un intento con la versión vigente del quiz. */
    static start({ user, quiz, version, now = new Date() }) {
      if (quiz.isDeleted) throw new DomainError('QUIZ_DELETED', 'Este quiz ya no está disponible');
      if (quiz.currentVersionId !== version._id) throw new DomainError('VERSION_MISMATCH', 'Solo se puede jugar la versión vigente');
      return new Attempt({
        userId: user._id, quizId: quiz._id, versionId: version._id, version: version.version,
        total: version.questionCount, startedAt: now,
        deadlineAt: version.timeLimit ? new Date(now.getTime() + version.timeLimit * 60000) : null,
      });
    }

    get answeredCount() { return this.answers.length; }
    get percentage() { return this.total ? Math.round((this.score / this.total) * 100) : 0; }
    get isOpen() { return this.status === AttemptStatus.IN_PROGRESS; }
    /** Milisegundos que quedan (null si no hay límite). */
    remainingMs(now = new Date()) { return this.deadlineAt ? Math.max(0, this.deadlineAt - now) : null; }
    isPastDeadline(now = new Date(), grace = 0) { return !!this.deadlineAt && now.getTime() > this.deadlineAt.getTime() + grace; }

    /** Registra una respuesta y la califica. Devuelve la Answer creada. */
    answer(version, questionId, selectedOptionIds, now = new Date()) {
      if (!this.isOpen) throw new DomainError('ATTEMPT_CLOSED', 'Este intento ya terminó');
      if (this.isPastDeadline(now, Attempt.GRACE_MS)) throw new DomainError('TIME_UP', 'Se acabó el tiempo');
      if (version._id !== this.versionId) throw new DomainError('VERSION_MISMATCH', 'La pregunta es de otra versión');
      const question = version.question(questionId);
      if (!question) throw new DomainError('INVALID_QUESTION', 'La pregunta no existe en esta versión');
      if (this.answers.some((a) => a.questionId === questionId)) throw new DomainError('ALREADY_ANSWERED', 'Esta pregunta ya se respondió');
      const ids = [...new Set(selectedOptionIds || [])];
      if (!ids.length) throw new DomainError('INVALID_OPTION', 'Marca al menos una opción');
      const valid = new Set(question.options.map((o) => o._id));
      if (!ids.every((id) => valid.has(id))) throw new DomainError('INVALID_OPTION', 'Alguna opción no pertenece a la pregunta');
      if (!question.multiple && ids.length > 1) throw new DomainError('INVALID_OPTION', 'Esta pregunta tiene una sola respuesta');

      const answer = new Answer({ questionId, selectedOptionIds: ids, isCorrect: question.isAnswerCorrect(ids), answeredAt: now });
      this.answers.push(answer);
      if (answer.isCorrect) this.score += 1;
      return answer;
    }

    /** Termina el intento. reason = 'timeout' cuando el cronómetro llegó a cero. */
    finish(reason = null, now = new Date()) {
      if (!this.isOpen) throw new DomainError('ATTEMPT_CLOSED', 'Este intento ya terminó');
      this.status = AttemptStatus.COMPLETED;
      this.timedOut = reason === 'timeout' || this.isPastDeadline(now);
      this.finishedAt = now;
      return { score: this.score, total: this.total, percentage: this.percentage, timedOut: this.timedOut };
    }

    /** Cierra la pestaña o pulsa Salir. Devuelve false si ya estaba cerrado. */
    abandon(now = new Date()) {
      if (!this.isOpen) return false;
      this.status = AttemptStatus.ABANDONED;
      this.finishedAt = now;
      return true;
    }
  }

  // ======================================================================
  // likes y comments
  // ======================================================================
  class Like extends Doc {
    static collection = 'likes';
    constructor({ _id, userId, quizId, createdAt, expiresAt = null } = {}) {
      super({ _id });
      Object.assign(this, { userId, quizId, createdAt: toDate(createdAt) || new Date(), expiresAt: toDate(expiresAt) });
    }
    collectErrors(v) {
      super.collectErrors(v);
      return v.objectId(this.userId, 'userId').objectId(this.quizId, 'quizId').date(this.createdAt, 'createdAt');
    }
  }

  class Comment extends Doc {
    static collection = 'comments';
    constructor({ _id, quizId, parentId = null, author, body, deleted = false, replyCount = 0, createdAt, expiresAt = null } = {}) {
      super({ _id });
      this.quizId = quizId;
      this.parentId = parentId;
      this.author = author instanceof UserRef ? author : new UserRef(author);
      this.body = typeof body === 'string' ? body.trim() : body;
      this.deleted = deleted;
      this.replyCount = replyCount;
      this.createdAt = toDate(createdAt) || new Date();
      this.expiresAt = toDate(expiresAt);
    }
    collectErrors(v) {
      super.collectErrors(v);
      v.objectId(this.quizId, 'quizId').objectId(this.parentId, 'parentId', { required: false }).nested(this.author, 'author')
        .boolean(this.deleted, 'deleted').integer(this.replyCount, 'replyCount', { min: 0 });
      if (!this.deleted) v.string(this.body, 'body', { min: 1, max: LIMITS.comment, label: 'El comentario' });
      return v;
    }
    get isReply() { return this.parentId !== null; }
    /** Si tiene respuestas, se conserva como «[comentario eliminado]». */
    markDeleted() { this.deleted = true; this.body = ''; return this; }
  }

  QT.models = { Doc, Embedded, User, UserRef, Category, CategoryRef, Tag, TagRef, Quiz, QuizVersion, Question, Option, Attempt, Answer, Like, Comment };
  Object.assign(QT, { AttemptStatus, QuestionChange, LIMITS, DomainError });
})(typeof window !== 'undefined' ? window : globalThis);
