/* Who may sign in to the console, and as what.

   A super administrator finds an approved member, gives them one of the
   console's roles, and from then on that member signs in with the mobile
   number they registered with and sees what the role allows.

   The rules that keep this from hurting anyone:

     - Only an APPROVED member can be given access. Someone still waiting on
       registration is not yet part of the church, let alone its back office.
     - Nobody changes their own access. It is how a mistake locks the only
       super administrator out, and how a role becomes a bigger one.
     - The office's own super-admin flag (users.is_super_admin) is read, never
       written. It is the office's, and the Noah app reads it too.
     - There is always at least one super administrator left.
     - Test accounts are fixed. They are not rows to edit.

   Against Catalyst the assignments are rows in the console-staff table. Until
   the Catalyst developer sets that up there is nowhere to put them, and this
   says so plainly rather than pretending: see docs/CONSOLE-ACCESS.md. */

import { db, find, roleById, audit } from '../db.js';
import { live, isNoah, listMembers, writeAudit } from '../store.js';
import { refreshSessions } from '../auth.js';
import {
  loadStaffDirectory, staffCandidates, grantConsoleAccess, updateConsoleStaff, consoleStaffEnabled,
} from '../noah-schema.js';

const roleIds = () => db.ROLES.map((r) => r.id);

const NEEDS_TABLE =
  'Giving console roles needs a small table in Catalyst, and it has not been set up yet. ' +
  'Ask the Catalyst developer to create it (docs/CONSOLE-ACCESS.md has the columns), ' +
  'then set CATALYST_TABLE_CONSOLE_STAFF to its id.';

