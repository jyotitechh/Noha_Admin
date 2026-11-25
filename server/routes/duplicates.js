/* Membership > Duplicate Emails (server/duplicate-emails.js).

     GET  /api/duplicate-emails              every address two or more members use          members.edit
     POST /api/duplicate-emails/check        { key, note? }: mark it checked               members.edit
     POST /api/duplicate-emails/reopen       { key }: open it again                         members.edit

   Correcting an address is the ordinary member edit (PATCH /api/people/:id with { changes: { email } }), which needs
   members.pii, as every contact detail does. Without members.pii the addresses and numbers here are partly hidden. */

import { can, roleById } from '../db.js';
import { writeAudit, live, isNoah } from '../store.js';
import { findDuplicateEmails, markEmailChecked, reopenEmailCheck, maskEmail } from '../duplicate-emails.js';
import { explainCatalyst } from '../catalyst.js';

const maskMobile = (m = '') => String(m).replace(/(\d{2})\d+(\d{2})$/, '$1••••••$2');

export default function mountDuplicates(app, { requireSession, requirePerm }) {
  const guard = [requireSession, requirePerm('members.edit')];
  const failed = (res, err, what) => {
    const explained = explainCatalyst(err);
    res.status(explained?.status ?? 503).json({ error: explained?.message ?? `${what}: ${err.message}` });
  };
  const audit = (req, action, key, after, remark = '') => writeAudit({
    actor: req.user.name, role: roleById(req.session.role).name, action, module: 'Membership',
    /* The address is a contact detail: the log names it by its mailbox only for those who may see it. */
    record: can(req.session.role, 'members.pii') ? key : maskEmail(key), before: null, after, remark, ip: req.ip || '',
  }).catch(() => {});

  app.get('/api/duplicate-emails', ...guard, async (req, res) => {
    if (!(live() && isNoah())) return res.json({ rows: [], pii: false });
    try {
      const pii = can(req.session.role, 'members.pii');
      const rows = (await findDuplicateEmails()).map(({ signature, ...g }) => (pii ? g : {
        ...g,
        key: g.key,
        email: maskEmail(g.email),
        entries: g.entries.map((e) => ({ ...e, email: maskEmail(e.email), mobile: maskMobile(e.mobile) })),
      }));
      res.json({ rows, pii });
    } catch (err) {
      failed(res, err, 'The duplicate emails could not be read');
    }
  });

  app.post('/api/duplicate-emails/check', ...guard, async (req, res) => {
    const key = String(req.body?.key || '').trim();
    if (!key) return res.status(400).json({ error: 'Say which address was checked.' });
    try {
      const g = await markEmailChecked(key, { by: req.user.name, byRowId: req.session.memberRowId, note: req.body?.note });
      if (!g) return res.status(404).json({ error: 'That address is no longer shared. Refresh the list.' });
      await audit(req, 'Marked a shared email as checked', key, { people: g.people, kind: g.kind }, String(req.body?.note || '').trim().slice(0, 500));
      res.json({ ok: true });
    } catch (err) {
      failed(res, err, 'The mark could not be saved');
    }
  });

  app.post('/api/duplicate-emails/reopen', ...guard, async (req, res) => {
    const key = String(req.body?.key || '').trim();
    if (!key) return res.status(400).json({ error: 'Say which address to open again.' });
    try {
      if (!(await reopenEmailCheck(key, { byRowId: req.session.memberRowId }))) return res.status(404).json({ error: 'That address was not marked as checked.' });
      await audit(req, 'Opened a shared email again', key, null);
      res.json({ ok: true });
    } catch (err) {
      failed(res, err, 'The mark could not be changed');
    }
  });
}
