/* The office's Children list, and sending the notices at 15 (server/children.js, FOR-CONSOLE-CHILDREN.md).

     GET  /api/children               every child: age, parents, registration, the notice at 15     members.view
     GET  /api/children?age=15        only those aged 15 or more
     GET  /api/children/:kidId/photo  the photo the parents gave                                    members.view
     POST /api/children/age-notices   tell the families who are due now (the Noah API tells each once)   members.edit

   Parents' numbers are masked here like everywhere else on a list. */

import { roleById } from '../db.js';
import { writeAudit, live, isNoah } from '../store.js';
import { loadChildren, kidPhotoFileId } from '../noah-schema.js';
import { noahConfigured, getFile } from '../noah-api.js';
import { listRequests } from '../family-requests.js';
import { sendAgeNotices } from '../children.js';
import { explainCatalyst } from '../catalyst.js';

const maskMobile = (m = '') => String(m).replace(/(\d{2})\d+(\d{2})$/, '$1••••••$2');

export default function mountChildren(app, { requireSession, requirePerm }) {
  app.get('/api/children', requireSession, requirePerm('members.view'), async (req, res) => {
    if (!(live() && isNoah())) return res.json({ rows: [] });
    try {
      let rows = await loadChildren();
      /* A "Make member" request waiting in Family requests (FOR-CONSOLE-CHILDREN.md): the child is not a member yet. */
      if (noahConfigured()) {
        const asked = new Set((await listRequests('Pending').catch(() => [])).filter((x) => x.kind === 'member' && x.kidId).map((x) => x.kidId));
        rows = rows.map((c) => (asked.has(c.kidId) && (c.state === 'none' || c.state === 'young') ? { ...c, state: 'requested' } : c));
      }
      if (String(req.query.age || '') === '15') rows = rows.filter((c) => c.fifteen);
      res.json({ rows: rows.map((c) => ({ ...c, parents: c.parents.map((p) => ({ ...p, mobile: maskMobile(p.mobile) })) })) });
    } catch (err) {
      const explained = explainCatalyst(err);
      res.status(explained?.status ?? 503).json({ error: explained?.message ?? `The children could not be read: ${err.message}` });
    }
  });

  /* The photo the parents gave when they added the child (kids.photoFileId), through the Noah API's file call. */
  app.get('/api/children/:kidId/photo', requireSession, requirePerm('members.view'), async (req, res) => {
    if (!noahConfigured()) return res.status(409).json({ error: 'The Noah API is not connected, so the photo cannot be read.' });
    try {
      const fileId = await kidPhotoFileId(req.params.kidId);
      if (!fileId) return res.status(404).json({ error: 'There is no photo of this child.' });
      const { buffer, contentType } = await getFile(fileId, { actor: req.user.name });
      res.setHeader('content-type', !contentType || /octet-stream/i.test(contentType) ? 'image/jpeg' : contentType);
      res.setHeader('cache-control', 'private, max-age=300');
      res.send(buffer);
    } catch (err) {
      res.status(502).json({ error: `The photo could not be read: ${err.message}` });
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