export default function mountStaff(app, { requireSession, requirePerm }) {
  const guard = [requireSession, requirePerm('staff.manage')];
  const onCatalyst = () => live() && isNoah();

  const record = (req, action, who, before, after, remark = '') =>
    writeAudit({
      actor: req.user.name, role: roleById(req.session.role).name,
      action, module: 'Staff and permissions', record: who,
      before, after, remark, ip: req.ip || '',
    });

  /* ---------- who could be given access ---------- */

  app.get('/api/staff/candidates', ...guard, async (req, res) => {
    if (!onCatalyst()) return res.json({ rows: [], needsCatalyst: true });
    res.json({
      rows: await staffCandidates(roleIds(), req.query.q),
      tableReady: consoleStaffEnabled(),
    });
  });

  /* ---------- give a member a role ---------- */

  app.post('/api/staff/grant', ...guard, async (req, res) => {
    if (!onCatalyst()) {
      return res.status(409).json({ error: 'Giving access to a member needs the Catalyst connection. The sample staff cannot be changed this way.' });
    }
    const { memberRowId, role } = req.body || {};
    const title = String(req.body?.title || '').trim().slice(0, 100);

    if (!roleIds().includes(role)) return res.status(400).json({ error: 'Pick one of the console roles.' });
    /* Only a super administrator can make another one. */
    if (role === 'super' && req.session.role !== 'super') {
      return res.status(403).json({ error: 'Only a super administrator can give that role.' });
    }
    if (!consoleStaffEnabled()) return res.status(409).json({ error: NEEDS_TABLE, needsTable: true });

    const member = (await listMembers({})).find((m) => String(m.rowId) === String(memberRowId));
    if (!member) return res.status(404).json({ error: 'No such member.' });
    if (!member.approved) {
      return res.status(409).json({ error: 'That member has not been approved yet. Approve their registration first.' });
    }
    if (member.blocked) return res.status(409).json({ error: 'That member is archived or blocked.' });
    if (String(member.rowId) === String(req.session.memberRowId)) {
      return res.status(409).json({ error: 'You cannot change your own access.' });
    }

    const existing = (await loadStaffDirectory(roleIds())).find((s) => s.memberRowId === String(member.rowId));
    if (existing?.source === 'catalyst-flag') {
      return res.status(409).json({ error: 'The office already made them a super administrator in Catalyst.' });
    }
    if (existing && existing.status !== 'Revoked') {
      return res.status(409).json({ error: `They already have access as ${roleById(existing.role).name}. Change their role instead.` });
    }

    try {
      const id = await grantConsoleAccess({
        memberRowId: member.rowId, role, by: req.user.name,
        title: title || roleById(role).name,
      });
      await record(req, `Gave console access: ${roleById(role).name}`, member.name,
        existing ? { status: existing.status, role: existing.role } : null, { role, mobile: member.mobile });
      res.status(201).json({ ok: true, id, name: member.name, mobile: member.mobile, role });
    } catch (err) {
      res.status(502).json({ error: `Catalyst refused the change: ${err.message}` });
    }
  });

  /* ---------- change or take away access ---------- */

  /** Find the row a request is about, and refuse the ones that cannot be edited. */
  async function target(req, res) {
    const id = String(req.params.id);
    if (id.startsWith('TEST-')) {
      res.status(409).json({ error: 'Test accounts are fixed. They are switched on and off with ENABLE_TEST_LOGIN.' });
      return null;
    }
    if (!onCatalyst()) {
      res.status(409).json({ error: 'Only staff stored in Catalyst can be changed this way.' });
      return null;
    }
    const staff = (await loadStaffDirectory(roleIds())).find((s) => s.id === id);
    if (!staff) { res.status(404).json({ error: 'No such staff account.' }); return null; }
    if (staff.source !== 'catalyst') {
      res.status(409).json({ error: 'The office set this one in Catalyst (is_super_admin), so it cannot be changed here.' });
      return null;
    }
    if (staff.id === req.session.staffId) {
      res.status(409).json({ error: 'You cannot change your own access.' });
      return null;
    }
    if (!consoleStaffEnabled()) { res.status(409).json({ error: NEEDS_TABLE, needsTable: true }); return null; }
    return staff;
  }

  /** Would this leave nobody able to manage staff? Test accounts do not count. */
  async function wouldLeaveNoSuper(staff) {
    if (staff.role !== 'super' || staff.status !== 'Active') return false;
    const others = (await loadStaffDirectory(roleIds()))
      .filter((s) => s.id !== staff.id && s.role === 'super' && s.status === 'Active');
    return others.length === 0;
  }

  app.post('/api/staff/:id/role', ...guard, async (req, res) => {
    const role = req.body?.role;
    if (!roleIds().includes(role)) return res.status(400).json({ error: 'Pick one of the console roles.' });
    if (role === 'super' && req.session.role !== 'super') {
      return res.status(403).json({ error: 'Only a super administrator can give that role.' });
    }
    const staff = await target(req, res);
    if (!staff) return;
    if (role !== 'super' && await wouldLeaveNoSuper(staff)) {
      return res.status(409).json({ error: 'That would leave no super administrator.' });
    }
    try {
      await updateConsoleStaff(staff.rowId, { role, ...(req.body?.title ? { title: String(req.body.title).slice(0, 100) } : {}) });
      await record(req, `Changed console role: ${roleById(staff.role).name} to ${roleById(role).name}`, staff.name, { role: staff.role }, { role });
      /* If they are signed in right now, their role changes with it. */
      refreshSessions(staff.id, { role });
      res.json({ ok: true, id: staff.id, role });
    } catch (err) {
      res.status(502).json({ error: `Catalyst refused the change: ${err.message}` });
    }
  });

  app.post('/api/staff/:id/status', ...guard, async (req, res) => {
    /* The sample people: the prototype's own behaviour, unchanged. */
    if (!onCatalyst() && !String(req.params.id).startsWith('TEST-')) {
      const s = find('STAFF', req.params.id);
      if (!s) return res.status(404).json({ error: 'Not found.' });
      const before = { status: s.status };
      s.status = req.body?.to || 'Suspended';
      audit(req.user.name, roleById(req.session.role).name, 'Changed staff account status', 'Staff and permissions', s.name, before, { status: s.status }, req.body?.remark || '');
      return res.json({ ok: true, staff: s });
    }

    const to = req.body?.to;
    if (!['Active', 'Suspended'].includes(to)) return res.status(400).json({ error: 'Choose Active or Suspended.' });
    const staff = await target(req, res);
    if (!staff) return;
    if (to === 'Suspended' && await wouldLeaveNoSuper(staff)) {
      return res.status(409).json({ error: 'That would leave no super administrator.' });
    }
    try {
      await updateConsoleStaff(staff.rowId, { status: to });
      await record(req, to === 'Active' ? 'Re-enabled console access' : 'Suspended console access', staff.name,
        { status: staff.status }, { status: to }, req.body?.remark || '');
      /* Suspending ends their session now; it must not wait for it to expire. */
      if (to === 'Suspended') refreshSessions(staff.id);
      res.json({ ok: true, id: staff.id, status: to });
    } catch (err) {
      res.status(502).json({ error: `Catalyst refused the change: ${err.message}` });
    }
  });

  /* Revoking keeps the row, marked Revoked, rather than deleting it: who had
     access, and who took it away, is worth being able to read later. */
  app.post('/api/staff/:id/revoke', ...guard, async (req, res) => {
    const staff = await target(req, res);
    if (!staff) return;
    if (await wouldLeaveNoSuper(staff)) {
      return res.status(409).json({ error: 'That would leave no super administrator.' });
    }
    try {
      await updateConsoleStaff(staff.rowId, { status: 'Revoked' });
      await record(req, 'Revoked console access', staff.name, { status: staff.status, role: staff.role }, { status: 'Revoked' }, req.body?.remark || '');
      refreshSessions(staff.id);
      res.json({ ok: true, id: staff.id, status: 'Revoked' });
    } catch (err) {
      res.status(502).json({ error: `Catalyst refused the change: ${err.message}` });
    }
  });
}
