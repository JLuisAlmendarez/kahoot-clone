/* ============================================================================
   seed.js — Datos de ejemplo (los mismos que muestran las vistas y GUIA.md).
   Se cargan solo si la base está vacía. QT.db.reset() vuelve a sembrar.
   Contraseña de todos los usuarios de ejemplo: quiztopia123

   Nota: likesCount, playCount y attemptCount arrancan con valores que simulan
   la actividad de otros usuarios; a partir de ahí cambian con cada acción.
   ========================================================================== */
(function (global) {
  'use strict';
  const QT = global.QT;
  const { User, Category, Tag, Quiz, QuizVersion, Attempt, Answer, Like, Comment } = QT.models;
  const { AttemptStatus, addMonths } = QT;

  /** ObjectId fijo y legible: tipo + número. */
  const oid = (kind, n) => ('66f0' + kind).padEnd(20, '0') + n.toString(16).padStart(4, '0');
  const D = (iso) => new Date(iso);
  /** Pregunta compacta: Q(texto, [opciones], [índices correctos], explicación) */
  const Q = (text, options, correct, explanation = null) => ({
    text, explanation, options: options.map((t, i) => ({ text: t, isCorrect: correct.includes(i) })),
  });

  const ID = {
    ana: oid('a', 1), luis: oid('a', 2), ricardo: oid('a', 3), gael: oid('a', 4),
    aws: oid('c', 1), python: oid('c', 2), algebra: oid('c', 3), derivadas: oid('c', 4),
    osi: oid('c', 5), git: oid('c', 6), gcp: oid('c', 7), fisica: oid('c', 8),
    catCertificaciones: oid('b', 1), catProgramacion: oid('b', 2), catMatematicas: oid('b', 3),
    catQuimica: oid('b', 4), catFisica: oid('b', 5), catBiologia: oid('b', 6),
  };
  /** Ids cortos que usan los enlaces de las maquetas (quiz.html?id=q-aws). */
  const aliases = {
    'q-aws': ID.aws, 'q-python': ID.python, 'q-algebra': ID.algebra, 'q-derivadas': ID.derivadas,
    'q-osi': ID.osi, 'q-git': ID.git, 'q-gcp': ID.gcp, 'q-fisica': ID.fisica,
    'a-algebra-1': oid('e', 1), 'a-algebra-2': oid('e', 2), 'a-aws-1': oid('e', 3), 'a-fisica-1': oid('e', 5),
  };

  const CATEGORIES = [
    ['Certificaciones', ['aws', 'azure', 'gcp', 'linux', 'redes', 'ciberseguridad']],
    ['Programación', ['sql', 'python', 'javascript', 'git']],
    ['Matemáticas', ['algebra', 'calculo', 'estadistica']],
    ['Química', ['estequiometria', 'quimica organica']],
    ['Física', ['fisica 1', 'fisica 2']],
    ['Biología', ['biologia molecular', 'biologia evolutiva']],
  ];

  // ----------------------------------------------------------- contenido
  const BANK = {
    aws: [
      Q('¿Qué servicio de AWS ofrece **almacenamiento de objetos**?', ['Amazon S3', 'Amazon EC2', 'Amazon RDS', 'AWS Lambda'], [0], 'Amazon S3 guarda objetos en *buckets*. EC2 es cómputo y RDS bases de datos.'),
      Q('¿Cuáles de los siguientes son **beneficios** de la nube?', ['Pagar solo por lo que usas', 'Escalar según la demanda', 'Eliminar toda responsabilidad de seguridad', 'Desplegar globalmente en minutos'], [0, 1, 3], 'La nube permite pagar por uso, escalar y desplegar rápido; la seguridad sigue siendo compartida.'),
      Q('Según el modelo de responsabilidad compartida, ¿quién parchea el sistema operativo de una instancia EC2?', ['El cliente', 'AWS', 'Ambos por igual'], [0], 'En EC2 el sistema operativo invitado es responsabilidad del cliente.'),
      Q('¿Qué servicio permite ejecutar código **sin administrar servidores**?', ['AWS Lambda', 'Amazon EC2', 'Amazon EBS'], [0], 'Lambda es el servicio *serverless* de cómputo por eventos.'),
    ],
    algebraBase: [
      Q('¿Cuál es el determinante de la matriz identidad de 3×3?', ['1', '0', '3'], [0], 'El determinante de cualquier identidad es 1.'),
      Q('Si intercambias dos renglones de una matriz, su determinante…', ['No cambia', 'Cambia de signo', 'Se duplica'], [1], 'Cada intercambio multiplica el determinante por −1.'),
      Q('¿Qué condición garantiza que A tenga inversa?', ['det(A) ≠ 0', 'det(A) = 1', 'A es simétrica'], [0]),
      Q('El producto AB está definido cuando…', ['Las columnas de A son tantas como los renglones de B', 'A y B tienen los mismos renglones', 'A y B son cuadradas'], [0]),
      Q('La transpuesta de un vector renglón de 1×3 es…', ['Un vector columna de 3×1', 'Otro vector renglón de 1×3', 'Una matriz de 3×3'], [0]),
      Q('Si multiplicas un renglón por k, el determinante…', ['Se multiplica por k', 'No cambia', 'Se divide entre k'], [0]),
      Q('¿Qué operación por renglón NO cambia el determinante?', ['Sumar a un renglón un múltiplo de otro', 'Intercambiar dos renglones', 'Multiplicar un renglón por 2'], [0]),
      Q('El determinante de una matriz triangular superior es…', ['El producto de su diagonal', 'La suma de su diagonal', 'Siempre cero'], [0]),
    ],
    python: [
      Q('¿Qué devuelve `len([1, 2, 3])`?', ['3', '2', '6'], [0]),
      Q('¿Cuáles crean una lista vacía?', ['`[]`', '`list()`', '`{}`'], [0, 1], '`{}` crea un diccionario vacío.'),
      Q('¿Cómo lees la clave "a" de `d` sin error si no existe?', ['`d.get("a")`', '`d["a"]`', '`d.a`'], [0]),
      Q('¿Qué hace `lista.append(x)`?', ['Agrega x al final', 'Agrega x al inicio', 'Regresa una lista nueva'], [0]),
      Q('`[x * 2 for x in range(3)]` produce…', ['`[0, 2, 4]`', '`[2, 4, 6]`', '`[0, 1, 2]`'], [0]),
      Q('¿Cuáles tipos son mutables?', ['Lista', 'Diccionario', 'Tupla'], [0, 1]),
    ],
    derivadas: [
      Q('d/dx de x²', ['2x', 'x', '2'], [0]),
      Q('d/dx de sen(x)', ['cos(x)', '−cos(x)', '−sen(x)'], [0]),
      Q('Regla de la cadena: d/dx f(g(x)) =', ["f'(g(x)) · g'(x)", "f'(x) · g'(x)", "f(g'(x))"], [0]),
      Q('d/dx de una constante', ['0', '1', 'La misma constante'], [0]),
      Q('d/dx de eˣ', ['eˣ', 'x · eˣ⁻¹', '1'], [0]),
      Q('Derivada de un producto f · g', ["f'g + fg'", "f'g'", "f'g − fg'"], [0]),
    ],
    osi: [
      Q('¿Cuántas capas tiene el modelo OSI?', ['7', '4', '5'], [0]),
      Q('¿En qué capa trabaja un router?', ['Red', 'Enlace de datos', 'Transporte'], [0]),
      Q('¿Cuáles protocolos son de la capa de transporte?', ['TCP', 'UDP', 'IP'], [0, 1]),
      Q('HTTP pertenece a la capa…', ['Aplicación', 'Sesión', 'Física'], [0]),
      Q('Un switch tradicional opera en la capa…', ['Enlace de datos', 'Red', 'Aplicación'], [0]),
      Q('¿Qué capa se encarga del cifrado y la compresión?', ['Presentación', 'Sesión', 'Transporte'], [0]),
    ],
    git: [
      Q('¿Qué comando crea un repositorio nuevo?', ['`git init`', '`git start`', '`git new`'], [0]),
      Q('¿Qué hace `git add`?', ['Prepara cambios para el commit', 'Sube cambios al remoto', 'Crea una rama'], [0]),
      Q('¿Qué comando muestra el historial?', ['`git log`', '`git history`', '`git show-all`'], [0]),
      Q('Para crear una rama y cambiarte a ella usas…', ['`git switch -c rama`', '`git branch -m rama`', '`git merge rama`'], [0]),
      Q('¿Qué hace `git pull`?', ['Trae y fusiona cambios del remoto', 'Solo descarga sin fusionar', 'Envía tus commits'], [0]),
      Q('Para descartar cambios no preparados de un archivo…', ['`git restore archivo`', '`git rm archivo`', '`git commit --amend`'], [0]),
    ],
    gcp: [
      Q('En GCP, ¿qué agrupa recursos, facturación y permisos?', ['Proyecto', 'Zona', 'Bucket'], [0]),
      Q('IAM asigna permisos mediante…', ['Roles', 'Etiquetas', 'Regiones'], [0]),
      Q('¿Cuáles son tipos de roles en IAM?', ['Básicos', 'Predefinidos', 'Personalizados', 'Temporales'], [0, 1, 2]),
      Q('El principio de mínimo privilegio significa…', ['Dar solo los permisos necesarios', 'Dar permisos de administrador', 'Quitar todos los permisos'], [0]),
    ],
    gcpV2: Q('¿Qué identidad usa una aplicación para acceder a recursos?', ['Cuenta de servicio', 'Cuenta de Gmail', 'Grupo de Google'], [0]),
    fisica: [
      Q('En el MRU la velocidad es…', ['Constante', 'Creciente', 'Cero'], [0]),
      Q('Unidad de aceleración en el SI', ['m/s²', 'm/s', 'km/h'], [0]),
      Q('Un auto pasa de 0 a 20 m/s en 4 s. Su aceleración es…', ['5 m/s²', '80 m/s²', '4 m/s²'], [0]),
      Q('La pendiente de una gráfica posición-tiempo representa…', ['La velocidad', 'La aceleración', 'La distancia'], [0]),
    ],
    fisicaV2: Q('En caída libre sin aire, la aceleración es aproximadamente…', ['9.8 m/s²', '0 m/s²', '98 m/s²'], [0]),
  };
  const ALG_Q1_V1 = Q('¿Qué matrices son **invertibles**?', ['det(A) = 2', 'det(A) = 0'], [0], 'Una matriz es invertible si y solo si su determinante es distinto de 0.');
  const ALG_Q1_V2 = Q('¿Qué matrices son **invertibles**?', ['det(A) = 2', 'det(A) = 0', 'det(A) = −5'], [0, 2], 'Una matriz es invertible si y solo si su determinante es distinto de 0.');
  const ALG_Q1_V3 = Q('¿Cuáles de estas matrices son **invertibles**?', ['det(A) = 2', 'det(A) = 0', 'det(A) = −5'], [0, 2], 'Una matriz es invertible si y solo si su determinante es distinto de 0.');
  const ALG_Q10 = Q('¿Qué método usa operaciones por renglón para encontrar la inversa?', ['Gauss-Jordan', 'Regla de Cramer', 'Método de Newton'], [0]);
  // En la v2 también se corrigió la explicación de la pregunta 3
  const algebraV2Base = BANK.algebraBase.map((q, i) => (i === 1 ? { ...q, explanation: 'Intercambiar dos renglones multiplica el determinante por −1.' } : q));

  // Quizzes: [clave, dueño, categoría, etiquetas, título, descripción, versiones[], likes, intentos, creado]
  const QUIZZES = [
    ['aws', 'ricardo', 'Certificaciones', ['aws'], 'AWS Cloud Practitioner: servicios básicos',
      'Preguntas tipo examen **CLF-C02**: almacenamiento, cómputo, responsabilidad compartida y beneficios de la nube.\n\n> Algunas preguntas tienen varias respuestas correctas.',
      [{ at: '2026-09-22T09:30:00Z', timeLimit: 5, questions: BANK.aws }], 31, 88],
    ['python', 'gael', 'Programación', ['python'], 'Python: listas y diccionarios', 'Comprensiones, métodos de listas y recorrido de diccionarios.',
      [{ at: '2026-09-24T11:20:00Z', timeLimit: 15, questions: BANK.python }], 22, 61],
    ['algebra', 'luis', 'Matemáticas', ['algebra'], 'Álgebra lineal: matrices',
      'Repaso de **determinantes**, matrices inversas y operaciones elementales por renglón.\n\n- Propiedades del determinante\n- Cuándo una matriz es invertible\n- Método de Gauss-Jordan\n\nIdeal antes del primer parcial de Álgebra Lineal.',
      [
        { at: '2026-09-20T15:04:00Z', timeLimit: 20, questions: [ALG_Q1_V1, ...BANK.algebraBase], attempts: 9 },
        { at: '2026-09-22T12:30:00Z', timeLimit: 20, questions: [ALG_Q1_V2, ...algebraV2Base], attempts: 15 },
        { at: '2026-09-25T18:00:00Z', timeLimit: 30, questions: [ALG_Q1_V3, ...algebraV2Base, ALG_Q10], attempts: 18 },
      ], 17, 42],
    ['derivadas', 'luis', 'Matemáticas', ['calculo'], 'Derivadas: reglas básicas', 'Regla de la cadena, del producto y del cociente.',
      [{ at: '2026-09-25T08:10:00Z', timeLimit: 20, questions: BANK.derivadas }], 14, 37],
    ['osi', 'ricardo', 'Certificaciones', ['redes'], 'Redes: modelo OSI', 'Las 7 capas, sus protocolos y dispositivos.',
      [{ at: '2026-09-26T16:45:00Z', timeLimit: 10, questions: BANK.osi }], 11, 29],
    ['git', 'ana', 'Programación', ['git'], 'Git desde cero', 'Commits, ramas, `merge` contra `rebase` y cómo deshacer cambios.',
      [{ at: '2026-09-23T18:00:00Z', timeLimit: null, questions: BANK.git }], 9, 23],
    ['gcp', 'ana', 'Certificaciones', ['gcp'], 'GCP: IAM y proyectos', 'Proyectos, roles y cuentas de servicio en Google Cloud.',
      [
        { at: '2026-09-29T10:00:00Z', timeLimit: null, questions: BANK.gcp, attempts: 6 },
        { at: '2026-10-02T17:30:00Z', timeLimit: null, questions: [...BANK.gcp, BANK.gcpV2], attempts: 9 },
      ], 7, 15],
    ['fisica', 'gael', 'Física', ['fisica-1'], 'Física 1: cinemática', 'MRU y MRUA.',
      [
        { at: '2026-09-15T10:00:00Z', timeLimit: null, questions: BANK.fisica, attempts: 5 },
        { at: '2026-09-20T10:00:00Z', timeLimit: null, questions: [...BANK.fisica, BANK.fisicaV2], attempts: 7 },
      ], 4, 12],
  ];

  /**
   * Arma un intento ya respondido. picks[i] = índices de opciones marcadas en la
   * pregunta i (undefined = sin responder).
   */
  function playedAttempt({ id, user, quiz, version, startedAt, minutes, picks, status = AttemptStatus.COMPLETED, timedOut = false }) {
    const start = D(startedAt);
    const attempt = new Attempt({
      _id: id, userId: user._id, quizId: quiz._id, versionId: version._id, version: version.version,
      total: version.questionCount, startedAt: start,
      deadlineAt: version.timeLimit ? new Date(start.getTime() + version.timeLimit * 60000) : null,
    });
    version.questions.forEach((q, i) => {
      if (!picks[i]) return;
      const ids = picks[i].map((k) => q.options[k]._id);
      const answer = new Answer({ questionId: q._id, selectedOptionIds: ids, isCorrect: q.isAnswerCorrect(ids), answeredAt: new Date(start.getTime() + (i + 1) * 40000) });
      attempt.answers.push(answer);
      if (answer.isCorrect) attempt.score++;
    });
    attempt.status = status;
    attempt.timedOut = timedOut;
    attempt.finishedAt = new Date(start.getTime() + minutes * 60000);
    return attempt;
  }

  /** Carga todos los datos en la base (sin latencia). */
  async function seed(db) {
    const prevLog = QT.log.enabled;
    QT.log.enabled = false;
    try {
      const passwordHash = await User.hashPassword('quiztopia123');
      const users = {
        ana: new User({ _id: ID.ana, username: 'ana_dev', email: 'ana@correo.com', passwordHash, createdAt: D('2026-09-01T10:00:00Z') }),
        luis: new User({ _id: ID.luis, username: 'luis_m', email: 'luis@correo.com', passwordHash, createdAt: D('2026-09-02T10:00:00Z') }),
        ricardo: new User({ _id: ID.ricardo, username: 'ricardo_e', email: 'ricardo@correo.com', passwordHash, createdAt: D('2026-09-03T10:00:00Z') }),
        gael: new User({ _id: ID.gael, username: 'gael_jv', email: 'gael@correo.com', passwordHash, createdAt: D('2026-09-04T10:00:00Z') }),
      };
      Object.values(users).forEach((u) => db.users.putSync(u));

      const categories = {};
      CATEGORIES.forEach(([name, tags], i) => {
        const c = new Category({ _id: oid('b', i + 1), name, tags: tags.map((t) => new Tag({ name: t })) });
        categories[name] = db.categories.putSync(c);
      });
      const tagBySlug = (slug) => {
        for (const c of Object.values(categories)) { const t = c.tags.find((x) => x.slug === slug); if (t) return t; }
        throw new Error('Etiqueta no encontrada: ' + slug);
      };

      const quizzes = {};
      const versions = {};
      for (const [key, owner, cat, tags, title, description, vs, likes, plays] of QUIZZES) {
        const quiz = new Quiz({
          _id: ID[key], owner: users[owner].toRef(), title, description, category: categories[cat].toRef(),
          tags: tags.map((s) => tagBySlug(s).toRef()), likesCount: likes, playCount: plays, createdAt: D(vs[0].at),
        });
        versions[key] = [];
        let previous = null;
        for (const v of vs) {
          const version = QuizVersion.build({ quizId: quiz._id, previous, questions: v.questions, timeLimit: v.timeLimit, now: D(v.at) });
          version.attemptCount = v.attempts ?? plays;
          quiz.publishVersion(version, D(v.at));
          db.quizVersions.putSync(version);
          versions[key].push(version);
          previous = version;
        }
        quizzes[key] = quiz;
      }
      // Física se borró el 5 de octubre: sus datos expiran 3 meses después
      const deletedAt = D('2026-10-05T15:10:00Z');
      const fisicaExpires = quizzes.fisica.softDelete(deletedAt);
      versions.fisica.forEach((v) => { v.expiresAt = fisicaExpires; db.quizVersions.putSync(v); });
      Object.values(quizzes).forEach((q) => db.quizzes.putSync(q));

      // Intentos de @ana_dev (los de la pantalla Participados)
      const [, algV2, algV3] = versions.algebra;
      const attempts = [
        playedAttempt({ id: oid('e', 1), user: users.ana, quiz: quizzes.algebra, version: algV2, startedAt: '2026-09-28T16:05:00Z', minutes: 20, timedOut: true,
          picks: [[1, 2], [0], [1], [0], [0], [0], [0], [1]] }),          // 6/9, la P9 sin responder
        playedAttempt({ id: oid('e', 2), user: users.ana, quiz: quizzes.algebra, version: algV3, startedAt: '2026-10-06T00:20:00Z', minutes: 22,
          picks: [[0, 2], [0], [0], [0], [0], [0], [0], [1], [0], [0]] }), // 8/10
        playedAttempt({ id: oid('e', 3), user: users.ana, quiz: quizzes.aws, version: versions.aws[0], startedAt: '2026-10-09T18:00:00Z', minutes: 5, timedOut: true,
          picks: [[0], [0, 3], [0]] }),                                     // 2/4, la P4 sin responder
        playedAttempt({ id: oid('e', 4), user: users.ana, quiz: quizzes.derivadas, version: versions.derivadas[0], startedAt: '2026-10-08T15:00:00Z', minutes: 3,
          status: AttemptStatus.ABANDONED, picks: [[0], [0]] }),
        playedAttempt({ id: oid('e', 5), user: users.ana, quiz: quizzes.fisica, version: versions.fisica[1], startedAt: '2026-09-29T19:00:00Z', minutes: 12,
          picks: [[0], [0], [1], [0], [0]] }),                              // 4/5
        // Intentos de otros usuarios (habilitan sus comentarios en el foro)
        playedAttempt({ id: oid('e', 6), user: users.gael, quiz: quizzes.algebra, version: algV3, startedAt: '2026-09-30T20:00:00Z', minutes: 25, picks: Array(10).fill([0]) }),
        playedAttempt({ id: oid('e', 7), user: users.ricardo, quiz: quizzes.algebra, version: algV3, startedAt: '2026-09-30T21:00:00Z', minutes: 18, picks: Array(10).fill([0]) }),
      ];
      attempts[4].expiresAt = fisicaExpires;
      attempts.forEach((a) => db.attempts.putSync(a));

      db.likes.putSync(new Like({ _id: oid('f', 1), userId: users.ana._id, quizId: quizzes.algebra._id, createdAt: D('2026-10-06T00:45:00Z') }));

      // Foro de Álgebra lineal
      const c = (n, author, body, at, parent = null, extra = {}) =>
        new Comment({ _id: oid('1', n), quizId: quizzes.algebra._id, parentId: parent, author: users[author].toRef(), body, createdAt: D(at), ...extra });
      [
        c(1, 'gael', 'No entiendo la pregunta 4, ¿por qué una matriz con determinante 0 no tiene inversa?', '2026-10-01T16:30:00Z', null, { replyCount: 2 }),
        c(2, 'ricardo', 'Porque `A⁻¹ = adj(A) / det(A)` y no se puede dividir entre 0.', '2026-10-01T17:02:00Z', oid('1', 1)),
        c(3, 'luis', 'Exacto. Agregué esa explicación en la versión 3 👍', '2026-10-01T18:15:00Z', oid('1', 1)),
        c(4, 'ana', 'Muy buen repaso. Me faltaría una pregunta sobre **matrices ortogonales**.', '2026-10-06T01:00:00Z'),
        c(5, 'gael', '', '2026-10-03T20:00:00Z', null, { deleted: true, replyCount: 1 }),
        c(6, 'luis', 'Creo que se refería a la pregunta 2.', '2026-10-03T21:00:00Z', oid('1', 5)),
        c(7, 'ricardo', 'Recuerden que en la pregunta 1 hay que marcar **todas** las correctas.', '2026-10-07T15:00:00Z'),
        c(8, 'luis', 'Ya está la versión 3 con 30 minutos de límite.', '2026-09-25T18:05:00Z'),
      ].forEach((x) => db.comments.putSync(x));

      QT.log.info('Base sembrada con los datos de ejemplo. Usuario: ana@correo.com · contraseña: quiztopia123');
    } finally {
      QT.log.enabled = prevLog;
    }
  }

  seed.ids = ID;
  seed.aliases = aliases;
  QT.seed = seed;
})(typeof window !== 'undefined' ? window : globalThis);
