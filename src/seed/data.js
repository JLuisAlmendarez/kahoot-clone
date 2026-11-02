/* ============================================================================
   seed/data.js — Contenido de los datos de ejemplo (usuarios, categorías,
   quizzes con varias versiones, intentos y foro). Lo usa seed/seed.js.
   Contraseña de todos los usuarios de ejemplo: quiztopia123
   ========================================================================== */

/** Pregunta compacta: Q(texto, [opciones], [índices correctos], explicación) */
const Q = (text, options, correct, explanation = null) => ({
  text, explanation, options: options.map((t, i) => ({ text: t, isCorrect: correct.includes(i) })),
});

export const USERS = {
  ana: { username: 'ana_dev', email: 'ana@correo.com', createdAt: '2026-09-01T10:00:00Z' },
  luis: { username: 'luis_m', email: 'luis@correo.com', createdAt: '2026-09-02T10:00:00Z' },
  ricardo: { username: 'ricardo_e', email: 'ricardo@correo.com', createdAt: '2026-09-03T10:00:00Z' },
  gael: { username: 'gael_jv', email: 'gael@correo.com', createdAt: '2026-09-04T10:00:00Z' },
  // Administrador inicial: gestiona usuarios, roles, categorías y etiquetas (panel /admin)
  admin: { username: 'admin_qt', email: 'admin@correo.com', role: 'admin', createdAt: '2026-09-01T09:00:00Z' },
};
export const PASSWORD = 'quiztopia123';

export const CATEGORIES = [
  ['Certificaciones', ['aws', 'azure', 'gcp', 'linux', 'redes', 'ciberseguridad']],
  ['Programación', ['sql', 'python', 'javascript', 'git']],
  ['Matemáticas', ['algebra', 'calculo', 'estadistica']],
  ['Química', ['estequiometria', 'quimica organica']],
  ['Física', ['fisica 1', 'fisica 2']],
  ['Biología', ['biologia molecular', 'biologia evolutiva']],
];

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
};
const ALG_Q1_V1 = Q('¿Qué matrices son **invertibles**?', ['det(A) = 2', 'det(A) = 0'], [0], 'Una matriz es invertible si y solo si su determinante es distinto de 0.');
const ALG_Q1_V2 = Q('¿Qué matrices son **invertibles**?', ['det(A) = 2', 'det(A) = 0', 'det(A) = −5'], [0, 2], 'Una matriz es invertible si y solo si su determinante es distinto de 0.');
const ALG_Q1_V3 = Q('¿Cuáles de estas matrices son **invertibles**?', ['det(A) = 2', 'det(A) = 0', 'det(A) = −5'], [0, 2], 'Una matriz es invertible si y solo si su determinante es distinto de 0.');
const ALG_Q10 = Q('¿Qué método usa operaciones por renglón para encontrar la inversa?', ['Gauss-Jordan', 'Regla de Cramer', 'Método de Newton'], [0]);
// En la v2 también se corrigió la explicación de la pregunta 3
export const algebraV2Base = BANK.algebraBase.map((q, i) => (i === 1 ? { ...q, explanation: 'Intercambiar dos renglones multiplica el determinante por −1.' } : q));

/** [clave, dueño, categoría, etiquetas, título, descripción, versiones[], likes, intentos] */
export const QUIZZES = [
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
];
