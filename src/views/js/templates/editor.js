/* Vistas del editor (rutas /editor y /editor/:id). */
import { html, cls } from '../core/generate-html.js';
import { LIMITS } from '/shared/rules.js';

const letter = (j) => String.fromCharCode(65 + j);

export const errorSummary = (errors) => (errors.length === 0 ? '' : html`
  <p class="fw-semibold mb-1"><i class="bi bi-exclamation-triangle me-1" aria-hidden="true"></i>Revisa ${errors.length === 1 ? '1 detalle' : `${errors.length} detalles`} antes de guardar:</p>
  <ul class="mb-0 small">${errors.map((e) => html`<li><a class="link-danger" href="#${e.fieldId}" data-field="${e.fieldId}">${e.message}</a></li>`)}</ul>`);

export const tagGroups = (categories, selectedCategoryId, tagIds) => {
  const full = tagIds.length >= LIMITS.tags;
  const ordered = [...categories].sort((a, b) => (a.categoryId === selectedCategoryId ? -1 : b.categoryId === selectedCategoryId ? 1 : 0));
  return ordered.map((c) => html`
    <p class="tag-group-title">${c.name}</p>
    <div class="d-flex flex-wrap gap-2">
      ${c.tags.map((t) => {
        const checked = tagIds.includes(t.tagId);
        return html`<input type="checkbox" class="btn-check" name="tags" value="${t.tagId}" id="tag-${t.tagId}" ${checked && 'checked'} ${full && !checked && 'disabled'}><label class="btn btn-tag" for="tag-${t.tagId}">#${t.name}</label>`;
      })}
    </div>`);
};

const optionRow = (q, o, j) => html`
  <div class="input-group mb-2 option-row" data-option="${j}">
    <div class="input-group-text"><input class="form-check-input mt-0" type="checkbox" data-field="isCorrect" id="q${q.uid}-o${o.uid}-ok" ${o.isCorrect && 'checked'} aria-label="Opción ${letter(j)} es correcta"></div>
    <input class="form-control" maxlength="${LIMITS.optionText}" placeholder="Opción ${letter(j)}" data-field="text" id="q${q.uid}-o${o.uid}" value="${o.text}" aria-label="Texto de la opción ${letter(j)}">
    <button type="button" class="btn btn-outline-secondary" data-action="remove-option" aria-label="Quitar opción ${letter(j)}" ${q.options.length <= LIMITS.options[0] && 'disabled'}><i class="bi bi-x-lg" aria-hidden="true"></i></button>
  </div>`;

export const questionCard = (q, i, total, errors = []) => {
  const n = i + 1;
  const correct = q.options.filter((o) => o.isCorrect).length;
  return html`
    <section class="${cls('card question-card mb-3', errors.length && 'is-invalid')}" id="qcard-${q.uid}" data-index="${i}" aria-label="Pregunta ${n}" tabindex="-1">
      <div class="card-header d-flex align-items-center gap-2 flex-wrap">
        <h3 class="h6 mb-0">Pregunta ${n}</h3>
        ${correct === 1 && html`<span class="badge text-bg-light border">Una respuesta</span>`}
        ${correct > 1 && html`<span class="badge text-bg-warning">Varias respuestas</span>`}
        ${correct === 0 && html`<span class="badge text-bg-light border">Sin respuesta correcta</span>`}
        <div class="btn-group btn-group-sm ms-auto" role="group" aria-label="Acciones de la pregunta ${n}">
          <button type="button" class="btn btn-outline-secondary" data-action="move-up" aria-label="Subir pregunta ${n}" ${i === 0 && 'disabled'}><i class="bi bi-arrow-up" aria-hidden="true"></i></button>
          <button type="button" class="btn btn-outline-secondary" data-action="move-down" aria-label="Bajar pregunta ${n}" ${i === total - 1 && 'disabled'}><i class="bi bi-arrow-down" aria-hidden="true"></i></button>
          <button type="button" class="btn btn-outline-secondary" data-action="duplicate" aria-label="Duplicar pregunta ${n}" ${total >= LIMITS.questions[1] && 'disabled'}><i class="bi bi-copy" aria-hidden="true"></i></button>
          <button type="button" class="btn btn-outline-danger" data-action="remove-question" aria-label="Eliminar pregunta ${n}" ${total === 1 && 'disabled'}><i class="bi bi-trash3" aria-hidden="true"></i></button>
        </div>
      </div>
      <div class="card-body">
        <label class="form-label" for="q${q.uid}-text">Enunciado <small class="text-muted-qt">(Markdown)</small></label>
        <textarea class="${cls('form-control', errors.some((e) => e.fieldId === `q${q.uid}-text`) && 'is-invalid')}" id="q${q.uid}-text" rows="2" maxlength="${LIMITS.questionText}" placeholder="Escribe la pregunta…" data-field="text">${q.text}</textarea>
        <fieldset class="mt-3">
          <legend class="form-label fs-6 mb-2">Opciones <small class="text-muted-qt">· marca la(s) correcta(s)</small></legend>
          ${q.options.map((o, j) => optionRow(q, o, j))}
          <button type="button" class="btn btn-sm btn-link px-0" data-action="add-option" ${q.options.length >= LIMITS.options[1] && 'disabled'}><i class="bi bi-plus-lg me-1" aria-hidden="true"></i>Agregar opción <span class="text-muted-qt">(${q.options.length}/${LIMITS.options[1]})</span></button>
        </fieldset>
        ${errors.length > 0 && html`<div class="text-danger small mt-2" role="alert">${errors.map((e) => html`<div><i class="bi bi-exclamation-circle me-1" aria-hidden="true"></i>${e.short}</div>`)}</div>`}
        <label class="form-label mt-3" for="q${q.uid}-exp">Explicación <small class="text-muted-qt">(opcional, se muestra al responder)</small></label>
        <textarea class="form-control" id="q${q.uid}-exp" rows="2" maxlength="${LIMITS.explanation}" placeholder="¿Por qué es la respuesta correcta?" data-field="explanation">${q.explanation}</textarea>
      </div>
    </section>`;
};

export const editorView = ({ editMode, S, categories }) => html`
  <div class="row justify-content-center">
    <div class="col-xl-9">
      <h1 class="h3 fw-bold mb-1">${editMode ? 'Editar quiz' : 'Crear quiz'}</h1>
      <p class="text-muted-qt">Define el contenido y las condiciones de los intentos.</p>
      <form novalidate data-form="quiz">
        ${editMode && html`
          <div class="alert alert-info small" role="note">
            <i class="bi bi-layers me-1" aria-hidden="true"></i>
            Estás editando la <strong>versión ${S.version}</strong>.
            Cambiar título, descripción, categoría o etiquetas <strong>no</strong> crea versión.
            Cambiar preguntas, opciones o el límite de tiempo crea la <strong>versión ${S.version + 1}</strong>; los intentos anteriores conservan la suya.
          </div>`}
        <div class="alert alert-danger" role="alert" tabindex="-1" data-slot="errors" hidden></div>

        <section class="card mb-4" aria-labelledby="general-title">
          <div class="card-header bg-white"><h2 id="general-title" class="h6 mb-0"><i class="bi bi-info-circle me-2" aria-hidden="true"></i>Datos generales</h2></div>
          <div class="card-body">
            <div class="mb-3">
              <label for="f-title" class="form-label">Título <span class="text-danger" aria-hidden="true">*</span></label>
              <input id="f-title" name="title" class="form-control" maxlength="${LIMITS.title[1]}" placeholder="Ej. Química: estequiometría básica" value="${S.title}" aria-describedby="f-title-help">
              <div class="d-flex justify-content-between">
                <div id="f-title-help" class="form-text">De ${LIMITS.title[0]} a ${LIMITS.title[1]} caracteres.</div>
                <small class="form-text"><span data-count="title">${S.title.length}</span>/${LIMITS.title[1]}</small>
              </div>
            </div>
            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <label for="f-category" class="form-label">Categoría <span class="text-danger" aria-hidden="true">*</span></label>
                <select id="f-category" name="categoryId" class="form-select">
                  <option value="">Elige una categoría…</option>
                  ${categories.map((c) => html`<option value="${c.categoryId}" ${c.categoryId === S.categoryId && 'selected'}>${c.name}</option>`)}
                </select>
              </div>
              <div class="col-md-6">
                <span class="form-label d-block">Límite de tiempo</span>
                <div class="d-flex align-items-center gap-3 flex-wrap">
                  <div class="form-check form-switch mb-0">
                    <input class="form-check-input" type="checkbox" role="switch" id="f-has-limit" ${S.hasLimit && 'checked'} aria-controls="f-limit">
                    <label class="form-check-label" for="f-has-limit">Limitar tiempo</label>
                  </div>
                  <div class="input-group input-group-sm w-auto">
                    <label class="visually-hidden" for="f-limit">Minutos</label>
                    <input id="f-limit" name="timeLimit" type="number" class="form-control" min="${LIMITS.timeLimit[0]}" max="${LIMITS.timeLimit[1]}" step="1" value="${S.timeLimit}" ${!S.hasLimit && 'disabled'} aria-describedby="f-limit-help">
                    <span class="input-group-text">min</span>
                  </div>
                </div>
                <div class="form-text" id="f-limit-help">Entero de ${LIMITS.timeLimit[0]} a ${LIMITS.timeLimit[1]} minutos. Apágalo para un quiz sin límite.</div>
              </div>
            </div>
            <div class="mb-3">
              <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                <label for="f-description" class="form-label mb-0">Descripción <small class="text-muted-qt">(Markdown, opcional)</small></label>
                <ul class="nav nav-pills small" role="tablist" aria-label="Modo de la descripción">
                  <li class="nav-item" role="presentation"><button class="nav-link active py-1 px-2" type="button" data-bs-toggle="pill" data-bs-target="#desc-write" role="tab" aria-controls="desc-write" aria-selected="true">Escribir</button></li>
                  <li class="nav-item" role="presentation"><button class="nav-link py-1 px-2" type="button" data-bs-toggle="pill" data-bs-target="#desc-preview" role="tab" aria-controls="desc-preview" aria-selected="false" data-action="preview-description">Vista previa</button></li>
                </ul>
              </div>
              <div class="tab-content mt-2">
                <div class="tab-pane fade show active" id="desc-write" role="tabpanel">
                  <textarea id="f-description" name="description" class="form-control" rows="4" maxlength="${LIMITS.description}" placeholder="¿Qué temas cubre? ¿Para qué examen sirve?">${S.description}</textarea>
                </div>
                <div class="tab-pane fade" id="desc-preview" role="tabpanel"><div class="md-preview markdown-body" data-slot="preview"></div></div>
              </div>
              <small class="text-muted-qt"><span data-count="description">${S.description.length}</span>/${LIMITS.description}</small>
            </div>
            <fieldset id="tag-groups" tabindex="-1">
              <legend class="form-label fs-6 mb-0">Etiquetas <small class="text-muted-qt">(máximo ${LIMITS.tags}) · <span data-count="tags">${S.tagIds.length}</span>/${LIMITS.tags}</small></legend>
              <div data-slot="tags"></div>
            </fieldset>
          </div>
        </section>

        <section aria-labelledby="questions-title">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <h2 id="questions-title" class="h5 mb-0">Preguntas <span class="badge rounded-pill text-bg-light border" data-count="questions">${S.questions.length}</span></h2>
            <small class="text-muted-qt">${LIMITS.questions[0]} a ${LIMITS.questions[1]} preguntas · ${LIMITS.options[0]} a ${LIMITS.options[1]} opciones</small>
          </div>
          <div data-slot="questions"></div>
          <button type="button" class="btn btn-outline-primary w-100 mb-4" data-action="add-question"><i class="bi bi-plus-lg me-1" aria-hidden="true"></i>Agregar pregunta</button>
        </section>

        <div class="editor-bar d-flex flex-column flex-sm-row justify-content-end gap-2">
          <a class="btn btn-light" href="${editMode ? `/quiz/${S.quizId}` : '/'}">Cancelar</a>
          <button type="submit" class="btn btn-primary px-4"><i class="bi bi-${editMode ? 'check-lg' : 'send'} me-1" aria-hidden="true"></i>${editMode ? 'Guardar cambios' : 'Publicar quiz'}</button>
        </div>
      </form>
    </div>
  </div>

  <div class="modal fade" id="modal-version" tabindex="-1" aria-labelledby="modal-version-title" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header border-0 pb-0">
          <h2 class="modal-title h5" id="modal-version-title"><i class="bi bi-layers me-2" aria-hidden="true"></i>Se creará la versión ${S.version + 1}</h2>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body">
          <p>Cambiaste preguntas, opciones o el límite de tiempo. La versión ${S.version} se conserva tal cual para revisar los intentos que ya se hicieron con ella.</p>
          <p class="small text-muted-qt mb-0">Los nuevos intentos usarán la versión ${S.version + 1}.</p>
        </div>
        <div class="modal-footer border-0 pt-0">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Seguir editando</button>
          <button type="button" class="btn btn-primary" data-action="confirm-save">Guardar versión ${S.version + 1}</button>
        </div>
      </div>
    </div>
  </div>`;
