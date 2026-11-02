# Quiztopia

Plataforma de quizzes con versiones, intentos cronometrados, likes y foro.

- **Backend:** Node.js + Express 5 + MongoDB (Mongoose) + express-validator.
- **Frontend:** una sola página (SPA) en JavaScript puro. Cada vista es una función que genera su HTML.
- **Arquitectura:** Modelo-Vista-Controlador dentro de `src/`.

---

## Requisitos

- **Node.js 22** o más reciente.
- **MongoDB 6 o más reciente**. Sirve cualquiera de estas tres opciones:
  - **Local:** instala MongoDB Community Server. Corre en `mongodb://127.0.0.1:27017`.
  - **Docker:** `docker run -d --name mongo -p 27017:27017 mongo:7`
  - **Atlas (nube, gratis):** crea un cluster y copia su cadena `mongodb+srv://…`.

La app **no necesita replica set**: funciona con un Mongo standalone, porque no usa transacciones. Ver [Concurrencia](#concurrencia-sin-transacciones).

## Cómo correrlo

```bash
npm install
cp .env.example .env      # en Windows: copy .env.example .env
#   → edita MONGODB_URI si no usas Mongo local
npm run seed              # borra la base y carga los datos de ejemplo
npm run dev               # http://localhost:3000 (se reinicia al guardar)
```

`npm start` arranca el servidor sin recargar al guardar, para producción.

**Usuarios de ejemplo** (contraseña `quiztopia123` para todos):

- `ana@correo.com`
- `luis@correo.com`
- `ricardo@correo.com`
- `gael@correo.com`
- `admin@correo.com` → **administrador** (ve el panel `/admin`)

## Pruebas

```bash
npm test
```

Son 50 pruebas de API (`node:test` + `supertest`) que corren contra **MongoDB real**:

- Usan la base `MONGODB_URI_TEST`. Si no está definida, usan la de `MONGODB_URI` con `_test` al final (`quiztopia` → `quiztopia_test`).
- Antes de cada prueba se vuelve a sembrar esa base, así que **nunca tocan tus datos de desarrollo**.
- Incluyen pruebas de concurrencia para los dos bugs que tenía la versión anterior.

### Colección de Postman

`docs/postman/Quiztopia.postman_collection.json` recorre la API completa: 62 peticiones en 6 carpetas (catálogo público, errores esperados, sesión y editor, intento cronometrado, likes y foro, administración) con 98 verificaciones.

- **En Postman o Thunder Client:** importa el archivo y córrelo en orden con el Collection Runner. La cookie de sesión se guarda sola al hacer login.
- **En la terminal:** con el servidor corriendo (`npm run seed` y `npm run dev`), ejecuta `npm run postman`.
- La variable `baseUrl` apunta a `http://localhost:3000`; cámbiala si la API corre en otro lado.

---

## Estructura (MVC)

```
src/
├── models/            M · Esquemas de Mongoose y reglas de negocio de cada colección
│   ├── User.js  Category.js  Quiz.js  QuizVersion.js  Attempt.js  Like.js  Comment.js
│   └── index.js
├── controllers/       C · Un archivo por recurso; cada función es un endpoint
│   ├── auth.controller.js        registro, login, logout, sesión
│   ├── categories.controller.js
│   ├── quizzes.controller.js     catálogo, detalle, versiones, editor, likes
│   ├── attempts.controller.js    jugar, responder, terminar, revisar, historial
│   ├── comments.controller.js    foro
│   └── admin.controller.js       CRUD de usuarios, listado de quizzes, categorías y etiquetas (solo admin)
├── views/             V · La SPA completa: lo que ve el usuario
│   ├── index.html                única página HTML
│   ├── css/styles.css
│   └── js/
│       ├── main.js               registra las rutas y arranca
│       ├── core/                 generate-html, router, cliente de la API, sesión, utilidades
│       ├── templates/            VISTAS: funciones puras  datos → HTML
│       └── pages/                controladores de vista: piden datos, pintan y enlazan eventos
├── routes/            Un express.Router() por recurso: método + URL → validadores → controlador
│   ├── index.js                  junta todos los routers bajo /api
│   ├── auth.routes.js            /api/auth
│   ├── categories.routes.js      /api/categories
│   ├── quizzes.routes.js         /api/quizzes  (CRUD principal y likes)
│   ├── versions.routes.js        /api/versions
│   ├── users.routes.js           /api/users
│   ├── attempts.routes.js        /api/attempts  y  /api/quizzes/:id/attempts
│   ├── comments.routes.js        /api/comments  y  /api/quizzes/:id/comments
│   └── admin.routes.js           /api/admin  (todo el router exige rol admin)
├── validators/                   reglas de express-validator por recurso (auth, quiz, attempt, comment)
├── middleware/                   sesión (JWT en cookie httpOnly), CORS restringido y manejo de errores
├── shared/rules.js               reglas de validación que usan el servidor y el navegador
├── seed/                         datos de ejemplo (npm run seed)
├── config/                       variables de entorno y conexión a Mongo
├── utils/                        ApiError, búsqueda, fechas, paginación
├── app.js                        arma la app de Express (helmet, morgan, CORS, rutas, estáticos)
└── server.js                     conecta a Mongo y escucha en el puerto
tests/                            pruebas de la API
docs/postman/                     colección de Postman (npm run postman)
```

Así viaja una petición:

1. El navegador pide `GET /api/quizzes/:id`.
2. `app.js` la pasa por CORS y la sesión; `routes/index.js` la manda a `quizzes.routes.js`, que la pasa por `validateQuizId` (express-validator) y luego a `quizzes.controller.detail`.
3. El controlador consulta los modelos `Quiz`, `Attempt` y `Like` y responde JSON.
4. En el navegador, `pages/quiz.js` recibe ese JSON.
5. `templates/quiz.js` genera el HTML y la página lo pinta.

## La SPA y `generate_html`

Hay **una sola página**, `src/views/index.html`. Las URLs siguen siendo normales y se pueden compartir: `/quiz/123`, `/perfil/participados`, `/jugar/abc`.

Así funciona la navegación:

- Express responde `index.html` para cualquier ruta que no sea `/api` ni un archivo.
- `core/router.js` lee la URL, busca la página que le corresponde y la monta dentro de `#app`.
- Los enlaces internos no recargan el navegador: el router intercepta el clic y usa la History API, así que los botones Atrás y Adelante funcionan.

Las vistas se generan con la plantilla etiquetada `html` de `core/generate-html.js`:

```js
import { html, render } from '../core/generate-html.js';

const quizCard = (q) => html`
  <article class="card">
    <h3><a href="/quiz/${q.quizId}">${q.title}</a></h3>
    <p>${q.tags.map((t) => html`<span class="tag">#${t.name}</span>`)}</p>
    ${q.hasMultiple && html`<span class="badge">Varias respuestas</span>`}
  </article>`;

render(document.querySelector('#app'), quizCard(quiz));
```

- **Todo lo que se interpola con `${…}` se escapa.** Un título como `<script>…</script>` se muestra como texto y no se ejecuta.
- **Los arreglos** se pintan elemento por elemento, que es lo que se usa para las listas.
- **`false`, `null` y `undefined`** no pintan nada, que es lo que se usa para las condiciones.
- **El Markdown** (descripciones, preguntas, comentarios) pasa por `marked` y luego por `DOMPurify` antes de insertarse.

Cada página de `pages/` es un objeto con esta forma:

```js
export default {
  title: 'Explorar quizzes',
  auth: true,                  // opcional: sin sesión redirige a /acceso
  async mount({ outlet, params, query, me, navigate, setLeaveGuard }) {
    // pide datos a la API, pinta con templates/ y enlaza eventos
    return () => { /* limpieza al salir: timers, listeners de window */ };
  },
};
```

## API REST

Todas las respuestas son JSON. Los errores siempre tienen la misma forma:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "fields": [{ "path": "questions.0.options", "message": "…" }] } }
```

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` · `/login` · `/logout` | Sesión con cookie httpOnly (JWT) |
| GET | `/api/auth/me` | Usuario actual o `null` |
| GET | `/api/categories` | Categorías con sus etiquetas |
| GET | `/api/quizzes?q=&page=&limit=` | Catálogo con filtros (ver abajo) |
| GET | `/api/quizzes/:id` | Detalle y permisos de quien pregunta |
| GET | `/api/quizzes/:id/versions` · `/api/versions/:versionId` | Historial y snapshot de una versión |
| POST · PUT · DELETE | `/api/quizzes` · `/api/quizzes/:id` | Crear, editar y borrar (borrado definitivo) |
| GET | `/api/quizzes/:id/edit` · `/api/users/me/quizzes` | Datos para el editor · mis quizzes |
| POST · DELETE | `/api/quizzes/:id/likes` | Dar o quitar like |
| POST | `/api/quizzes/:id/attempts` | Iniciar un intento |
| GET | `/api/attempts/:id/play` · `/api/attempts/:id` | Retomar un intento · revisión |
| POST | `/api/attempts/:id/answers` · `/finish` · `/abandon` | Responder, terminar, abandonar |
| GET | `/api/attempts?quizId=` | Historial agrupado por quiz |
| GET · POST | `/api/quizzes/:id/comments` | Foro (primer nivel) |
| GET · DELETE | `/api/comments/:id/replies` · `/api/comments/:id` | Respuestas · borrar |
| GET | `/api/admin/users?q=&role=&sort=&order=&page=&limit=` | **Admin.** Usuarios con búsqueda, filtro por rol, orden por columna y paginado |
| POST · PUT · DELETE | `/api/admin/users[/:id]` | **Admin.** Crear, editar y borrar cuentas (el rol no se cambia) |
| GET | `/api/admin/quizzes?q=&categoria=&sort=&order=&page=&limit=` | **Admin.** Todos los quizzes; editar y borrar usan `PUT`/`DELETE /api/quizzes/:id` |
| GET · POST | `/api/admin/categories` | **Admin.** Categorías con uso · crear |
| PUT · DELETE | `/api/admin/categories/:id` | **Admin.** Renombrar · borrar (solo si ningún quiz la usa) |
| POST · PUT · DELETE | `/api/admin/categories/:id/tags[/:tagId]` | **Admin.** Crear, renombrar y borrar etiquetas |

