/* One person, everything about them.

   This is the page behind "Approved and history" and the member register: who
   they are, the registration they made with its photograph, ID and video, who
   their pastor and cell leader are, partnership, family and groups.

   It replaces five separate screens (Video checks, Families, Groups, Pastoral
   hierarchy, Partnership) that each showed one slice of a person. The office
   works from the person, not from the slice.

   What a role sees follows what it already may do elsewhere:

     members.view  the person, with phone, email and address MASKED
     members.pii   may reveal them, one click, and every reveal is audited
     members.edit  also the registration: ID number, declaration, and the three
                   uploads, which are fetched through the audited file route and
                   never from here; and may CORRECT the person's details, which
                   are written to the same columns the Noah app reads

   Changing contact details (email, addresses) needs members.pii as well:
   nobody edits what they may not read. */

import { personProfile, writeAudit, live, isNoah } from '../store.js';
import { updateMemberFields, pastoralChoices, setPastoral } from '../noah-schema.js';
import { MEMBER_FIELDS, checkPatch } from '../member-fields.js';
import { can, roleById } from '../db.js';
import { explainCatalyst } from '../catalyst.js';

/** Enough of a number to recognise, not enough to use. */
const maskMobile = (m = '') => String(m).replace(/(\d{2})\d+(\d{2})$/, '$1••••••$2');
const maskEmail = (e = '') => (e ? e.replace(/^(.).*(@.*)$/, '$1•••$2') : '');

/** The person as a given role may see them: contact masked, registration hidden
    without members.edit, and the edit form only for those who may edit. */
function shape(p, role) {
  const out = { ...p };

  /* Masked for everyone until revealed on purpose. Revealing is audited, so
     seeing a number is never a side effect of opening a page. */
  out.member = {
    ...p.member,
    mobile: maskMobile(p.member.mobile),
    email: maskEmail(p.member.email),
    address: p.member.address ? '••••••' : '',
    masked: true,
  };
  out.pastoral = {
    ...p.pastoral,
    pastor: p.pastoral.pastor && { ...p.pastoral.pastor, mobile: '' },
    cellLeader: p.pastoral.cellLeader && { ...p.pastoral.cellLeader, mobile: '' },
  };

  /* The registration carries the ID number and leads to the uploads. */
  if (!can(role, 'members.edit')) {
    out.registration = null;
    out.earlier = [];
    out.registrationHidden = !!p.registration;
  }

  /* The edit form. Contact fields are never in this reply, even to someone who
     may change them: their values come from the audited reveal. */
  if (p.editable && can(role, 'members.edit') && live() && isNoah()) {
    const canContact = can(role, 'members.pii');
    out.edit = {
      fields: MEMBER_FIELDS.map(({ key, label, group, kind, max, required, contact }) =>
        ({ key, label, group, kind, max, required: !!required, contact: !!contact, locked: !!contact && !canContact })),
      values: Object.fromEntries(MEMBER_FIELDS.filter((f) => !f.contact).map((f) => [f.key, p.editable[f.key]])),
    };
  }
  delete out.editable;
  return out;
}

/** The person, plus who the office may pick as their pastor and cell leader (editors only). */
async function withChoices(p, role) {
  const out = shape(p, role);
  if (live() && isNoah() && can(role, 'members.edit')) out.pastoralChoices = await pastoralChoices();
  return out;
}

