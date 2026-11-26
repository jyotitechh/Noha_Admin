/* The office's Children list, and sending the notices at 15 (server/children.js, FOR-CONSOLE-CHILDREN.md).

     GET  /api/children               every child: age, parents, registration, the notice at 15     members.view
     GET  /api/children?age=15        only those aged 15 or more
     GET  /api/children/:kidId        one child's own record: details, parents, Make member, consent    members.view
     PATCH /api/children/:kidId       { changes: { firstName, ..., aadhaarNo } }: correct the child's details   members.edit
     GET  /api/children/:kidId/photo  the photo the parents gave                                    members.view
     GET  /api/children/:kidId/aadhaar  the Aadhaar picture the parents gave (audited)              members.pii
     POST /api/children/age-notices   tell the families who are due now (the Noah API tells each once)   members.edit

   Parents' numbers are masked here like everywhere else on a list. */

import { can, roleById } from '../db.js';
import { writeAudit, live, isNoah } from '../store.js';
import { loadChildren, loadChild, kidPhotoFileId, kidAadhaarFileId, updateKidFields, updateMemberFields } from '../noah-schema.js';
import { checkKidPatch, SHARED_WITH_MEMBER } from '../child-fields.js';
import { checkPatch } from '../member-fields.js';
import { noahConfigured, getFile } from '../noah-api.js';
import { listRequests, STATES } from '../family-requests.js';
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

  /* One child's own record: the child page opens this, not a parent's. The Aadhaar number is in full only for staff who may
     see contact details, and so are the parents' numbers. */
  /* One child's record as the screen shows it, or null: the numbers masked for a role that may not see contact details. */
  async function describe(role, kidId) {
    const c = await loadChild(kidId);
    if (!c) return null;
    const pii = can(role, 'members.pii');
    /* Make member: what the parents asked, newest first (the office decides it in New Child Requests). */
    let asked = [];
    if (noahConfigured()) {
      const all = await Promise.all(STATES.map((st) => listRequests(st).catch(() => [])));
      asked = all.flat().filter((r) => r.kind === 'member' && r.kidId === c.kidId)
        .sort((a, b) => (+b.at || 0) - (+a.at || 0))
        .map((r) => ({ id: r.id, state: r.state, at: r.at, mobile: pii ? r.childMobile : maskMobile(r.childMobile), remark: r.remark, requesterName: r.requesterName }));
    }
    if (asked[0]?.state === 'Pending' && (c.state === 'none' || c.state === 'young')) c.state = 'requested';
    return {
      ...c,
      aadhaarNo: pii ? c.aadhaarNo : (c.aadhaarNo ? '•••• •••• ' + c.aadhaarNo.slice(-4) : ''),
      aadhaarPicture: c.aadhaarPicture && pii,
      parents: c.parents.map((p) => ({ ...p, mobile: pii ? p.mobile : maskMobile(p.mobile) })),
      makeMember: asked,
      masked: !pii,
    };
  }

  app.get('/api/children/:kidId', requireSession, requirePerm('members.view'), async (req, res) => {
    if (!(live() && isNoah())) return res.status(404).json({ error: 'No such child.' });
    try {
      const child = await describe(req.session.role, req.params.kidId);
      if (!child) return res.status(404).json({ error: 'No such child. They may have been removed from the family.' });
      res.json(child);
    } catch (err) {
      const explained = explainCatalyst(err);
      res.status(explained?.status ?? 503).json({ error: explained?.message ?? `The child could not be read: ${err.message}` });
    }
  });

  /* The office corrects a child's details: name, gender, date of birth, blood group and, for staff who may see contact details,
     the Aadhaar number. Only what is sent changes. A child who is a member has their own member record: their name, gender and
     date of birth are kept the same there. The audit log says what changed, and for the Aadhaar not to what. */
  app.patch('/api/children/:kidId', requireSession, requirePerm('members.edit'), async (req, res) => {
    if (!(live() && isNoah())) return res.status(409).json({ error: 'Editing a child needs the Catalyst connection. The sample data cannot be saved.' });
    const role = req.session.role;
    const canContact = can(role, 'members.pii');
    const changes = req.body?.changes;
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length) return res.status(400).json({ error: 'Nothing to save.' });
    const { values, errors } = checkKidPatch(changes, { canContact });
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Some details cannot be saved.', errors });

    try {
      const was = await loadChild(req.params.kidId);
      if (!was) return res.status(404).json({ error: 'No such child. They may have been removed from the family.' });
      const { changed } = await updateKidFields(req.params.kidId, values, { byRowId: req.session.memberRowId });

      /* Their member record, when they have one: the same name, gender and date of birth (already checked above). */
      let alsoMember = false;
      if (was.memberRowId) {
        const shared = Object.fromEntries(Object.entries(changes).filter(([k]) => SHARED_WITH_MEMBER.includes(k)));
        const { values: memberValues } = checkPatch(shared, { canContact });
        if (Object.keys(memberValues).length) alsoMember = (await updateMemberFields(was.memberRowId, memberValues)).changed.length > 0;
      }

      if (changed.length || alsoMember) {
        const show = (c, side) => (c.contact ? '(contact detail)' : c[side] || '(empty)');
        await writeAudit({
          actor: req.user.name, role: roleById(role).name,
          action: "Edited a child's details", module: 'Membership', record: String(req.params.kidId),
          before: Object.fromEntries(changed.map((c) => [c.label, show(c, 'before')])),
          after: { ...Object.fromEntries(changed.map((c) => [c.label, show(c, 'after')])), ...(alsoMember ? { 'Also changed on their member record': 'yes' } : {}) },
          remark: '', ip: req.ip || '',
        }).catch(() => {});
      }
      res.json({ ok: true, changed: changed.map((c) => c.label), alsoMember, child: await describe(role, req.params.kidId) });
    } catch (err) {
      if (err.code === 'not_found') return res.status(404).json({ error: 'No such child.' });
      const explained = explainCatalyst(err);
      res.status(explained?.status ?? 502).json({
        error: explained?.message ?? `Catalyst refused the change: ${err.message}`,
        ...(explained ? { code: explained.code } : {}),
      });
    }
  });

  /* The Aadhaar picture the parents gave (kids.aadhaarFileId): only for staff who may see contact details, and written to the
     audit log, like the one on a Make member request. */
  app.get('/api/children/:kidId/aadhaar', requireSession, requirePerm('members.pii'), async (req, res) => {
    if (!noahConfigured()) return res.status(409).json({ error: 'The Noah API is not connected, so the picture cannot be read.' });
    try {
      const fileId = await kidAadhaarFileId(req.params.kidId);
      if (!fileId) return res.status(404).json({ error: 'There is no Aadhaar picture for this child.' });
      await writeAudit({
        actor: req.user.name, role: roleById(req.session.role).name,
        action: "Viewed a child's Aadhaar", module: 'Membership', record: String(req.params.kidId),
        before: null, after: null, remark: '', ip: req.ip || '',
      }).catch(() => {});
      const { buffer, contentType } = await getFile(fileId, { actor: req.user.name });
      res.setHeader('content-type', !contentType || /octet-stream/i.test(contentType) ? 'image/jpeg' : contentType);
      res.setHeader('cache-control', 'private, max-age=300');
      res.send(buffer);
    } catch (err) {
      res.status(502).json({ error: `The picture could not be read: ${err.message}` });
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
