/* The family requests inbox.

   Members ask from the app (Me > Family) to add a relative. The office checks and decides here, and the Noah API does
   the rest: it links both accounts, or adds a child under 18, and tells both people. Nothing is written to the tables
   from this side, so there is nothing here that could link two people without telling them.

   Who may: members.edit, the same as registrations. The numbers in the replies are masked (server/family-requests.js). */

import { roleById } from '../db.js';
import { writeAudit, listMembers } from '../store.js';
import { noahConfigured, decideFamilyRequest, NoahApiError } from '../noah-api.js';
import { listRequests, forgetFamilyRequests, STATES } from '../family-requests.js';
import { clearCache } from '../noah-schema.js';

const NEEDS_KEY = 'NOAH_ADMIN_API_KEY is not set on the API, so family requests cannot be read or decided. Set it and try again.';

/** A Noah refusal keeps its meaning; anything else is the API being unreachable, not this server falling over. */
function fail(res, err) {
  if (err instanceof NoahApiError) {
    return res.status([404, 409].includes(err.status) ? err.status : 502).json({ error: err.message, code: err.code });
  }
  return res.status(502).json({ error: `The Noah API could not be reached: ${err.message}` });
}

export default function mountFamily(app, { requireSession, requirePerm }) {
  const guard = [requireSession, requirePerm('members.edit')];

  app.get('/api/family-requests', ...guard, async (req, res) => {
    if (!noahConfigured()) return res.json({ rows: [], needsAdminKey: true });
    const state = STATES.includes(req.query.state) ? req.query.state : 'Pending';
    try {
      res.json({ rows: await listRequests(state), state });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/api/family-requests/:id/decide', ...guard, async (req, res) => {
    const decision = req.body?.decision;
    if (!['Approved', 'Rejected'].includes(decision)) return res.status(400).json({ error: 'Decide Approved or Rejected.' });
    const remark = String(req.body?.remark || '').trim().slice(0, 500);
    if (decision === 'Rejected' && !remark) return res.status(400).json({ error: 'Say why it is being rejected. The member sees this.' });
    if (!noahConfigured()) return res.status(409).json({ error: NEEDS_KEY, needsAdminKey: true });

    try {
      /* Read it fresh: the list on screen may be old, and what is checked below depends on what the request is. */
      const waiting = (await listRequests('Pending')).find((r) => r.id === String(req.params.id));
      if (!waiting) {
        forgetFamilyRequests();
        return res.status(409).json({ error: 'That request is no longer waiting. Someone may have decided it already. Refresh the list.', code: 'not_pending' });
      }

      /* Picking a member by hand is for a grown-up whose typed number is not the one they joined with. */
      const memberId = req.body?.memberId ? String(req.body.memberId) : '';
      if (memberId) {
        if (decision !== 'Approved') return res.status(400).json({ error: 'A member can only be picked when approving.' });
        if (waiting.kid) return res.status(400).json({ error: 'A child under 18 has no account to link.' });
        if (memberId === waiting.requesterId) return res.status(400).json({ error: 'That is the member who asked. Pick the relative.' });
        const known = (await listMembers({})).some((m) => String(m.rowId) === memberId);
        if (!known) return res.status(400).json({ error: 'That member is not on the register.' });
      }

      const result = await decideFamilyRequest(waiting.id, { decision, remark, memberId, actor: req.user.name });
      clearCache();           /* the family section of both people has just changed */
      forgetFamilyRequests();

      await writeAudit({
        actor: req.user.name, role: roleById(req.session.role).name,
        action: decision === 'Approved' ? 'Approved a family request' : 'Rejected a family request',
        module: 'Membership', record: waiting.id,
        before: { state: 'Pending' },
        after: {
          state: decision, relation: waiting.relationLabel, name: waiting.name, requester: waiting.requesterName,
          ...(memberId ? { linkedTo: memberId } : {}),
        },
        remark, ip: req.ip || '',
      });

      res.json({ ok: true, request: { ...waiting, state: decision, decidedBy: req.user.name, remark }, result });
    } catch (err) {
      fail(res, err);
    }
  });
}