export default function mountPeople(app, { requireSession, requirePerm }) {
  app.get('/api/people/:id', requireSession, requirePerm('members.view'), async (req, res) => {
    const p = await personProfile(req.params.id);
    if (!p) return res.status(404).json({ error: 'No such member.' });
    res.json(await withChoices(p, req.session.role));
  });

  /* Assign a member's pastor and / or cell leader. Written to the columns the Noah app
     reads (membersExtra.connectedPastor / connectedLeader), so the member's Messages and
     Me tab change within about 20 seconds. Send only what changes; null clears one. */
  app.patch('/api/people/:id/pastoral', requireSession, requirePerm('members.edit'), async (req, res) => {
    if (!(live() && isNoah())) {
      return res.status(409).json({ error: 'Assigning a pastor needs the Catalyst connection. The sample data cannot be saved.' });
    }
    const body = req.body || {};
    const change = {};
    if ('pastor' in body) change.pastor = body.pastor;
    if ('leader' in body) change.leader = body.leader;
    if (!Object.keys(change).length) return res.status(400).json({ error: 'Nothing to save.' });

    try {
      const before = await personProfile(req.params.id);
      if (!before) return res.status(404).json({ error: 'No such member.' });
      const { changed } = await setPastoral(req.params.id, change);
      const after = await personProfile(req.params.id);
      const name = (l) => l?.name || '(none)';
      if (changed.length) {
        await writeAudit({
          actor: req.user.name, role: roleById(req.session.role).name,
          action: 'Changed pastoral care', module: 'Membership', record: before.member.id,
          before: { Pastor: name(before.pastoral.pastor), 'Cell leader': name(before.pastoral.cellLeader) },
          after: { Pastor: name(after.pastoral.pastor), 'Cell leader': name(after.pastoral.cellLeader) },
          remark: '', ip: req.ip || '',
        });
      }
      res.json({ ok: true, changed, person: await withChoices(after, req.session.role) });
    } catch (err) {
      if (['not_a_pastor', 'not_a_leader', 'self'].includes(err.code)) return res.status(400).json({ error: err.message, code: err.code });
      if (err.code === 'not_found') return res.status(404).json({ error: 'No such member.' });
      const explained = explainCatalyst(err);
      res.status(explained?.status ?? 502).json({
        error: explained?.message ?? `Catalyst refused the change: ${err.message}`,
        ...(explained ? { code: explained.code } : {}),
      });
    }
  });

  /* Reveal the contact details. Written to the audit log every time. */
  app.get('/api/people/:id/contact', requireSession, requirePerm('members.pii'), async (req, res) => {
    const p = await personProfile(req.params.id);
    if (!p) return res.status(404).json({ error: 'No such member.' });

    await writeAudit({
      actor: req.user.name, role: roleById(req.session.role).name,
      action: 'Revealed contact details', module: 'Membership', record: p.member.id,
      before: null, after: { fields: 'Mobile, email, address' }, remark: '', ip: req.ip || '',
    });
    res.json({
      mobile: p.member.mobile, email: p.member.email, address: p.member.address,
      /* For the edit form: every contact field's stored value. Only to someone
         who may edit; the reveal above is what was audited. */
      values: p.editable && can(req.session.role, 'members.edit')
        ? Object.fromEntries(MEMBER_FIELDS.filter((f) => f.contact).map((f) => [f.key, p.editable[f.key]]))
        : undefined,
    });
  });

  /* Correct a member's details. Written to Catalyst, so the Noah app shows the
     corrected value. Only what changed is sent. */
  app.patch('/api/people/:id', requireSession, requirePerm('members.edit'), async (req, res) => {
    if (!(live() && isNoah())) {
      return res.status(409).json({ error: 'Editing a member needs the Catalyst connection. The sample data cannot be saved.' });
    }
    const role = req.session.role;
    const { values, errors } = checkPatch(req.body?.changes, { canContact: can(role, 'members.pii') });
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Some details cannot be saved.', errors });
    if (!Object.keys(values).length) return res.status(400).json({ error: 'Nothing to save.' });

    try {
      const { changed } = await updateMemberFields(req.params.id, values);
      if (!changed.length) return res.json({ ok: true, changed: [], person: shape(await personProfile(req.params.id), role) });

      /* The audit says WHAT changed. For contact details it does not say to
         what: the log is read by more people than may see an address. */
      const show = (c, side) => (c.contact ? '(contact detail)' : c[side] || '(empty)');
      await writeAudit({
        actor: req.user.name, role: roleById(role).name,
        action: 'Edited member details', module: 'Membership', record: req.params.id,
        before: Object.fromEntries(changed.map((c) => [c.label, show(c, 'before')])),
        after: Object.fromEntries(changed.map((c) => [c.label, show(c, 'after')])),
        remark: '', ip: req.ip || '',
      });

      res.json({ ok: true, changed: changed.map((c) => c.label), person: shape(await personProfile(req.params.id), role) });
    } catch (err) {
      if (err.code === 'not_found') return res.status(404).json({ error: 'No such member.' });
      const explained = explainCatalyst(err);
      res.status(explained?.status ?? 502).json({
        error: explained?.message ?? `Catalyst refused the change: ${err.message}`,
        ...(explained ? { code: explained.code } : {}),
      });
    }
  });
}