**Filtros de búsqueda** (se escriben dentro de `q`):

- `categoria:quimica`
- `autor:luis_m`
- `etiqueta:aws`
- `preguntas:>5`
- `sort:populares`

La búsqueda ignora mayúsculas y acentos.

## Validación con express-validator

Cada archivo de `src/validators/` exporta arreglos listos para la ruta: reglas + el middleware `validate`.

```js
// routes/quizzes.routes.js  (montado en /api/quizzes)
router.post('/', requireAuth, validateQuiz, quizzes.create);

// validators/quiz.validator.js
body('title').custom(notBlank).withMessage('El título es obligatorio').bail()
  .isString().custom((v) => v.trim().length >= 3).isLength({ max: 100 })
```

- `requireAuth` va primero: sin sesión es 401 antes de revisar datos.
- Un `:id` mal formado en la URL responde **404** (ese recurso no puede existir).
- Cualquier otro error responde **400** con la ruta del campo en notación de punto (`questions.0.options`), igual que Mongoose, para que el editor lleve al usuario al campo.
- `page` y `limit` deben ser enteros; el controlador los acota a su rango.

## Roles

| Rol | Qué puede hacer |
|---|---|
| Visitante | Ver catálogo, detalle, versiones y foro. |
| Usuario (`user`) | Jugar, crear y editar **sus** quizzes, dar like y comentar (si completó el quiz). |
| Administrador (`admin`) | Todo lo anterior, más el panel `/admin`: CRUD de usuarios, editar y borrar cualquier quiz, y crear, renombrar o borrar categorías y etiquetas. |

