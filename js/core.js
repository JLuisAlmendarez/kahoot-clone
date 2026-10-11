/* ============================================================================
   core.js — Piezas base que usan todos los demás archivos.
   - ObjectId: identificadores con el mismo formato que MongoDB (24 hex).
   - Errores: ValidationError (datos inválidos) y ApiError (respuesta HTTP).
   - Validator: acumula errores campo por campo, como un esquema de Mongoose.
   - log: registro en consola de cada operación (grupos, tiempos, colores).
   - Utilidades async: sleep, withTimeout, addMonths.

   Se carga como <script> clásico (no módulo) para que funcione al abrir los
   archivos con file:// y también desde un servidor. Todo vive en window.QT.
   ========================================================================== */
(function (global) {
  'use strict';
  const QT = (global.QT = global.QT || {});

  // ---------------------------------------------------------------------------
  // ObjectId: 4 bytes de tiempo + 8 bytes aleatorios, en hexadecimal (24 chars)
  // ---------------------------------------------------------------------------
  class ObjectId {
    static #counter = Math.floor(Math.random() * 0xffffff);

    /** Genera un id nuevo. El prefijo de tiempo hace que los ids se ordenen por creación. */
    static generate(date = new Date()) {
      const time = Math.floor(date.getTime() / 1000).toString(16).padStart(8, '0');
      let random = '';
      for (let i = 0; i < 10; i++) random += Math.floor(Math.random() * 16).toString(16);
      ObjectId.#counter = (ObjectId.#counter + 1) % 0xffffff;
      const counter = ObjectId.#counter.toString(16).padStart(6, '0');
      return (time + random + counter).slice(0, 24);
    }

    static isValid(value) {
      return typeof value === 'string' && /^[0-9a-f]{24}$/.test(value);
    }

    /** Fecha de creación codificada en los primeros 8 caracteres. */
    static getTimestamp(id) {
      return new Date(parseInt(id.slice(0, 8), 16) * 1000);
    }
  }

  // ---------------------------------------------------------------------------
  // Errores
  // ---------------------------------------------------------------------------
  /** Datos que no cumplen el esquema. fields = [{ path, message }] */
  class ValidationError extends Error {
    constructor(fields, message = 'Los datos no son válidos') {
      super(message);
      this.name = 'ValidationError';
      this.fields = fields;
    }
  }

  /** Clave única repetida (equivale al error 11000 de MongoDB). */
  class DuplicateKeyError extends Error {
    constructor(collection, keys) {
      super(`Ya existe un documento en ${collection} con ${keys.join(', ')} repetido`);
      this.name = 'DuplicateKeyError';
      this.code = 11000;
      this.keys = keys;
    }
  }

  /** Error con forma de respuesta HTTP: lo que recibiría el front desde Express. */
  class ApiError extends Error {
    constructor(status, code, message, fields = []) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.fields = fields;
    }
    toJSON() {
      return { success: false, error: { code: this.code, message: this.message, fields: this.fields } };
    }
    static badRequest(message, fields) { return new ApiError(400, 'VALIDATION_ERROR', message, fields); }
    static unauthorized(message = 'Inicia sesión para continuar') { return new ApiError(401, 'UNAUTHORIZED', message); }
    static forbidden(message = 'No tienes permiso para hacer esto') { return new ApiError(403, 'FORBIDDEN', message); }
    static notFound(message = 'No encontrado') { return new ApiError(404, 'NOT_FOUND', message); }
    static conflict(message, fields) { return new ApiError(409, 'CONFLICT', message, fields); }
    static tooMany(message = 'Demasiadas solicitudes, espera un momento') { return new ApiError(429, 'RATE_LIMITED', message); }
  }

  // ---------------------------------------------------------------------------
  // Validator: se crea uno por documento, se llaman sus reglas y al final
  // throwIfErrors() lanza un ValidationError con todos los problemas juntos.
  // ---------------------------------------------------------------------------
  class Validator {
    constructor(prefix = '') {
      this.prefix = prefix;
      this.errors = [];
    }
    #path(p) { return this.prefix ? `${this.prefix}.${p}` : p; }
    add(path, message) { this.errors.push({ path: this.#path(path), message }); return this; }
    get ok() { return this.errors.length === 0; }

    required(value, path, label = path) {
      if (value === undefined || value === null || value === '') this.add(path, `${label} es obligatorio`);
      return this;
    }
    string(value, path, { min = 0, max = Infinity, required = true, pattern, label = path, patternMessage } = {}) {
      if (value === undefined || value === null || value === '') {
        if (required) this.add(path, `${label} es obligatorio`);
        return this;
      }
      if (typeof value !== 'string') return this.add(path, `${label} debe ser texto`);
      const len = value.trim().length;
      if (len < min) this.add(path, `${label} debe tener al menos ${min} caracteres`);
      if (value.length > max) this.add(path, `${label} debe tener máximo ${max} caracteres`);
      if (pattern && !pattern.test(value)) this.add(path, patternMessage || `${label} tiene un formato inválido`);
      return this;
    }
    integer(value, path, { min = -Infinity, max = Infinity, required = true, label = path } = {}) {
      if (value === undefined || value === null) {
        if (required) this.add(path, `${label} es obligatorio`);
        return this;
      }
      if (!Number.isInteger(value)) return this.add(path, `${label} debe ser un número entero`);
      if (value < min || value > max) this.add(path, `${label} debe estar entre ${min} y ${max}`);
      return this;
    }
    boolean(value, path, { label = path } = {}) {
      if (typeof value !== 'boolean') this.add(path, `${label} debe ser verdadero o falso`);
      return this;
    }
    objectId(value, path, { required = true, label = path } = {}) {
      if (value === undefined || value === null) {
        if (required) this.add(path, `${label} es obligatorio`);
        return this;
      }
      if (!ObjectId.isValid(value)) this.add(path, `${label} no es un ObjectId válido`);
      return this;
    }
    date(value, path, { required = true, label = path } = {}) {
      if (value === undefined || value === null) {
        if (required) this.add(path, `${label} es obligatorio`);
        return this;
      }
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) this.add(path, `${label} no es una fecha válida`);
      return this;
    }
    oneOf(value, path, allowed, { label = path } = {}) {
      if (!allowed.includes(value)) this.add(path, `${label} debe ser uno de: ${allowed.join(', ')}`);
      return this;
    }
    array(value, path, { min = 0, max = Infinity, label = path } = {}) {
      if (!Array.isArray(value)) return this.add(path, `${label} debe ser una lista`);
      if (value.length < min) this.add(path, `${label} necesita al menos ${min} elemento(s)`);
      if (value.length > max) this.add(path, `${label} admite máximo ${max} elemento(s)`);
      return this;
    }
    /** Valida un subdocumento y agrega sus errores con la ruta completa. */
    nested(child, path) {
      if (!child || typeof child.collectErrors !== 'function') return this.add(path, `${path} no es válido`);
      child.collectErrors(new Validator(this.#path(path))).errors.forEach((e) => this.errors.push(e));
      return this;
    }
    throwIfErrors(message) {
      if (!this.ok) throw new ValidationError(this.errors, message);
    }
  }

  // ---------------------------------------------------------------------------
  // Registro en consola. QT.log.enabled = false lo apaga.
  // ---------------------------------------------------------------------------
  const STYLE = {
    get: 'color:#0369a1;font-weight:600', post: 'color:#15803d;font-weight:600', put: 'color:#b45309;font-weight:600',
    delete: 'color:#b91c1c;font-weight:600', ok: 'color:#15803d', error: 'color:#b91c1c;font-weight:600', db: 'color:#7c3aed',
    muted: 'color:#6b7280',
  };
  const hasConsoleGroups = typeof console !== 'undefined' && typeof console.groupCollapsed === 'function';
  const log = {
    enabled: true,
    /** Una petición a la API: abre un grupo plegado con la entrada, la salida y el tiempo. */
    request(method, path, input, output, ms, error) {
      if (!log.enabled || !hasConsoleGroups) return;
      const m = method.toLowerCase();
      const status = error ? `✘ ${error.status || 500} ${error.code || error.name}` : '✔ 200';
      console.groupCollapsed(`%c${method}%c ${path} %c${status} %c${ms.toFixed(0)} ms`, STYLE[m] || '', '', error ? STYLE.error : STYLE.ok, STYLE.muted);
      if (input !== undefined) console.log('Entrada:', input);
      if (error) {
        console.warn('Error:', error.message);
        if (error.fields && error.fields.length) console.table(error.fields);
      } else {
        console.log('Respuesta:', output);
      }
      console.groupEnd();
    },
    db(message, ...rest) {
      if (log.enabled) console.debug(`%c[db]%c ${message}`, STYLE.db, '', ...rest);
    },
    info(message, ...rest) {
      if (log.enabled) console.info(`%c[Quiztopia]%c ${message}`, 'color:#4338ca;font-weight:700', '', ...rest);
    },
    warn(message, ...rest) {
      if (log.enabled) console.warn(`[Quiztopia] ${message}`, ...rest);
    },
  };

  // ---------------------------------------------------------------------------
  // Utilidades de tiempo y promesas
  // ---------------------------------------------------------------------------
  /** Promesa que se resuelve después de ms milisegundos. */
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Rechaza si la promesa tarda más de ms (Promise.race contra un temporizador). */
  function withTimeout(promise, ms, message = 'La operación tardó demasiado') {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ApiError(504, 'TIMEOUT', message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  /** Suma meses respetando fin de mes (31 ene + 1 mes = 28/29 feb). */
  function addMonths(date, months) {
    const d = new Date(date.getTime());
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return d;
  }

  /** Copia profunda de datos planos (lo que se guarda en la "base"). */
  const deepCopy = (value) => JSON.parse(JSON.stringify(value));

  /** Iniciales para el avatar: "ana_dev" → "AN". */
  const initials = (username = '') => username.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase();

  /** "Química básica" → "quimica-basica" */
  const slugify = (text) =>
    String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  Object.assign(QT, { ObjectId, ValidationError, DuplicateKeyError, ApiError, Validator, log, sleep, withTimeout, addMonths, deepCopy, initials, slugify });
})(typeof window !== 'undefined' ? window : globalThis);
