/* Comments members have reported (Daily Manna and Noahgram), for the office to decide.

   A member can report a comment once, never their own. At three different reporters the API hides it for everybody and keeps it in
   the table; nobody is told, and the API never deletes one. The office looks here: keep it (it was reported unfairly), hide it
   without removing, or remove it. See server/noahgram.js and FOR-CONSOLE-REPORTS-AND-EDUCATION.md.

   Who may: community.moderate. */

import { roleById } from '../db.js';
import { writeAudit } from '../store.js';
import { reportedComments, moderateComment } from '../noahgram.js';
import { explainCatalyst } from '../catalyst.js';

const LABEL = { keep: 'Kept a reported comment', hide: 'Hid a reported comment', remove: 'Removed a reported comment' };

export default function mountReported(app, { requireSession, requirePerm }) {
  const guard = [requireSession, requirePerm('community.moderate')];

  app.get('/api/reported-comments', ...guard, async (_req, res) => {
    try {
      res.json({ rows: await reportedComments() });
    } catch (err) {
      const explained = explainCatalyst(err);
      res.status(explained?.status ?? 502).json({ error: explained?.message ?? `Reported comments could not be read: ${err.message}` });
    }
  });

  app.post('/api/reported-comments/:id/decide', ...guard, async (req, res) => {
    const action = req.body?.action;
    if (!['keep', 'hide', 'remove'].includes(action)) return res.status(400).json({ error: 'Choose keep, hide or remove.' });
    try {
      const out = await moderateComment(req.params.id, action, { components: [1, 2] });
      if (out.error) return res.status(out.status).json({ error: out.error, code: out.code });
      await writeAudit({
        actor: req.user.name, role: roleById(req.session.role).name,
        action: LABEL[action], module: 'Community', record: String(req.params.id),
        before: null, after: { on: out.component === 1 ? 'Daily Manna' : 'Noahgram', parent: out.postId, comment: out.text },
        remark: String(req.body?.note || '').trim().slice(0, 300), ip: req.ip || '',
      });
      res.json({ ok: true, action });
    } catch (err) {
      const explained = explainCatalyst(err);
      res.status(explained?.status ?? 502).json({ error: explained?.message ?? `Catalyst refused the change: ${err.message}` });
    }
  });
}
