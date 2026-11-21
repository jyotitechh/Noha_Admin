/* The office's Children list, and sending the notices at 15 (server/children.js).

     GET  /api/children               every child: age, parents, registration, the notice at 15     members.view
     GET  /api/children?age=15        only those aged 15 or more
     POST /api/children/age-notices   tell the families who are due now (the Noah API tells each once)   members.edit

   Parents' numbers are masked here like everywhere else on a list. */

import { roleById } from '../db.js';
import { writeAudit, live, isNoah } from '../store.js';
import { loadChildren } from '../noah-schema.js';
import { sendAgeNotices } from '../children.js';
import { explainCatalyst } from '../catalyst.js';

const maskMobile = (m = '') => String(m).replace(/(\d{2})\d+(\d{2})$/, '$1••••••$2');

export default function mountChildren(app, { requireSession, requirePerm }) {
  app.get('/api/children', requireSession, requirePerm('members.view'), async (req, res) => {
    if (!(live() && isNoah())) return res.json({ rows: [] });
    try {
      let rows = await loadChildren();
      if (String(req.query.age || '') === '15') rows = rows.filter((c) => c.fifteen);
      res.json({ rows: rows.map((c) => ({ ...c, parents: c.parents.map((p) => ({ ...p, mobile: maskMobile(p.mobile) })) })) });
    } catch (err) {
      const explained = explainCatalyst(err);
      res.status(explained?.status ?? 503).json({ error: explained?.message ?? `The children could not be read: ${err.message}` });
    }
  });

  app.post('/api/children/age-notices', requireSession, requirePerm('members.edit'), async (req, res) => {
    const out = await sendAgeNotices({ actor: req.user.name });
    if (out.error) return res.status(out.code === 'busy' ? 409 : 502).json({ error: out.error, code: out.code });
    await writeAudit({
      actor: req.user.name, role: roleById(req.session.role).name,
      action: 'Sent the notices to families of children aged 15', module: 'Membership', record: `${out.sent} told`,
      before: null, after: out, remark: '', ip: req.ip || '',
    }).catch(() => {});
    res.json(out);
  });
}
