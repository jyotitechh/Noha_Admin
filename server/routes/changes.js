/* Changes members ask for from the app.

   A member who wants a detail changed after approval files a request in Catalyst
   (`appChangeRequests`): which field, what it is now, what they want. The office
   decides here. Approving writes the new value to the member, the same column an
   edit from the console writes, and marks the request; rejecting only marks it.

   Same permission as editing a member (members.edit), and applying a change to a
   contact detail needs members.pii on top, as editing one does. */

import { loadChangeRequests, decideChangeRequest } from '../noah-schema.js';
import { writeAudit, live, isNoah } from '../store.js';
import { can, roleById } from '../db.js';
import { explainCatalyst } from '../catalyst.js';

const needsCatalyst = (res) =>
  res.status(409).json({ error: 'Change requests need the Catalyst connection: they are filed by the Noah app.' });

export default function mountChanges(app, { requireSession, requirePerm }) {
  app.get('/api/change-requests', requireSession, requirePerm('members.edit'), async (req, res) => {
    if (!(live() && isNoah())) return res.json({ rows: [], total: 0, notInProject: true, message: 'Change requests need the Catalyst connection.' });
    try {
      const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : undefined;
      const all = await loadChangeRequests({ status });
      /* A contact detail's old and new value are shown only to someone who may
         see contact details. */
      const pii = can(req.session.role, 'members.pii');
      const rows = all.map((r) => (r.contact && !pii ? { ...r, oldValue: '••••••', newValue: '••••••', masked: true } : r));
      res.json({ rows, total: rows.length });
    } catch (err) {
      const explained = explainCatalyst(err);
      res.status(explained?.status ?? 502).json({ error: explained?.message ?? err.message, ...(explained ? { code: explained.code } : {}) });
    }
  });

  app.post('/api/change-requests/:id/decide', requireSession, requirePerm('members.edit'), async (req, res) => {
    if (!(live() && isNoah())) return needsCatalyst(res);
    const approve = req.body?.approve === true;
    const note = String(req.body?.note ?? '').trim().slice(0, 1000);
    if (req.body?.approve !== true && req.body?.approve !== false) {
      return res.status(400).json({ error: 'Say whether to approve or reject.' });
    }
    if (!approve && !note) return res.status(400).json({ error: 'Say why it is being turned down.' });

    try {
      const role = req.session.role;
      const r = await decideChangeRequest({
        id: req.params.id, approve, note,
        byMemberRowId: req.session.memberRowId,
        canContact: can(role, 'members.pii'),
      });
      await writeAudit({
        actor: req.user.name, role: roleById(role).name,
        action: approve ? 'Approved a change asked for from the app' : 'Turned down a change asked for from the app',
        module: 'Membership', record: req.params.id,
        before: null,
        after: { status: r.status, applied: r.applied.map((c) => c.label).join(', ') || 'nothing', note },
        remark: '', ip: req.ip || '',
      });
      res.json({ ok: true, status: r.status, applied: r.applied.map((c) => c.label) });
    } catch (err) {
      const status = { not_found: 404, not_pending: 409, unknown_field: 409, forbidden_field: 403, invalid_value: 422 }[err.code];
      if (status) return res.status(status).json({ error: err.message, code: err.code });
      const explained = explainCatalyst(err);
      res.status(explained?.status ?? 502).json({
        error: explained?.message ?? `Catalyst refused the change: ${err.message}`,
        ...(explained ? { code: explained.code } : {}),
      });
    }
  });
}
