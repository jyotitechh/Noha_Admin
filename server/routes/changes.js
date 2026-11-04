/* Changes members ask for from the app (Me > My information), and new profile photos.

   A member cannot edit their own details. They ask, in Catalyst (`appChangeRequests`): which field, what it is now, what
   they want. The office decides here.

   TWO WAYS TO DECIDE, and which one is used:
     - The Noah API (when NOAH_ADMIN_API_KEY is set): GET /admin/profile-requests and POST .../decide. The API writes the
       value in the right format and SENDS THE MEMBER A PUSH. This is the way to use. See ADMIN_INTEGRATION.md.
     - The table (no key, or an API that does not have those calls yet): the console writes the member's column itself and
       marks the request. Nobody is told, and the screen says so. server/change-fields.js holds the map it uses.

   Same permission as editing a member (members.edit), and applying a change to a contact detail needs members.pii on top,
   as editing one does. The member's sign-in number is never applied: the API refuses it (change_by_hand) and so does this. */

import { loadChangeRequests, decideChangeRequest, clearCache } from '../noah-schema.js';
import { writeAudit, live, isNoah } from '../store.js';
import { can, roleById } from '../db.js';
import { explainCatalyst } from '../catalyst.js';
import { noahConfigured, decideProfileRequest, getFile, NoahApiError } from '../noah-api.js';
import { listViaApi } from '../profile-requests.js';

const needsCatalyst = (res) =>
  res.status(409).json({ error: 'Change requests need the Catalyst connection: they are filed by the Noah app.' });

/** An older Noah deployment has no such call: the gateway answers 404 with no code of its own. Then the table is used. */
const lacksCall = (err) => err instanceof NoahApiError && err.status === 404 && (!err.code || err.code === 'not_found');

/** What went wrong, said once for every path. */
function fail(res, err) {
  if (err instanceof NoahApiError) {
    const status = err.status === 404 ? 404 : err.status === 409 ? 409 : [400, 422].includes(err.status) ? 422 : 502;
    return res.status(status).json({ error: err.message, code: status === 422 ? 'invalid_value' : err.code });
  }
  const local = { not_found: 404, not_pending: 409, unknown_field: 409, blocked_field: 409, forbidden_field: 403, invalid_value: 422 }[err.code];
  if (local) return res.status(local).json({ error: err.message, code: err.code });
  const explained = explainCatalyst(err);
  return res.status(explained?.status ?? 502).json({
    error: explained?.message ?? `Catalyst refused the change: ${err.message}`,
    ...(explained ? { code: explained.code } : {}),
  });
}

/** A failure on the Noah side (its function crashed), as opposed to a refusal of ours or a missing call. */
const apiBroke = (err) => err instanceof NoahApiError && err.status >= 500;

/**
 * The requests, from the API when it has the call, else from the table.
 *   via         how a decision would be made: 'api' (the member is told) or 'table' (nobody is).
 *   listedFrom  where THIS list came from. Reading is harmless, so when the API's list fails on its side (it does for
 *               status=rejected on the live function: a 500 "Something went wrong"), that status is read from the table
 *               instead, and `apiProblem` says what the API answered. A refusal (a wrong key) is still an error.
 */
async function readRequests(status) {
  if (!noahConfigured()) return { rows: await loadChangeRequests({ status }), via: 'table', listedFrom: 'table' };

  const wanted = status ? [status] : ['pending', 'approved', 'rejected'];
  const rows = [];
  let problem = '';
  for (const s of wanted) {
    try {
      rows.push(...await listViaApi(s));
    } catch (err) {
      if (lacksCall(err)) return { rows: await loadChangeRequests({ status }), via: 'table', listedFrom: 'table' };
      if (!apiBroke(err)) throw err;
      problem = err.message;
      rows.push(...await loadChangeRequests({ status: s }));
    }
  }
  rows.sort((a, b) => (+(b.at ?? 0)) - (+(a.at ?? 0)));
  return { rows, via: 'api', listedFrom: problem ? 'table' : 'api', ...(problem ? { apiProblem: problem } : {}) };
}

