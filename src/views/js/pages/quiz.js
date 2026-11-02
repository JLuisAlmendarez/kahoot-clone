/* Página: detalle de un quiz (ruta /quiz/:id).
   API: GET /api/quizzes/:id · GET /api/quizzes/:id/versions · GET /api/versions/:id
        POST|DELETE /api/quizzes/:id/likes · POST /api/quizzes/:id/attempts · DELETE /api/quizzes/:id
        GET /api/quizzes/:id/comments · GET /api/comments/:id/replies · POST /api/quizzes/:id/comments · DELETE /api/comments/:id */
import { html, render, toNodes } from '../core/generate-html.js';
import { api } from '../core/api.js';
import { loadRegion, busy, toast, modal } from '../core/ui.js';
import { emptyState, skeletonRows, spinner } from '../templates/states.js';
import * as view from '../templates/quiz.js';

export default {
  title: 'Quiz',
  async mount({ outlet, params, me, navigate }) {
    let quiz = null;
    await loadRegion(outlet, () => api.quizzes.get(params.id), {
      errorText: 'No pudimos cargar el quiz. Revisa tu conexión e inténtalo de nuevo.',
      onError: (err) => {
        if (err.status !== 404) return false;
        render(outlet, html`<div class="py-4">${emptyState({
          icon: 'question-octagon', title: 'Este quiz no existe o fue eliminado',
          text: 'Quizá su creador o un administrador lo borró.',
          action: html`<a class="btn btn-primary" href="/">Ir al catálogo</a>`,
        })}</div>`);
        return true;
      },
      onData: (data) => { quiz = data; },
    });
    if (!quiz) return;

    document.title = `${quiz.title} · Quiztopia`;
    render(outlet, view.detail(quiz, me));
    const asideRegion = outlet.querySelector('[data-region="aside"]');
    const versionsRegion = outlet.querySelector('[data-region="versions"]');
    const forum = outlet.querySelector('[data-region="forum"]');
    const versionModal = outlet.querySelector('#modal-version');
    const renderAside = () => render(asideRegion, view.aside(quiz, me));

    // ============================================================ acciones
    outlet.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const handler = actions[btn.dataset.action];
      if (handler) await handler(btn, e);
    });

    let pendingCommentDelete = null;
    let commentsPage = 1;

    const actions = {
      // ---------------------------------------------------------- like
      async 'toggle-like'() {
        const before = { likedByMe: quiz.likedByMe, likesCount: quiz.likesCount };
        // Actualización optimista: se pinta antes de que responda el servidor
        quiz.likedByMe = !before.likedByMe;
        quiz.likesCount += quiz.likedByMe ? 1 : -1;
        quiz.canLike = false; // deshabilitado mientras responde (evita dobles clics)
        renderAside();
        try {
          Object.assign(quiz, await (quiz.likedByMe ? api.quizzes.like(quiz.quizId) : api.quizzes.unlike(quiz.quizId)));
        } catch (err) {
          Object.assign(quiz, before);
          toast(err.message, 'danger');
        }
        quiz.canLike = true;
        renderAside();
      },

      // --------------------------------------------------------- jugar
      async play(btn) {
        const restore = busy(btn, 'Preparando…');
        try {
          const s = await api.attempts.start(quiz.quizId);
          navigate(`/jugar/${s.attemptId}`);
        } catch (err) {
          restore();
          toast(err.message, 'danger');
        }
      },

      // ---------------------------------------------------------- borrar
      async 'confirm-delete-quiz'(btn) {
        const restore = busy(btn, 'Borrando…');
        try {
          await api.quizzes.remove(quiz.quizId);
          toast('Quiz borrado definitivamente.', 'success');
          navigate(quiz.isOwner ? '/perfil/creados' : '/admin/quizzes', { force: true });
        } catch (err) {
          restore();
          toast(err.message, 'danger');
        }
      },

      // ------------------------------------------------------- versiones
      async 'open-version'(btn) {
        const body = versionModal.querySelector('[data-region="version-detail"]');
        modal(versionModal).show();
        await loadRegion(body, () => api.quizzes.version(btn.dataset.versionId), {
          loading: spinner(),
          onData: (snap) => {
            render(versionModal.querySelector('[data-slot="version-header"]'), view.snapshotHeader(snap));
            render(body, view.snapshotBody(snap));
          },
        });
      },

      // ------------------------------------------------------------ foro
      async 'load-more'(btn) {
        const restore = busy(btn, 'Cargando…');
        try {
          const data = await api.comments.list(quiz.quizId, { page: commentsPage + 1 });
          commentsPage = data.page;
          forum.querySelector('[data-slot="items"]').append(...toNodes(data.items.map((c) => view.comment(c, quiz))));
          forum.querySelector('[data-slot="more"]').hidden = data.page >= data.totalPages;
        } catch (err) {
          toast(err.message, 'danger');
        }
        restore();
      },
      async 'toggle-replies'(btn) {
        const thread = btn.closest('[data-thread]');
        const box = thread.querySelector('[data-slot="replies"]');
        if (!box.hidden) {
          box.hidden = true;
          btn.setAttribute('aria-expanded', 'false');
          render(btn, view.repliesToggle(box.children.length, false));
          return;
        }
        await loadReplies(thread);
      },
      reply(btn) {
        const thread = btn.closest('[data-thread]');
        const slot = thread.querySelector('[data-slot="reply-form"]');
        if (!slot.firstElementChild) render(slot, view.replyForm(thread.dataset.commentId));
        slot.querySelector('textarea').focus();
      },
      'cancel-reply'(btn) {
        btn.closest('[data-slot="reply-form"]').replaceChildren();
      },
      'delete-comment'(btn) {
        pendingCommentDelete = btn.closest('[data-comment-id]').dataset.commentId;
        modal(outlet.querySelector('#modal-borrar-comentario')).show();
      },
      async 'confirm-delete-comment'(btn) {
        if (!pendingCommentDelete) return;
        const restore = busy(btn, 'Borrando…');
        try {
          const res = await api.comments.remove(pendingCommentDelete);
          modal(outlet.querySelector('#modal-borrar-comentario')).hide();
          await loadComments();
          toast(res.softDeleted ? 'Comentario eliminado; sus respuestas se conservan' : 'Comentario borrado');
        } catch (err) {
          toast(err.message, 'danger');
        }
        restore();
        pendingCommentDelete = null;
      },
    };

    // ============================================================ foro
    async function loadComments() {
      const region = forum.querySelector('[data-region="comments"]');
      await loadRegion(region, () => api.comments.list(quiz.quizId, { page: 1 }), {
        loading: skeletonRows(3),
        errorText: 'No pudimos cargar el foro.',
        onData: (data) => {
          commentsPage = data.page;
          forum.querySelector('[data-slot="threads"]').textContent = data.total;
          render(region, view.commentsList(data, quiz));
        },
      });
    }

    async function loadReplies(thread, { open = true } = {}) {
      const box = thread.querySelector('[data-slot="replies"]');
      const toggle = thread.querySelector('[data-action="toggle-replies"]');
      try {
        const { items } = await api.comments.replies(thread.dataset.commentId);
        render(box, items.map(view.reply));
        box.hidden = !open;
        toggle.hidden = items.length === 0;
        toggle.setAttribute('aria-expanded', String(open));
        render(toggle, view.repliesToggle(items.length, open));
      } catch (err) {
        toast(err.message, 'danger');
      }
    }

    outlet.addEventListener('input', (e) => {
      if (e.target.id === 'new-comment') forum.querySelector('[data-slot="length"]').textContent = e.target.value.length;
    });

    outlet.addEventListener('submit', async (e) => {
      const form = e.target.closest('[data-form="comment"], [data-form="reply"]');
      if (!form) return;
      e.preventDefault();
      const body = form.body.value.trim();
      if (!body) { form.body.focus(); return; }
      const isReply = form.dataset.form === 'reply';
      const thread = isReply ? form.closest('[data-thread]') : null;
      const restore = busy(form.querySelector('[type="submit"]'), isReply ? 'Enviando…' : 'Publicando…');
      try {
        await api.comments.create(quiz.quizId, { body, parentId: thread?.dataset.commentId ?? null });
        if (isReply) {
          form.parentElement.replaceChildren();
          await loadReplies(thread);
          toast('Respuesta publicada');
        } else {
          form.reset();
          forum.querySelector('[data-slot="length"]').textContent = '0';
          await loadComments();
          toast('Comentario publicado');
        }
      } catch (err) {
        toast(err.message, 'danger');
      }
      restore();
    });

    // Versiones y foro no dependen entre sí: se cargan en paralelo
    await Promise.allSettled([
      loadRegion(versionsRegion, () => api.quizzes.versions(quiz.quizId), {
        loading: skeletonRows(2),
        errorText: 'No pudimos cargar las versiones.',
        onData: (versions) => render(versionsRegion, view.versionsList(versions)),
      }),
      loadComments(),
    ]);
  },
};
