/* Página: crear (/editor) o editar (/editor/:id) un quiz.
   API: GET /api/categories · GET /api/quizzes/:id/edit · POST /api/quizzes · PUT /api/quizzes/:id
   La validación usa /shared/rules.js, el mismo archivo que usa el servidor:
   el usuario ve los errores antes de enviar y la API los vuelve a revisar. */
import { html, render } from '../core/generate-html.js';
import { api } from '../core/api.js';
import { loadRegion, busy, toast, modal, md } from '../core/ui.js';
import { emptyState } from '../templates/states.js';
import * as view from '../templates/editor.js';
import { LIMITS, checkQuizInput, questionKey } from '/shared/rules.js';

export default {
  title: (ctx) => (ctx.params.id ? 'Editar quiz' : 'Crear quiz'),
  auth: true,
  async mount({ outlet, params, navigate, setLeaveGuard }) {
    const editMode = !!params.id;

    // ---------------------------------------------------------- estado
    let uid = 0;
    const newOption = (text = '', isCorrect = false) => ({ uid: ++uid, text, isCorrect });
    const newQuestion = (text = '', explanation = '', options = [newOption(), newOption()]) => ({ uid: ++uid, text, explanation, options });
    const S = {
      quizId: params.id || null, version: 0, title: '', description: '', categoryId: '', tagIds: [],
      hasLimit: true, timeLimit: 10, questions: [newQuestion()], errors: [],
    };
    let categories = [];
    let submitted = false; // después del primer intento de guardar, valida mientras escribes
    let dirty = false;

    const loaded = await loadRegion(outlet, () => Promise.all([api.categories.list(), editMode ? api.quizzes.getForEdit(params.id) : null]), {
      errorText: 'No pudimos cargar el editor.',
      onError: (err) => {
        if (err.status !== 403 && err.status !== 404) return false;
        render(outlet, html`<div class="py-4">${emptyState(err.status === 403
          ? { icon: 'shield-lock', title: 'No puedes editar este quiz', text: 'Solo su creador puede modificarlo.' }
          : { icon: 'question-octagon', title: 'Este quiz no existe o fue eliminado', action: html`<a class="btn btn-primary" href="/">Ir al catálogo</a>` })}</div>`);
        return true;
      },
    });
    if (!loaded) return undefined;
    [categories] = loaded;
    const existing = loaded[1];
    if (existing) {
      Object.assign(S, {
        version: existing.version, title: existing.title, description: existing.description, categoryId: existing.categoryId,
        tagIds: existing.tagIds, hasLimit: existing.timeLimit !== null, timeLimit: existing.timeLimit || 10,
        questions: existing.questions.map((q) => newQuestion(q.text, q.explanation || '', q.options.map((o) => newOption(o.text, o.isCorrect)))),
      });
    }

    const payload = () => ({
      title: S.title, description: S.description, categoryId: S.categoryId, tagIds: S.tagIds,
      timeLimit: S.hasLimit ? Number(S.timeLimit) : null,
      questions: S.questions.map((q) => ({ text: q.text, explanation: q.explanation, options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) })),
    });
    const contentKey = () => { const p = payload(); return JSON.stringify([p.timeLimit, p.questions.map(questionKey)]); };
    const original = contentKey();

    render(outlet, view.editorView({ editMode, S, categories }));
    const form = outlet.querySelector('[data-form="quiz"]');
    const $ = (sel) => outlet.querySelector(sel);
    const questionsBox = $('[data-slot="questions"]');
    const errorsBox = $('[data-slot="errors"]');

    // ---------------------------------------------------------- pintar
    /** Ruta del error (questions.1.options.0.text) → id del campo y mensaje legible. */
    function describe(err) {
      const m = err.path.match(/^questions\.(\d+)(?:\.(\w+))?(?:\.(\d+))?/);
      if (!m) {
        const ids = { title: 'f-title', categoryId: 'f-category', timeLimit: 'f-limit', tagIds: 'tag-groups', description: 'f-description' };
        return { ...err, fieldId: ids[err.path] || 'f-title', short: err.message };
      }
      const i = Number(m[1]);
      const q = S.questions[i];
      if (!q) return { ...err, fieldId: 'f-title', short: err.message };
      const opt = m[3] !== undefined ? q.options[Number(m[3])] : null;
      const fieldId = m[2] === 'options'
        ? (opt ? `q${q.uid}-o${opt.uid}` : `q${q.uid}-o${q.options[0]?.uid}-ok`)
        : m[2] === 'explanation' ? `q${q.uid}-exp` : `q${q.uid}-text`;
      return { ...err, question: i, fieldId, short: err.message, message: `Pregunta ${i + 1}: ${err.message}` };
    }

    function renderErrors() {
      const list = S.errors.map(describe);
      errorsBox.hidden = list.length === 0;
      render(errorsBox, view.errorSummary(list));
      $('#f-title').classList.toggle('is-invalid', list.some((e) => e.path === 'title'));
      $('#f-category').classList.toggle('is-invalid', list.some((e) => e.path === 'categoryId'));
      $('#f-limit').classList.toggle('is-invalid', list.some((e) => e.path === 'timeLimit'));
      return list;
    }

    function renderQuestions(focusId) {
      const list = renderErrors();
      render(questionsBox, S.questions.map((q, i) => view.questionCard(q, i, S.questions.length, list.filter((e) => e.question === i))));
      questionsBox.querySelectorAll('.option-row .form-control').forEach((el) => el.classList.toggle('is-invalid', list.some((e) => e.fieldId === el.id)));
      $('[data-count="questions"]').textContent = S.questions.length;
      $('[data-action="add-question"]').disabled = S.questions.length >= LIMITS.questions[1];
      if (focusId) document.getElementById(focusId)?.focus();
    }

    const renderTags = () => {
      render($('[data-slot="tags"]'), view.tagGroups(categories, S.categoryId, S.tagIds));
      $('[data-count="tags"]').textContent = S.tagIds.length;
    };

    const validate = () => checkQuizInput(payload());
    /** Tras el primer intento de guardar, los errores se actualizan mientras escribes. */
    function revalidate({ full = false } = {}) {
      if (!submitted) return;
      S.errors = validate();
      if (full) renderQuestions(); else renderErrors();
    }
    const touch = (opts) => { dirty = true; revalidate(opts); };

    // --------------------------------------------------- datos generales
    form.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'f-title') { S.title = t.value; $('[data-count="title"]').textContent = t.value.length; touch(); }
      else if (t.id === 'f-description') { S.description = t.value; $('[data-count="description"]').textContent = t.value.length; touch(); }
      else if (t.id === 'f-limit') { S.timeLimit = t.value; touch(); }
      else if (t.closest('.question-card')) onQuestionInput(t);
    });
    form.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'f-category') { S.categoryId = t.value; renderTags(); touch(); }
      else if (t.id === 'f-has-limit') { S.hasLimit = t.checked; $('#f-limit').disabled = !S.hasLimit; if (S.hasLimit) $('#f-limit').focus(); touch(); }
      else if (t.name === 'tags') {
        S.tagIds = t.checked ? [...S.tagIds, t.value].slice(0, LIMITS.tags) : S.tagIds.filter((x) => x !== t.value);
        renderTags();
        document.getElementById(t.id)?.focus();
        touch();
      } else if (t.dataset.field === 'isCorrect') {
        const q = S.questions[Number(t.closest('.question-card').dataset.index)];
        q.options[Number(t.closest('.option-row').dataset.option)].isCorrect = t.checked;
        dirty = true;
        if (submitted) S.errors = validate();
        renderQuestions(t.id); // cambia la etiqueta «Una respuesta / Varias respuestas»
      }
    });

    // --------------------------------------------------------- preguntas
    function onQuestionInput(t) {
      const q = S.questions[Number(t.closest('.question-card').dataset.index)];
      const row = t.closest('.option-row');
      if (row && t.dataset.field === 'text') q.options[Number(row.dataset.option)].text = t.value;
      else if (t.dataset.field === 'text') q.text = t.value;
      else if (t.dataset.field === 'explanation') q.explanation = t.value;
      touch();
    }

    form.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) {
        const link = e.target.closest('[data-slot="errors"] a[data-field]');
        if (link) { // enlace del resumen de errores → lleva al campo
          e.preventDefault();
          const el = document.getElementById(link.dataset.field);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el?.focus({ preventScroll: true });
        }
        return;
      }
      if (btn.dataset.action === 'preview-description') {
        render($('[data-slot="preview"]'), S.description.trim() ? md(S.description) : html`<p class="text-muted-qt">Nada que mostrar todavía.</p>`);
        return;
      }
      if (btn.dataset.action === 'add-question') {
        const q = newQuestion();
        S.questions.push(q);
        dirty = true;
        if (submitted) S.errors = validate();
        renderQuestions(`q${q.uid}-text`);
        document.getElementById(`qcard-${q.uid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const card = btn.closest('.question-card');
      if (!card) return;
      const i = Number(card.dataset.index);
      const qs = S.questions;
      const q = qs[i];
      let focus;
      switch (btn.dataset.action) {
        case 'move-up': [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]]; focus = `qcard-${q.uid}`; break;
        case 'move-down': [qs[i + 1], qs[i]] = [qs[i], qs[i + 1]]; focus = `qcard-${q.uid}`; break;
        case 'duplicate': {
          const copy = newQuestion(q.text, q.explanation, q.options.map((o) => newOption(o.text, o.isCorrect)));
          qs.splice(i + 1, 0, copy); focus = `q${copy.uid}-text`; break;
        }
        case 'remove-question': qs.splice(i, 1); toast(`Pregunta ${i + 1} eliminada`); break;
        case 'add-option': { const o = newOption(); q.options.push(o); focus = `q${q.uid}-o${o.uid}`; break; }
        case 'remove-option': q.options.splice(Number(btn.closest('.option-row').dataset.option), 1); break;
        default: return;
      }
      dirty = true;
      if (submitted) S.errors = validate();
      renderQuestions(focus);
    });

    // ----------------------------------------------------------- guardar
    function checkBeforeSave() {
      submitted = true;
      S.errors = validate();
      renderQuestions();
      if (S.errors.length) {
        errorsBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        errorsBox.focus({ preventScroll: true });
        return false;
      }
      return true;
    }

    async function save(button) {
      const restore = busy(button, 'Guardando…');
      try {
        const res = editMode ? await api.quizzes.update(params.id, payload()) : await api.quizzes.create(payload());
        dirty = false;
        toast(editMode
          ? (res.versionCreated ? `Cambios guardados: ahora va en la versión ${res.version}` : 'Cambios guardados')
          : '¡Quiz publicado! Ya aparece en el catálogo', 'success');
        navigate(`/quiz/${res.quizId}`, { force: true });
      } catch (err) {
        restore();
        if (err.status === 400 && err.fields?.length) {
          S.errors = err.fields;
          renderQuestions();
          errorsBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          toast(err.message, 'danger');
        }
      }
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!checkBeforeSave()) return;
      const button = form.querySelector('[type="submit"]');
      if (editMode && contentKey() !== original) modal($('#modal-version')).show();
      else save(button);
    });
    $('[data-action="confirm-save"]').addEventListener('click', (e) => {
      modal($('#modal-version')).hide();
      save(e.currentTarget);
    });

    // ----------------------------------------------- cambios sin guardar
    setLeaveGuard(() => !dirty || window.confirm('Tienes cambios sin guardar. ¿Salir de todos modos?'));
    const onBeforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onBeforeUnload);

    renderTags();
    renderQuestions();
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  },
};