export default function mountChanges(app, { requireSession, requirePerm }) {
  const guard = [requireSession, requirePerm('members.edit')];

  app.get('/api/change-requests', ...guard, async (req, res) => {
    if (!(live() && isNoah())) return res.json({ rows: [], total: 0, notInProject: true, message: 'Change requests need the Catalyst connection.' });
    try {
      const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : undefined;
      const { rows: all, via, listedFrom, apiProblem } = await readRequests(status);
      /* A contact detail's old and new value are shown only to someone who may see contact details. */
      const pii = can(req.session.role, 'members.pii');
      const rows = all.map((r) => (r.contact && !pii ? { ...r, oldValue: '••••••', newValue: '••••••', saves: null, problem: null, masked: true } : r));
      res.json({ rows, total: rows.length, via, listedFrom, ...(apiProblem ? { apiProblem } : {}) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/api/change-requests/:id/decide', ...guard, async (req, res) => {
    if (!(live() && isNoah())) return needsCatalyst(res);
    if (req.body?.approve !== true && req.body?.approve !== false) {
      return res.status(400).json({ error: 'Say whether to approve or reject.' });
    }
    const approve = req.body.approve === true;
    const note = String(req.body?.note ?? '').trim().slice(0, 1000);
    if (!approve && !note) return res.status(400).json({ error: 'Say why it is being turned down.' });

    const role = req.session.role;
    const record = (action, after) => writeAudit({
      actor: req.user.name, role: roleById(role).name, action,
      module: 'Membership', record: req.params.id, before: null, after, remark: '', ip: req.ip || '',
    });

    try {
      /* The API first. Only an API without the call falls through to the table, and a network failure does not: silently
         deciding by the table would skip the member's notification. */
      let waiting = null;
      if (noahConfigured()) {
        try { waiting = await listViaApi('pending'); } catch (err) { if (!lacksCall(err)) throw err; }
      }

      if (waiting) {
        const r = waiting.find((x) => x.id === String(req.params.id));
        if (!r) {
          const { rows: everything } = await readRequests();
          return everything.some((x) => x.id === String(req.params.id))
            ? res.status(409).json({ error: 'That request has already been decided.', code: 'not_pending' })
            : res.status(404).json({ error: 'No such request.', code: 'not_found' });
        }
        if (approve) {
          if (r.blocked) return res.status(409).json({ error: r.blocked, code: 'change_by_hand' });
          if (!r.known) return res.status(409).json({ error: `The console does not know which detail "${r.fieldId}" is, so it cannot apply this. Turn it down, or change the member's detail by hand.`, code: 'unknown_field' });
          if (r.contact && !can(role, 'members.pii')) return res.status(403).json({ error: 'Applying a change to contact details needs permission to see them.', code: 'forbidden_field' });
        }

        const result = await decideProfileRequest(r.id, { decision: approve ? 'approve' : 'reject', note: approve ? undefined : note, actor: req.user.name });
        clearCache();   /* the member's record may have just changed */
        await record(approve ? 'Approved a change asked for from the app' : 'Turned down a change asked for from the app',
          { status: approve ? 'approved' : 'rejected', applied: approve ? r.fieldLabel : 'nothing', note, via: 'noah-api' });
        return res.json({ ok: true, status: approve ? 'approved' : 'rejected', applied: approve ? [r.fieldLabel] : [], notified: result?.notified ?? null, via: 'api' });
      }

      /* The table: the same checks, and the member is not told. */
      const r = await decideChangeRequest({
        id: req.params.id, approve, note,
        byMemberRowId: req.session.memberRowId,
        canContact: can(role, 'members.pii'),
      });
      await record(approve ? 'Approved a change asked for from the app' : 'Turned down a change asked for from the app',
        { status: r.status, applied: r.applied.map((c) => c.label).join(', ') || 'nothing', note, via: 'table' });
      res.json({ ok: true, status: r.status, applied: r.applied.map((c) => c.label), notified: null, via: 'table' });
    } catch (err) {
      fail(res, err);
    }
  });

  /* A new profile photo is a file id. The office looks at it before approving, through here and not from a public address,
     so the permission check runs and the view is written to the audit log, as for a registration document. */
  app.get('/api/change-requests/:id/photo/:which', ...guard, async (req, res) => {
    const which = req.params.which;
    if (!['old', 'new'].includes(which)) return res.status(400).json({ error: 'which must be old or new.' });
    if (!noahConfigured()) {
      return res.status(409).json({ error: 'NOAH_ADMIN_API_KEY is not set, so photographs cannot be read. Set it on the API and try again.', needsAdminKey: true });
    }
    try {
      const { rows } = await readRequests();
      const r = rows.find((x) => x.id === String(req.params.id));
      if (!r) return res.status(404).json({ error: 'No such request.' });
      if (!r.photo) return res.status(400).json({ error: 'That request is not about a photograph.' });
      const fileId = String(which === 'old' ? r.oldValue : r.newValue || '').trim();
      if (!/^\d{6,}$/.test(fileId)) return res.status(404).json({ error: `There is no ${which} photograph on this request.` });

      await writeAudit({
        actor: req.user.name, role: roleById(req.session.role).name,
        action: 'Viewed a profile photograph asked for from the app', module: 'Membership', record: r.id,
        before: null, after: { which }, remark: '', ip: req.ip || '',
      });
      const { buffer, contentType } = await getFile(fileId, { actor: req.user.name });
      /* File Store answers every download as a generic byte stream; say what it is, or a browser may not show it. */
      res.setHeader('content-type', !contentType || /octet-stream/i.test(contentType) ? 'image/jpeg' : contentType);
      res.setHeader('cache-control', 'private, max-age=300');
      res.send(buffer);
    } catch (err) {
      res.status(502).json({ error: `The Noah API could not serve this photograph: ${err.message}` });
    }
  });
}
