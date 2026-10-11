/* quiz.js — quiz.html: detalle, historial de versiones, likes y foro.
   API: GET /api/quizzes/:id · GET /api/quizzes/:id/versions · GET /api/versions/:id
        POST|DELETE /api/quizzes/:id/likes · POST /api/quizzes/:id/attempts · DELETE /api/quizzes/:id
        GET /api/quizzes/:id/comments · GET /api/comments/:id/replies · POST /api/quizzes/:id/comments · DELETE /api/comments/:id */
(async function () {
  'use strict';
  const { ui } = QT;
  const { api, me } = await QT.ready;

  const quizId = ui.params().get('id') || 'q-algebra';
  const region = document.querySelector('[data-region="quiz"]');
  const versionsRegion = document.querySelector('[data-region="versions"]');
  const commentsRegion = document.querySelector('[data-region="comments"]');
  const likeBtn = region.querySelector('[data-action="toggle-like"]');
  const playBtn = region.querySelector('[data-action="play"]');

  /** Estado de la página: los datos del quiz más la sesión. */
  let quiz = null;
  const ctx = () => ({ ...quiz, session: !!me });

  // ================================================================ detalle
  async function loadQuiz() {
    quiz = await ui.load(region, () => api.quizzes.get(quizId), {
      onError: (err) => {
        if (err.status === 404) { ui.setState(region, 'empty'); return true; }
        return false;
      },
    });
    if (!quiz) return;
    document.title = `${quiz.title} · Quiztopia`;
    renderDetail();
    ui.renderList(region.querySelector('[data-list="tags"]'), quiz.tags);
    // Versiones y foro no dependen entre sí: se cargan en paralelo
    await Promise.allSettled([loadVersions(), loadComments(1)]);
    if (location.hash === '#foro' || location.hash === '#versiones') document.querySelector(location.hash).scrollIntoView();
  }

  function renderDetail() {
    ui.fill(region, ctx());
    ui.fill(document.getElementById('modal-borrar'), ctx());
    likeBtn.setAttribute('aria-pressed', String(quiz.likedByMe));
    likeBtn.disabled = !quiz.canLike;
    likeBtn.querySelector('i').className = `bi bi-heart${quiz.likedByMe ? '-fill' : ''} me-1`;
    const visitorPlay = region.querySelector('a[data-show-if="!session"]');
    if (visitorPlay) visitorPlay.href = `acceso.html?modo=login&next=${encodeURIComponent(ui.here())}`;
  }

  // ------------------------------------------------------------------ like
  likeBtn.addEventListener('click', async () => {
    const before = { likedByMe: quiz.likedByMe, likesCount: quiz.likesCount };
    // Actualización optimista: se pinta antes de que responda el servidor
    quiz.likedByMe = !before.likedByMe;
    quiz.likesCount += quiz.likedByMe ? 1 : -1;
    renderDetail();
    likeBtn.disabled = true;
    try {
      const res = quiz.likedByMe ? await api.quizzes.like(quiz.quizId) : await api.quizzes.unlike(quiz.quizId);
      Object.assign(quiz, res);
    } catch (err) {
      Object.assign(quiz, before); // si falla, se regresa como estaba
      ui.toast(err.message, 'danger');
    }
    renderDetail();
  });

  // ----------------------------------------------------------------- jugar
  playBtn.addEventListener('click', async () => {
    const restore = ui.busy(playBtn, 'Preparando…');
    try {
      const session = await api.attempts.start(quiz.quizId);
      location.href = `jugar.html?attempt=${session.attemptId}`;
    } catch (err) {
      restore();
      ui.toast(err.message, 'danger');
    }
  });

  // ----------------------------------------------------------------- borrar
  document.querySelector('[data-action="confirm-delete-quiz"]').addEventListener('click', async (e) => {
    const restore = ui.busy(e.currentTarget, 'Borrando…');
    try {
      await api.quizzes.remove(quiz.quizId);
      ui.flash('Quiz borrado. Quienes lo jugaron conservan sus intentos 3 meses.');
      location.href = 'perfil.html?tab=creados';
    } catch (err) {
      restore();
      ui.toast(err.message, 'danger');
    }
  });

  // ============================================================= versiones
  async function loadVersions() {
    const versions = await ui.load(versionsRegion, () => api.quizzes.versions(quiz.quizId));
    if (!versions) return;
    ui.renderList(versionsRegion.querySelector('[data-list="versions"]'), versions, {
      onItem: (li, v) => {
        const btn = li.querySelector('[data-action="open-version"]');
        btn.dataset.versionId = v.versionId;
        btn.setAttribute('aria-label', `Ver snapshot de la versión ${v.version}`);
      },
    });
  }

  const versionModal = document.getElementById('modal-version');
  const versionDetail = versionModal.querySelector('[data-region="version-detail"]');
  versionsRegion.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="open-version"]');
    if (!btn) return;
    const snapshot = await ui.load(versionDetail, () => api.quizzes.version(btn.dataset.versionId));
    if (!snapshot) return;
    ui.fill(versionModal, snapshot);
    ui.fill(versionDetail, snapshot);
    ui.renderList(versionDetail.querySelector('[data-list="questions"]'), snapshot.questions, {
      onItem: (card, q) => {
        if (q.change === 'modified') card.classList.add('border-warning');
        if (q.change === 'new' && snapshot.version > 1) card.classList.add('border-success');
        // En la versión 1 todas son nuevas: no se marcan
        if (snapshot.version === 1) card.querySelectorAll('.badge').forEach((b) => { b.hidden = true; });
        card.querySelectorAll('.review-opt').forEach((li, i) => {
          if (q.options[i].isCorrect) li.classList.add('correct');
        });
      },
    });
  });

  // ================================================================== foro
  const commentForm = commentsRegion.querySelector('[data-form="comment"]');
  const itemsBox = commentsRegion.querySelector('[data-list="items"]');
  let commentsPage = 1;
  let pendingDelete = null;

  async function loadComments(page) {
    const append = page > 1;
    const loader = () => api.comments.list(quiz.quizId, { page });
    const data = append ? await loader().catch((err) => { ui.toast(err.message, 'danger'); return null; })
      : await ui.load(commentsRegion, loader, { isEmpty: (d) => d.total === 0 });
    if (!data) return;
    commentsPage = data.page;
    ui.fill(commentsRegion, { ...data, canComment: quiz.canComment, session: !!me, bodyLength: commentForm.body.value.length });
    if (data.total === 0) ui.setState(commentsRegion, 'empty');
    ui.renderList(itemsBox, data.items, { append, parent: { canComment: quiz.canComment }, onItem: (el, c) => { el.dataset.commentId = c.commentId; } });
  }

  async function loadReplies(article, { open = true } = {}) {
    const box = article.querySelector('[data-list="replies"]');
    const toggle = article.querySelector('[data-action="toggle-replies"]');
    try {
      const { items } = await api.comments.replies(article.dataset.commentId);
      ui.renderList(box, items, { onItem: (el, r) => { el.dataset.commentId = r.commentId; el.dataset.parentId = article.dataset.commentId; } });
      box.hidden = !open;
      if (toggle) {
        toggle.hidden = items.length === 0;
        toggle.setAttribute('aria-expanded', String(open));
        toggle.innerHTML = `<i class="bi bi-chevron-${open ? 'up' : 'down'} me-1" aria-hidden="true"></i>${open ? 'Ocultar' : 'Ver'} ${items.length} ${items.length === 1 ? 'respuesta' : 'respuestas'}`;
      }
    } catch (err) {
      ui.toast(err.message, 'danger');
    }
  }

  // Contador de caracteres del comentario nuevo
  commentForm.body.addEventListener('input', () => {
    commentForm.querySelector('[data-bind="bodyLength"]').textContent = commentForm.body.value.length;
  });
  commentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = commentForm.body.value.trim();
    if (!body) { commentForm.body.focus(); return; }
    const restore = ui.busy(commentForm.querySelector('[type="submit"]'), 'Publicando…');
    try {
      await api.comments.create(quiz.quizId, { body });
      commentForm.reset();
      await loadComments(1);
      ui.toast('Comentario publicado');
    } catch (err) {
      ui.toast(err.message, 'danger');
    } finally {
      restore();
    }
  });

  commentsRegion.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const article = btn.closest('[data-comment-id]');
    switch (btn.dataset.action) {
      case 'load-more': {
        const restore = ui.busy(btn, 'Cargando…');
        await loadComments(commentsPage + 1);
        restore();
        break;
      }
      case 'toggle-replies': {
        const box = article.querySelector('[data-list="replies"]');
        if (!box.hidden) {
          box.hidden = true;
          btn.setAttribute('aria-expanded', 'false');
          btn.innerHTML = btn.innerHTML.replace('chevron-up', 'chevron-down').replace('Ocultar', 'Ver');
        } else {
          await loadReplies(article);
        }
        break;
      }
      case 'reply': {
        const slot = article.querySelector('[data-slot="reply-form"]');
        if (slot.firstElementChild) { slot.querySelector('textarea').focus(); break; }
        slot.append(document.getElementById('tpl-reply-form').content.cloneNode(true));
        const textarea = slot.querySelector('textarea');
        textarea.id = `reply-${article.dataset.commentId}`;
        slot.querySelector('label').htmlFor = textarea.id;
        textarea.focus();
        break;
      }
      case 'cancel-reply':
        btn.closest('[data-slot="reply-form"]').replaceChildren();
        break;
      case 'delete-comment':
        pendingDelete = { commentId: article.dataset.commentId };
        ui.modal('modal-borrar-comentario').show();
        break;
      default:
    }
  });

  commentsRegion.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-form="reply"]');
    if (!form) return;
    e.preventDefault();
    const article = form.closest('[data-comment-id]');
    const body = form.body.value.trim();
    if (!body) { form.body.focus(); return; }
    const restore = ui.busy(form.querySelector('[type="submit"]'), 'Enviando…');
    try {
      await api.comments.create(quiz.quizId, { body, parentId: article.dataset.commentId });
      form.parentElement.replaceChildren();
      await loadReplies(article, { open: true });
      ui.toast('Respuesta publicada');
    } catch (err) {
      restore();
      ui.toast(err.message, 'danger');
    }
  });

  document.querySelector('[data-action="confirm-delete-comment"]').addEventListener('click', async (e) => {
    if (!pendingDelete) return;
    const restore = ui.busy(e.currentTarget, 'Borrando…');
    try {
      const res = await api.comments.remove(pendingDelete.commentId);
      ui.modal('modal-borrar-comentario').hide();
      await loadComments(1);
      ui.toast(res.softDeleted ? 'Comentario eliminado; sus respuestas se conservan' : 'Comentario borrado');
    } catch (err) {
      ui.toast(err.message, 'danger');
    } finally {
      restore();
      pendingDelete = null;
    }
  });

  await loadQuiz();
})();