- El rol se guarda en `users.role` y se lee de la base en cada petición. **Solo el seed crea administradores: ninguna ruta asigna ni cambia el rol.** Ser «creador» no es un rol global sino la relación de cada usuario con sus quizzes (`owner.userId`).
- Las rutas `/api/admin/*` usan `allowRoles('admin')`: 401 sin sesión, 403 con otro rol.
- El admin crea cuentas siempre con rol `user`; si una petición manda `role`, se rechaza con 400.
- Al borrar un usuario: no puede ser la propia cuenta (409), una cuenta admin (403) ni alguien con quizzes vivos (409 `IN_USE`). Se quitan sus likes (restando el contador), intentos y comentarios.
- Editar o borrar un quiz lo pueden hacer su creador o un admin; el autor del quiz no cambia.
- Una categoría o etiqueta solo se borra si ningún quiz vivo la usa (409 `IN_USE`). Al renombrarla se actualiza la copia guardada en cada quiz.

## Reglas importantes

- **Versiones.** Cambiar preguntas, opciones o el límite de tiempo crea una versión nueva. Cambiar título, descripción, categoría o etiquetas no la crea. Cada intento se revisa siempre con la versión que se jugó.
- **Borrado definitivo.** Al borrar un quiz (su creador o un admin) se eliminan de inmediato de la base el quiz, sus versiones, intentos, likes y comentarios. No se puede deshacer. Si la base tiene quizzes que quedaron con borrado lógico de la versión anterior (`deletedAt`), se borran definitivamente la próxima vez que arranca el servidor.
- **Calificación «todo o nada».** En preguntas de varias respuestas hay que marcar exactamente las correctas.
- **Tiempo límite.** El servidor rechaza respuestas fuera de tiempo, con 5 segundos de gracia. Un intento que se quedó abierto con el tiempo vencido se califica como «tiempo agotado» la próxima vez que se consulta.
- **Abandono.** Cerrar la pestaña manda `navigator.sendBeacon` a `/abandon` y el intento queda interrumpido.
- **Foro.** Solo comenta quien completó el quiz o su creador. Hay máximo 2 niveles de respuestas y 10 comentarios por minuto.

