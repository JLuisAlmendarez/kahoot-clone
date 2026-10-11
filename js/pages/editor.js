/* editor.js — editor.html: crear (sin ?id) o editar (?id=quizId) un quiz.
   API: GET /api/categories · GET /api/quizzes/:id/edit · POST /api/quizzes · PUT /api/quizzes/:id
   Las reglas de validación son las mismas clases de models.js que usa la API:
   el usuario ve los errores antes de enviar y el servidor los vuelve a revisar. */
(async function () {
  'use strict';
  const { ui, LIMITS } = QT;
  const { Question, Validator } = { Question: QT.models.Question, Validator: QT.Validator };
  const { api, me } = await QT.ready;

  const quizId = ui.params().get('id');
  const editMode = !!quizId;
  if (!me) { location.replace(`acceso.html?modo=login&next=${encodeURIComponent(ui.here())}`); return; }

  const region = document.querySelector('[data-region="editor"]');
  const form = document.querySelector('[data-form="quiz"]');
  const $ = (id) => document.getElementById(id);
  const questionsBox = region.querySelector('[data-list="questions"]');
  const tagsBox = region.querySelector('[data-list="tagGroups"]');
  const categorySelect = $('f-category');
  const errorsAlert = region.querySelector('[data-show-if="errors.length"]');

  // --------------------------------------------------------------- estado
  let uid = 0;
  const newOption = (text = '', isCorrect = false) => ({ uid: ++uid, text, isCorrect });
  const newQuestion = () => ({ uid: ++uid, text: '', explanation: '', options: [newOption(), newOption()] });
  const S = {
    version: 0, title: '', description: '', categoryId: '', tagIds: [], hasLimit: true, timeLimit: 10,
    questions: [newQuestion()], errors: [],
  };
  let categories = [];
  let original = null;   // contenido al abrir (para saber si habrá versión nueva)
  let submitted = false; // después del primer intento de guardar, valida mientras escribes
  let dirty = false;

  const contentKey = () => JSON.stringify({
    t: S.hasLimit ? Number(S.timeLimit) : null,
    q: S.questions.map((q) => [q.text.trim(), q.explanation.trim(), q.options.map((o) => [o.text.trim(), o.isCorrect])]),
  });
  const payload = () => ({
    title: S.title, description: S.description, categoryId: S.categoryId, tagIds: S.tagIds,
    timeLimit: S.hasLimit ? Number(S.timeLimit) : null,
    questions: S.questions.map((q) => ({ text: q.text, explanation: q.explanation, options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) })),
  });

  // ---------------------------------------------------------------- carga
  const data = await ui.load(region, () => Promise.all([api.categories.list(), editMode ? api.quizzes.getForEdit(quizId) : null]), {
    onError: (err) => {
      if (err.status === 403) { ui.setState(region, 'forbidden'); return true; }
      return false;
    },
  });
  if (!data) return;
  [categories] = data;
  const existing = data[1];
  if (existing) {
    Object.assign(S, {
      version: existing.version, title: existing.title, description: existing.description, categoryId: existing.categoryId,
      tagIds: existing.tagIds, hasLimit: existing.timeLimit !== null, timeLimit: existing.timeLimit || 10,
      questions: existing.questions.map((q) => ({ uid: ++uid, text: q.text, explanation: q.explanation || '', options: q.options.map((o) => newOption(o.text, o.isCorrect)) })),
    });
    document.title = 'Editar quiz · Quiztopia';
  }
  original = contentKey();

  $('f-title').value = S.title;
  $('f-description').value = S.description;
  $('f-has-limit').checked = S.hasLimit;
  $('f-limit').value = S.timeLimit;
  $('f-limit').disabled = !S.hasLimit;
  ui.renderList(categorySelect, categories);
  categorySelect.prepend(new Option('Elige una categoría…', ''));
  categorySelect.value = S.categoryId;
  render();

  // --------------------------------------------------------------- pintar
  function ctx() {
    return {
      editMode, version: S.version, nextVersion: S.version + 1, title: S.title, description: S.description,
      tags: S.tagIds, questions: S.questions, errors: S.errors,
      timeLimitLabel: S.hasLimit ? `${S.timeLimit || '?'} min` : 'sin límite',
    };
  }
  function render() {
    renderGeneral();
    renderTags();
    renderQuestions();
  }
  function renderGeneral() {
    ui.fill(region, ctx());
    ui.fill(document.getElementById('modal-version'), ctx());
    $('f-title').classList.toggle('is-invalid', S.errors.some((e) => e.path === 'title'));
    categorySelect.classList.toggle('is-invalid', S.errors.some((e) => e.path === 'categoryId'));
    $('f-limit').classList.toggle('is-invalid', S.errors.some((e) => e.path === 'timeLimit'));
  }

  function renderTags() {
    const selected = categories.find((c) => c.categoryId === S.categoryId);
    const groups = [...categories].sort((a, b) => (a === selected ? -1 : b === selected ? 1 : 0)).map((c) => ({ category: { name: c.name }, tags: c.tags }));
    const full = S.tagIds.length >= LIMITS.tags;
    ui.renderList(tagsBox, groups, {
      onItem: (el) => {
        el.querySelectorAll?.('input.btn-check').forEach((cb) => {
          cb.checked = S.tagIds.includes(cb.value);
          cb.disabled = full && !cb.checked;
        });
      },
    });
  }

  function renderQuestions(focusId) {
    const items = S.questions.map((q) => ({ ...q, correctCount: q.options.filter((o) => o.isCorrect).length, questionErrors: [] }));
    ui.renderList(questionsBox, items, {
      onItem: (card, q, i) => {
        const n = i + 1;
        card.dataset.index = i;
        card.id = `qcard-${q.uid}`;
        const text = card.querySelector('[data-field="text"]');
        const exp = card.querySelector('[data-field="explanation"]');
        text.id = `q${q.uid}-text`; text.value = q.text;
        exp.id = `q${q.uid}-exp`; exp.value = q.explanation;
        const labels = card.querySelectorAll('.card-body > label');
        labels[0].htmlFor = text.id; labels[1].htmlFor = exp.id;
        card.setAttribute('aria-label', `Pregunta ${n}`);
        const actions = { 'move-up': i === 0, 'move-down': i === S.questions.length - 1, 'remove-question': S.questions.length === 1, duplicate: S.questions.length >= LIMITS.questions[1] };
        Object.entries(actions).forEach(([a, disabled]) => {
          const b = card.querySelector(`[data-action="${a}"]`);
          b.disabled = disabled;
          b.setAttribute('aria-label', `${b.getAttribute('aria-label')} ${n}`);
        });
        card.querySelectorAll('.option-row').forEach((row, j) => {
          const opt = q.options[j];
          row.dataset.option = j;
          const letter = String.fromCharCode(65 + j);
          const cb = row.querySelector('[data-field="isCorrect"]');
          const input = row.querySelector('[data-field="text"]');
          cb.id = `q${q.uid}-o${opt.uid}-ok`; cb.checked = opt.isCorrect; cb.setAttribute('aria-label', `Opción ${letter} es correcta`);
          input.id = `q${q.uid}-o${opt.uid}`; input.value = opt.text; input.placeholder = `Opción ${letter}`; input.setAttribute('aria-label', `Texto de la opción ${letter}`);
          const rm = row.querySelector('[data-action="remove-option"]');
          rm.disabled = q.options.length <= LIMITS.options[0];
          rm.setAttribute('aria-label', `Quitar opción ${letter}`);
        });
        card.querySelector('[data-action="add-option"]').disabled = q.options.length >= LIMITS.options[1];
      },
    });
    $('add-question-btn')?.toggleAttribute('disabled', S.questions.length >= LIMITS.questions[1]);
    renderErrors();
    if (focusId) document.getElementById(focusId)?.focus();
  }

  // ------------------------------------------------------------ validación
  /** Usa las mismas reglas que el modelo Question y que la API. */
  function validate() {
    const v = new Validator();
    v.string(S.title, 'title', { min: LIMITS.title[0], max: LIMITS.title[1], label: 'El título' });
    v.required(S.categoryId, 'categoryId', 'La categoría');
    if (S.hasLimit) v.integer(Number(S.timeLimit), 'timeLimit', { min: LIMITS.timeLimit[0], max: LIMITS.timeLimit[1], label: 'El límite de tiempo' });
    v.array(S.questions, 'questions', { min: LIMITS.questions[0], max: LIMITS.questions[1], label: 'Las preguntas' });
    S.questions.forEach((q, i) => {
      const model = new Question({ position: i + 1, text: q.text, explanation: q.explanation, options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) });
      model.collectErrors(new Validator(`questions.${i}`)).errors.forEach((e) => v.errors.push(e));
    });
    return v.errors;
  }
  /** Convierte una ruta (questions.1.options.0.text) en el id del campo y un mensaje legible. */
  function describe(err) {
    const m = err.path.match(/^questions\.(\d+)(?:\.(\w+))?(?:\.(\d+))?/);
    if (!m) {
      const ids = { title: 'f-title', categoryId: 'f-category', timeLimit: 'f-limit', tagIds: 'tag-groups', description: 'f-description' };
      return { ...err, fieldId: ids[err.path] || 'f-title' };
    }
    const q = S.questions[Number(m[1])];
    if (!q) return { ...err, fieldId: 'f-title' };
    const fieldId = m[2] === 'options' && m[3] !== undefined ? `q${q.uid}-o${q.options[Number(m[3])].uid}` : m[2] === 'options' ? `q${q.uid}-o${q.options[0].uid}-ok` : m[2] === 'explanation' ? `q${q.uid}-exp` : `q${q.uid}-text`;
    return { ...err, question: Number(m[1]), fieldId, message: `Pregunta ${Number(m[1]) + 1}: ${err.message}` };
  }
  function renderErrors() {
    const list = S.errors.map(describe);
    ui.fill(errorsAlert, { errors: list });
    ui.renderList(errorsAlert.querySelector('[data-list="errors"]'), list);
    questionsBox.querySelectorAll('.question-card').forEach((card) => {
      const i = Number(card.dataset.index);
      const mine = list.filter((e) => e.question === i);
      card.classList.toggle('is-invalid', mine.length > 0);
      const box = card.querySelector('[data-list="questionErrors"]');
      box.replaceChildren(...mine.map((e) => {
        const div = document.createElement('div');
        div.innerHTML = '<i class="bi bi-exclamation-circle me-1" aria-hidden="true"></i>';
        div.append(e.message.replace(/^Pregunta \d+: /, ''));
        return div;
      }));
      card.querySelectorAll('.form-control').forEach((el) => el.classList.toggle('is-invalid', mine.some((e) => e.fieldId === el.id)));
    });
    renderGeneral();
  }
  function revalidate() { if (submitted) { S.errors = validate(); renderErrors(); } }

  // --------------------------------------------------------------- eventos
  const touch = () => { dirty = true; renderGeneral(); revalidate(); };
  $('f-title').addEventListener('input', (e) => { S.title = e.target.value; touch(); });
  $('f-description').addEventListener('input', (e) => { S.description = e.target.value; touch(); });
  categorySelect.addEventListener('change', () => { S.categoryId = categorySelect.value; renderTags(); touch(); });
  $('f-has-limit').addEventListener('change', (e) => { S.hasLimit = e.target.checked; $('f-limit').disabled = !S.hasLimit; if (S.hasLimit) $('f-limit').focus(); touch(); });
  $('f-limit').addEventListener('input', (e) => { S.timeLimit = e.target.value; touch(); });
  region.querySelector('[data-action="preview-description"]').addEventListener('click', () => {
    region.querySelector('.md-preview').innerHTML = S.description.trim() ? ui.markdown(S.description) : '<p class="text-muted-qt">Nada que mostrar todavía.</p>';
  });

  tagsBox.addEventListener('change', (e) => {
    const cb = e.target.closest('input.btn-check');
    if (!cb) return;
    S.tagIds = cb.checked ? [...S.tagIds, cb.value].slice(0, LIMITS.tags) : S.tagIds.filter((t) => t !== cb.value);
    renderTags();
    document.getElementById(cb.id)?.focus();
    touch();
  });

  questionsBox.addEventListener('input', (e) => {
    const card = e.target.closest('.question-card');
    if (!card) return;
    const q = S.questions[Number(card.dataset.index)];
    const row = e.target.closest('.option-row');
    if (row && e.target.dataset.field === 'text') q.options[Number(row.dataset.option)].text = e.target.value;
    else if (e.target.dataset.field === 'text') q.text = e.target.value;
    else if (e.target.dataset.field === 'explanation') q.explanation = e.target.value;
    touch();
  });
  questionsBox.addEventListener('change', (e) => {
    if (e.target.dataset.field !== 'isCorrect') return;
    const card = e.target.closest('.question-card');
    const q = S.questions[Number(card.dataset.index)];
    q.options[Number(e.target.closest('.option-row').dataset.option)].isCorrect = e.target.checked;
    dirty = true;
    renderQuestions(e.target.id);
    revalidate();
  });
  questionsBox.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const card = btn.closest('.question-card');
    const i = Number(card.dataset.index);
    const qs = S.questions;
    const q = qs[i];
    let focus;
    switch (btn.dataset.action) {
      case 'move-up': [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]]; focus = `qcard-${q.uid}`; break;
      case 'move-down': [qs[i + 1], qs[i]] = [qs[i], qs[i + 1]]; focus = `qcard-${q.uid}`; break;
      case 'duplicate': {
        const copy = { uid: ++uid, text: q.text, explanation: q.explanation, options: q.options.map((o) => newOption(o.text, o.isCorrect)) };
        qs.splice(i + 1, 0, copy); focus = `q${copy.uid}-text`; break;
      }
      case 'remove-question': qs.splice(i, 1); ui.toast(`Pregunta ${i + 1} eliminada`); break;
      case 'add-option': { const o = newOption(); q.options.push(o); focus = `q${q.uid}-o${o.uid}`; break; }
      case 'remove-option': q.options.splice(Number(btn.closest('.option-row').dataset.option), 1); break;
      default: return;
    }
    dirty = true;
    renderQuestions(focus);
    if (focus && focus.startsWith('qcard-')) document.getElementById(focus)?.querySelector(`[data-action="${btn.dataset.action}"]`)?.focus();
    revalidate();
  });
  const addBtn = region.querySelector('[data-action="add-question"]');
  addBtn.id = 'add-question-btn';
  addBtn.addEventListener('click', () => {
    const q = newQuestion();
    S.questions.push(q);
    dirty = true;
    renderQuestions(`q${q.uid}-text`);
    document.getElementById(`qcard-${q.uid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    revalidate();
  });
  errorsAlert.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    const el = document.getElementById(a.getAttribute('href').slice(1));
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  });

  // ---------------------------------------------------------------- guardar
  function checkBeforeSave() {
    submitted = true;
    S.errors = validate();
    renderErrors();
    if (S.errors.length) {
      errorsAlert.scrollIntoView({ behavior: 'smooth', block: 'start' });
      errorsAlert.focus({ preventScroll: true });
      return false;
    }
    return true;
  }
  async function save(button) {
    const restore = ui.busy(button, 'Guardando…');
    try {
      const res = editMode ? await api.quizzes.update(quizId, payload()) : await api.quizzes.create(payload());
      dirty = false;
      ui.flash(editMode
        ? (res.versionCreated ? `Cambios guardados: ahora va en la versión ${res.version}` : 'Cambios guardados')
        : '¡Quiz publicado! Ya aparece en el catálogo');
      location.href = `quiz.html?id=${res.quizId}`;
    } catch (err) {
      restore();
      if (err.status === 400 && err.fields && err.fields.length) {
        S.errors = err.fields;
        renderErrors();
        errorsAlert.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        ui.toast(err.message, 'danger');
      }
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (editMode || !checkBeforeSave()) return;
    save(form.querySelector('[type="submit"]'));
  });
  region.querySelector('[data-action="save-edit"]').addEventListener('click', (e) => {
    if (!checkBeforeSave()) return;
    if (contentKey() !== original) ui.modal('modal-version').show();
    else save(e.currentTarget);
  });
  document.querySelector('[data-action="confirm-save"]').addEventListener('click', (e) => {
    ui.modal('modal-version').hide();
    save(e.currentTarget);
  });

  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
})();
