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
                   never from here */

import { personProfile, writeAudit } from '../store.js';
import { can, roleById } from '../db.js';

/** Enough of a number to recognise, not enough to use. */
const maskMobile = (m = '') => String(m).replace(/(\d{2})\d+(\d{2})$/, '$1••••••$2');
const maskEmail = (e = '') => (e ? e.replace(/^(.).*(@.*)$/, '$1•••$2') : '');

export default function mountPeople(app, { requireSession, requirePerm }) {
  app.get('/api/people/:id', requireSession, requirePerm('members.view'), async (req, res) => {
    const p = await personProfile(req.params.id);
    if (!p) return res.status(404).json({ error: 'No such member.' });

    const role = req.session.role;
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
    res.json(out);
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
    res.json({ mobile: p.member.mobile, email: p.member.email, address: p.member.address });
  });
}
