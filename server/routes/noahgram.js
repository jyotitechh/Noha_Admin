/* Noahgram moderation: the posts and reels waiting for the office, the ones that are live, and the comments under them.

   Who may: community.moderate, the same as the rest of Community. See server/noahgram.js for where each thing comes from
   and why a decision goes through the Noah API and never through the table. */

import { roleById } from '../db.js';
import { writeAudit } from '../store.js';
import { noahConfigured, decideNoahgramPost, getFile, NoahApiError } from '../noah-api.js';
import { pendingPosts, livePosts, commentsOn, moderateComment, mediaOfPost, forgetNoahgram } from '../noahgram.js';
import { explainCatalyst } from '../catalyst.js';

const NEEDS_KEY = 'NOAH_ADMIN_API_KEY is not set on the API, so Noahgram posts cannot be read or decided. Set it and try again.';

/** A Noah refusal keeps its meaning; anything else is the API (or Catalyst) being unreachable, not this server falling over. */
function fail(res, err) {
  if (err instanceof NoahApiError) {
    return res.status([404, 409].includes(err.status) ? err.status : 502).json({ error: err.message, code: err.code });
  }
  const explained = explainCatalyst(err);
  return res.status(explained?.status ?? 502).json({ error: explained?.message ?? `Noahgram could not be read: ${err.message}`, ...(explained ? { code: explained.code } : {}) });
}

export default function mountNoahgram(app, { requireSession, requirePerm }) {
  const guard = [requireSession, requirePerm('community.moderate')];

  /* ?state=pending (from the Noah API) or live (from the table). */
  app.get('/api/noahgram/posts', ...guard, async (req, res) => {
    const state = req.query.state === 'live' ? 'live' : 'pending';
    try {
      if (state === 'pending') {
        if (!noahConfigured()) return res.json({ rows: [], state, needsAdminKey: true });
        return res.json({ rows: await pendingPosts(), state });
      }
      res.json({ rows: await livePosts({ limit: req.query.limit }), state });
    } catch (err) {
      fail(res, err);
    }
  });

  /* Approve, or turn down. Turning down also takes a post that is already live off the feed, and the author is told. */
  app.post('/api/noahgram/posts/:id/decide', ...guard, async (req, res) => {
    const decision = req.body?.decision;
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'Decide approve or reject.' });
    const note = String(req.body?.note || '').trim().slice(0, 500);
    if (decision === 'reject' && !note) return res.status(400).json({ error: 'Say why it is coming down. The member is told.' });
    if (!noahConfigured()) return res.status(409).json({ error: NEEDS_KEY, needsAdminKey: true });

    try {
      const result = await decideNoahgramPost(req.params.id, { decision, note, actor: req.user.name });
      forgetNoahgram();
      await writeAudit({
        actor: req.user.name, role: roleById(req.session.role).name,
        action: decision === 'approve' ? 'Approved a Noahgram post' : 'Took down a Noahgram post',
        module: 'Community', record: String(req.params.id),
        before: null, after: { decision, via: 'noah-api' }, remark: note, ip: req.ip || '',
      });
      res.json({ ok: true, decision, result });
    } catch (err) {
      fail(res, err);
    }
  });

  /* A picture or video, through here and not from a public address, so the permission check runs. The id of the file is read
     from the post, never taken from the request. */
  app.get('/api/noahgram/posts/:id/media/:which', ...guard, async (req, res) => {
    const which = req.params.which;
    if (!['main', 'still'].includes(which)) return res.status(400).json({ error: 'which must be main or still.' });
    if (!/^\d{6,}$/.test(String(req.params.id))) return res.status(404).json({ error: 'No such post.' });
    if (!noahConfigured()) return res.status(409).json({ error: NEEDS_KEY, needsAdminKey: true });
    try {
      const found = await mediaOfPost(req.params.id, which);
      if (found.error) return res.status(found.status).json({ error: found.error });
      if (found.redirect) return res.redirect(found.redirect);
      const { buffer, contentType } = await getFile(found.fileId, { actor: req.user.name });
      /* File Store answers every download as a generic byte stream; say what it is, or a browser may not show it. */
      const generic = !contentType || /octet-stream/i.test(contentType);
      const fallback = found.mime || (which === 'main' && found.reel ? 'video/mp4' : 'image/jpeg');
      res.setHeader('content-type', generic ? fallback : contentType);
      res.setHeader('cache-control', 'private, max-age=300');
      res.send(buffer);
    } catch (err) {
      res.status(502).json({ error: `The Noah API could not serve this file: ${err.message}` });
    }
  });

  app.get('/api/noahgram/posts/:id/comments', ...guard, async (req, res) => {
    try {
      res.json({ rows: await commentsOn(req.params.id) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/api/noahgram/comments/:id/moderate', ...guard, async (req, res) => {
    const action = req.body?.action;
    if (!['remove', 'hide', 'show'].includes(action)) return res.status(400).json({ error: 'Choose remove, hide or show.' });
    try {
      const out = await moderateComment(req.params.id, action);
      if (out.error) return res.status(out.status).json({ error: out.error, code: out.code });
      await writeAudit({
        actor: req.user.name, role: roleById(req.session.role).name,
        action: { remove: 'Removed a Noahgram comment', hide: 'Hid a Noahgram comment', show: 'Showed a Noahgram comment again' }[action],
        module: 'Community', record: String(req.params.id),
        before: null, after: { post: out.postId, comment: out.text }, remark: String(req.body?.note || '').trim().slice(0, 300), ip: req.ip || '',
      });
      res.json({ ok: true, action });
    } catch (err) {
      fail(res, err);
    }
  });
}