## Concurrencia sin transacciones

Todo contador o cambio de estado se hace con **una operación atómica de un solo documento**, con una condición:

| Operación | Cómo evita el problema |
|---|---|
| Like | Un `upsert` sobre el índice único `(userId, quizId)`. Solo la petición que crea el documento hace `$inc`. |
| Quitar like | Solo resta si `deleteOne` borró algo. |
| Editar quiz | `$set` solo de los campos del editor. Nunca sobrescribe `likesCount` ni `playCount`. |
| Responder | `$push` con la condición «sigue abierto y esa pregunta no se ha respondido». |
| Terminar | Cambia `in_progress → completed` con condición. Solo una petición incrementa `playCount`. |
| Borrar comentario | Borra con la condición `replyCount: 0`. Si llegó una respuesta, lo marca como eliminado. |

Esto corrige los dos bugs de la versión anterior, que tienen pruebas en `tests/api.test.js` → «Concurrencia»:

- Un like doble dejaba el contador desincronizado.
- Editar un quiz borraba los `playCount` que llegaban mientras se guardaba.

## Seguridad

- **Sesión:** JWT en una cookie `httpOnly` y `SameSite=Lax`. En producción además es `Secure`.
- **Contraseñas:** se cifran con `bcrypt`. El login tarda lo mismo exista o no el correo.
- **CORS restringido:** `cors` solo en `/api` (`src/middleware/cors.js`). Aceptan la propia SPA (mismo servidor) y los orígenes de `CORS_ORIGIN` en `.env`, separados por coma. Cualquier otro origen recibe **403 `CORS_NOT_ALLOWED`** antes de llegar a la ruta. Nunca se responde `*`: se refleja solo el origen aprobado, con `credentials: true` para la cookie. Postman y curl no mandan `Origin` y pasan.
- **Logger:** `morgan('dev')` registra cada petición (método, URL, status, tiempo). Se apaga en las pruebas.
- **Cabeceras:** `helmet` con una CSP estricta (`script-src 'self'`). Bootstrap, marked y DOMPurify se sirven desde `node_modules`, sin CDN.
- **HTML:** se escapa todo lo que se interpola. El Markdown se sanitiza con DOMPurify.
- **Redirecciones:** `?next=` solo acepta rutas propias.
- **Validación:** cada ruta que recibe datos pasa por reglas de **express-validator** (`src/validators/`) antes del controlador. Usan los mismos límites y mensajes de `src/shared/rules.js`, que también usa el navegador, y Mongoose valida otra vez antes de guardar.
