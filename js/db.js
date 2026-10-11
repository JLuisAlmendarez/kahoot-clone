/* ============================================================================
   db.js — Base de datos simulada que se comporta como MongoDB.
   - Una Collection por colección del diagrama 1.
   - Todas las operaciones son asíncronas (devuelven promesas) y tienen
     latencia aleatoria, como un servidor real.
   - Valida cada documento antes de guardarlo (como Mongoose).
   - Índices únicos → DuplicateKeyError (código 11000).
   - transaction(): si algo falla, regresa todo a como estaba.
   - sweepExpired(): borra lo que tenga expiresAt vencido (índice TTL).
   - Guarda en localStorage para que los datos sigan al cambiar de página.

   Los filtros son funciones: find(q => q.owner.userId === id) equivale a
   Quiz.find({ 'owner.userId': id }) en Mongoose.
   ========================================================================== */
(function (global) {
  'use strict';
  const QT = global.QT;
  const { DuplicateKeyError, deepCopy, log, sleep } = QT;
  const M = QT.models;

  class Collection {
    /**
     * @param {MockDB} db
     * @param {typeof M.Doc} Model clase del documento
     * @param {{ unique?: string[][] }} options índices únicos (lista de campos)
     */
    constructor(db, Model, { unique = [] } = {}) {
      this.db = db;
      this.Model = Model;
      this.name = Model.collection;
      this.unique = unique;
      /** @type {Map<string, object>} documentos guardados como objetos planos */
      this.docs = new Map();
    }

    // ---------- ayudantes internos (síncronos) ----------
    #hydrate(plain) { return plain ? this.Model.fromJSON(deepCopy(plain)) : null; }
    #checkUnique(doc) {
      for (const fields of this.unique) {
        const key = (d) => fields.map((f) => String(f.split('.').reduce((o, k) => o?.[k], d)).toLowerCase()).join('|');
        const mine = key(doc);
        for (const other of this.docs.values()) {
          if (other._id !== doc._id && key(other) === mine) throw new DuplicateKeyError(this.name, fields);
        }
      }
    }
    /** Guarda sin latencia. Lo usan la semilla y el envío tipo sendBeacon. */
    putSync(doc) {
      if (!(doc instanceof this.Model)) doc = new this.Model(doc);
      doc.validate();
      this.#checkUnique(doc);
      this.docs.set(doc._id, doc.toObject());
      this.db.persist();
      return doc;
    }
    findByIdSync(id) { return this.#hydrate(this.docs.get(id)); }
    all() { return [...this.docs.values()].map((p) => this.#hydrate(p)); }

    // ---------- API asíncrona (lo que usaría el servidor) ----------
    async insertOne(doc) {
      await this.db.delay(`insert ${this.name}`);
      const saved = this.putSync(doc);
      log.db(`insertOne ${this.name}`, saved._id);
      return this.#hydrate(this.docs.get(saved._id));
    }

    async findById(id) {
      await this.db.delay(`findById ${this.name}`);
      return this.#hydrate(this.docs.get(id));
    }

    async findOne(filter = () => true) {
      await this.db.delay(`findOne ${this.name}`);
      for (const plain of this.docs.values()) {
        const doc = this.#hydrate(plain);
        if (filter(doc)) return doc;
      }
      return null;
    }

    /** find(filtro, { sort, skip, limit }) — sort recibe (a, b) como Array.sort */
    async find(filter = () => true, { sort, skip = 0, limit = Infinity } = {}) {
      await this.db.delay(`find ${this.name}`);
      let list = this.all().filter(filter);
      if (sort) list.sort(sort);
      return list.slice(skip, skip + limit);
    }

    async count(filter = () => true) {
      await this.db.delay(`count ${this.name}`);
      return this.all().filter(filter).length;
    }

    /**
     * Lee, modifica y guarda un documento. El mutador es síncrono a propósito:
     * entre leer y escribir no hay ningún await, así que ninguna otra operación
     * se mete en medio. Así se simulan las operaciones atómicas de MongoDB ($inc, $push).
     */
    async updateOne(id, mutator) {
      await this.db.delay(`update ${this.name}`);
      return this.updateSync(id, mutator);
    }
    updateSync(id, mutator) {
      const doc = this.#hydrate(this.docs.get(id));
      if (!doc) return null;
      const result = mutator(doc);
      if (result && typeof result.then === 'function') throw new Error('El mutador de updateOne debe ser síncrono');
      this.putSync(doc);
      return doc;
    }

    async updateMany(filter, mutator) {
      await this.db.delay(`updateMany ${this.name}`);
      let n = 0;
      for (const doc of this.all()) {
        if (filter(doc)) { mutator(doc); this.putSync(doc); n++; }
      }
      log.db(`updateMany ${this.name}: ${n}`);
      return n;
    }

    async deleteOne(id) {
      await this.db.delay(`delete ${this.name}`);
      const existed = this.docs.delete(id);
      if (existed) this.db.persist();
      return existed;
    }

    async deleteMany(filter) {
      await this.db.delay(`deleteMany ${this.name}`);
      let n = 0;
      for (const doc of this.all()) if (filter(doc)) { this.docs.delete(doc._id); n++; }
      if (n) this.db.persist();
      return n;
    }
  }

  class MockDB {
    /**
     * @param {object} o
     * @param {Storage|null} o.storage localStorage (null = solo en memoria)
     * @param {[number, number]} o.latency rango de latencia en ms
     * @param {number} o.failRate probabilidad (0–1) de que una lectura falle
     */
    constructor({ storage = null, storageKey = 'quiztopia-db-v1', latency = [60, 220], failRate = 0 } = {}) {
      this.storage = storage;
      this.storageKey = storageKey;
      this.latency = latency;
      this.failRate = failRate;
      this.users = new Collection(this, M.User, { unique: [['username'], ['email']] });
      this.categories = new Collection(this, M.Category, { unique: [['slug']] });
      this.quizzes = new Collection(this, M.Quiz);
      this.quizVersions = new Collection(this, M.QuizVersion, { unique: [['quizId', 'version']] });
      this.attempts = new Collection(this, M.Attempt);
      this.likes = new Collection(this, M.Like, { unique: [['userId', 'quizId']] });
      this.comments = new Collection(this, M.Comment);
      this.collections = [this.users, this.categories, this.quizzes, this.quizVersions, this.attempts, this.likes, this.comments];
      this.#paused = false;
    }
    #paused;

    /** Espera una latencia aleatoria; a veces falla si failRate > 0 (para ver estados de error). */
    async delay(label) {
      const [min, max] = this.latency;
      if (max > 0) await sleep(min + Math.random() * (max - min));
      if (this.failRate > 0 && /^find|^count/.test(label) && Math.random() < this.failRate) {
        throw new Error(`Fallo de red simulado (${label})`);
      }
    }

    // ---------- persistencia ----------
    load() {
      if (!this.storage) return false;
      let raw = null;
      try { raw = this.storage.getItem(this.storageKey); } catch (e) { return false; }
      if (!raw) return false;
      try {
        const data = JSON.parse(raw);
        for (const c of this.collections) {
          c.docs = new Map((data.collections[c.name] || []).map((d) => [d._id, d]));
        }
        return true;
      } catch (e) {
        log.warn('No se pudo leer la base guardada; se vuelve a sembrar.', e);
        return false;
      }
    }
    persist() {
      if (!this.storage || this.#paused) return;
      const data = { version: 1, savedAt: new Date().toISOString(), collections: {} };
      for (const c of this.collections) data.collections[c.name] = [...c.docs.values()];
      try { this.storage.setItem(this.storageKey, JSON.stringify(data)); } catch (e) { log.warn('No se pudo guardar en localStorage', e); }
    }
    get isEmpty() { return this.collections.every((c) => c.docs.size === 0); }

    /** Agrupa varias escrituras: si fn lanza un error, se restaura todo. */
    async transaction(fn) {
      const snapshot = this.collections.map((c) => new Map([...c.docs].map(([k, v]) => [k, deepCopy(v)])));
      this.#paused = true;
      try {
        const result = await fn(this);
        this.#paused = false;
        this.persist();
        return result;
      } catch (err) {
        this.collections.forEach((c, i) => { c.docs = snapshot[i]; });
        this.#paused = false;
        this.persist();
        log.db('transacción revertida: ' + err.message);
        throw err;
      }
    }

    /** Índice TTL: borra documentos cuyo expiresAt ya pasó. */
    sweepExpired(now = new Date()) {
      let removed = 0;
      for (const c of this.collections) {
        for (const [id, d] of c.docs) {
          if (d.expiresAt && new Date(d.expiresAt) <= now) { c.docs.delete(id); removed++; }
        }
      }
      if (removed) { this.persist(); log.db(`TTL: se eliminaron ${removed} documentos vencidos`); }
      return removed;
    }

    clear() { this.collections.forEach((c) => c.docs.clear()); this.persist(); }

    /** Muestra en consola cuántos documentos hay por colección. */
    stats() {
      const rows = Object.fromEntries(this.collections.map((c) => [c.name, c.docs.size]));
      if (typeof console.table === 'function') console.table(rows);
      return rows;
    }
  }

  Object.assign(QT, { Collection, MockDB });
})(typeof window !== 'undefined' ? window : globalThis);
