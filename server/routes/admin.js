/* Admin actions: everything the console writes.

   Each route checks its permission, changes the store, and records an audit
   entry, so the audit log is a true record of what was done in the console.
   Decisions here are what the mobile app sees through /api/app/*. */

import { db, audit, roleById as staffRole, find } from '../db.js';
import { now, ri, sum, pct } from '../seed/helpers.js';
import { live, registrationById, createMember, patchRegistration, writeAudit, listRegistrations, listMembers, approveRegistration, returnVideo, rejectRegistration } from '../store.js';
import { downloadFile, fileScopeMissing } from '../catalyst.js';
import * as noah from '../noah-api.js';
import { noahConfigured, findFileId } from '../noah-api.js';
import { MEMBER_ROLES, MEMBER_RESTRICTIONS, patchForRole, patchForRestriction, appRoleSummary, roleById as memberRole, restrictionById } from '../roles.js';
import { patchMemberRoles, allMemberRoles, activateMemberOnly, canEnterApp, clearCache } from '../noah-schema.js';

/** Catalyst wants 'YYYY-MM-DD HH:MM:SS'. */
const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/** Audit with the signed-in staff member as the actor. */
const log = (req, ...rest) => audit(req.user.name, staffRole(req.session.role).name, ...rest);

const notFound = (res) => res.status(404).json({ error: 'Not found.' });

/** Why a registration cannot be decided right now, in the office's words. */
const notPendingMessage = (state) => ({
  draft: 'That person has not finished registering yet, so there is nothing to decide.',
  approved: 'That registration is already approved.',
  rejected: 'That registration was already rejected.',
  videoReturned: 'That registration is waiting for the member to record the video again.',
}[state] || 'That registration is not waiting for a decision.');

export default function mountAdmin(app, { requireSession, requirePerm }) {
  const guard = (perm) => [requireSession, requirePerm(perm)];

  /* ================= dashboard ================= */

  app.get('/api/dashboard', requireSession, async (req, res) => {
    const role = req.session.role;
    /* staffRole is the console-role lookup. `memberRole` in this file is the
       app-role lookup from roles.js, which knows nothing about 'super'
       and returns undefined — reading .perms off it crashed the dashboard. */
    const held = (p) => staffRole(role).perms.includes(p);

    /* Connected to Catalyst: count the real tables only. Giving, events and
       moderation have no tables in that project, so their cards come out
       rather than showing invented totals beside real member counts. */
    if (live()) {
      const [regs, members] = await Promise.all([listRegistrations({}), listMembers({})]);
      const waiting = regs.filter((r) => r.state === 'pending');
      return res.json({
        asOf: now(),
        dataSource: 'catalyst',
        cards: [
          held('members.view') && {
            id: 'members', label: 'Members', value: members.length, icon: 'users', to: '/members/register',
            sub: `${members.filter((m) => m.name.startsWith('(')).length} have not finished registering`,
          },
          held('members.edit') && {
            id: 'registrations', label: 'Registrations waiting', value: waiting.length,
            icon: 'user-plus', to: '/members/registrations', tone: waiting.length ? 'warn' : undefined,
            sub: `${regs.length} registration records in all`,
          },
          held('members.edit') && {
            id: 'approved', label: 'Approved', value: regs.filter((r) => r.state === 'approved').length,
            icon: 'user-check', to: '/members/registrations', sub: 'now full members',
          },
          held('members.edit') && {
            id: 'drafts', label: 'Still filling it in', value: regs.filter((r) => r.state === 'draft').length,
            icon: 'edit', to: '/members/registrations', sub: 'started, not submitted',
          },
        ].filter(Boolean),
        givingByMonth: [],
        membersByLocation: Object.entries(
          members.reduce((acc, m) => { const k = m.loc || 'Not given'; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
        ).map(([loc, n]) => ({ loc, n })).sort((a, b) => b.n - a.n),
        registrationMix: ['pending', 'approved', 'videoReturned', 'rejected'].map((s) => ({
          state: s, n: regs.filter((r) => r.state === s).length,
        })),
        recentAudit: [],
        note: 'Giving, events, content and Jodie have no tables in this Catalyst project.',
      });
    }

    const active = db.MEMBERS.filter((m) => m.status === 'Active');
    const paid = db.RECEIPTS.filter((r) => r.status === 'Paid');
    const thisMonth = paid.filter((r) => r.at >= new Date(2026, 9, 1));

    res.json({
      asOf: now(),
      cards: [
        held('members.view') && {
          id: 'members', label: 'Active members', value: active.length, icon: 'users', to: '/members/register',
          sub: `${db.MEMBERS.length - active.length} archived or inactive`,
        },
        held('members.edit') && {
          id: 'registrations', label: 'Registrations waiting', value: db.REGISTRATIONS.filter((r) => r.state === 'pending').length,
          icon: 'user-plus', to: '/members/registrations', tone: 'warn', sub: 'From the Noah app',
        },
        held('giving.view') && {
          id: 'giving', label: 'Given this month', value: sum(thisMonth, (r) => r.amt), money: true, icon: 'rupee', to: '/finance/receipts',
          sub: `${thisMonth.length} receipts`,
        },
        held('events.view') && {
          id: 'passes', label: 'Passes issued', value: db.PASSES.length, icon: 'ticket', to: '/events/passes',
          sub: `${db.EVENTS.filter((e) => e.status === 'Published').length} events open`,
        },
        held('community.moderate') && {
          id: 'moderation', label: 'Waiting on a moderator',
          value: db.MODQ.filter((q) => q.state === 'Pending').length + db.PRAYER_INBOX.filter((p) => p.state === 'Pending').length,
          icon: 'chats', to: '/community/queue', tone: 'warn',
        },
        held('jodie.verify') && {
          id: 'jodie', label: 'Jodie stages to verify',
          value: sum(['I', 'P', 'E', 'Q'], (k) => db.JPROFILES.filter((p) => p.st[k] === 'pend').length),
          icon: 'shield-check', to: '/jverify',
        },
      ].filter(Boolean),
      givingByMonth: (() => {
        const out = [];
        for (let i = 5; i >= 0; i--) {
          const from = new Date(2026, 9 - i, 1), to = new Date(2026, 10 - i, 1);
          const rows = paid.filter((r) => r.at >= from && r.at < to);
          out.push({ month: from.toLocaleDateString('en-IN', { month: 'short' }), total: sum(rows, (r) => r.amt), count: rows.length });
        }
        return out;
      })(),
      membersByLocation: db.LOCS.map((l) => ({ loc: l, n: active.filter((m) => m.loc === l).length })),
      registrationMix: ['pending', 'approved', 'videoReturned'].map((s) => ({
        state: s, n: db.REGISTRATIONS.filter((r) => r.state === s).length,
      })),
      recentAudit: db.AUD.slice(0, 8),
    });
  });

  /* ================= member registrations (from the Noah app) ================= */

  app.get('/api/registrations/:id', ...guard('members.edit'), async (req, res) => {
    const r = live() ? await registrationById(req.params.id) : find('REGISTRATIONS', req.params.id);
    return r ? res.json(r) : notFound(res);
  });

  /* Approve. Creates the member record, which is what unlocks the app.

     Against Catalyst this is three writes with no transaction around them:
     Members, then Registrations, then AuditLog. The member is written first
     on purpose — a registration still `pending` with a member already
     carrying its id is recoverable, whereas a registration marked approved
     pointing at a member that does not exist is not. */
  app.post('/api/registrations/:id/approve', ...guard('members.edit'), async (req, res) => {
    const r = live() ? await registrationById(req.params.id) : find('REGISTRATIONS', req.params.id);
    if (!r) return notFound(res);
    if (r.state === 'approved') return res.status(409).json({ error: 'That registration is already approved.' });

    /* Only a registration waiting for a decision can be decided. The Noah API
       enforces this itself (409 not_pending); without its key the table writes
       would not, so the console does, and says which case it is. */
    if (live() && r.state !== 'pending') {
      return res.status(409).json({ error: notPendingMessage(r.state) });
    }

    const { loc, pastor, cell } = req.body || {};

    if (live()) {
      const note = req.body?.remark || `Approved by ${req.user.name}`;
      let member = null, notified = null, repaired = false, silent = false;

      if (noahConfigured()) {
        /* The Noah API owns the decision. It writes the registration AND tells
           the member. Setting Registrations.status from here instead would
           approve someone in silence — they would never find out. */
        let result;
        try {
          result = await noah.approve(r.id, { actor: req.user.name, note });
        } catch (err) {
          /* 409 means it was already decided. That is an answer about the
             registration, not a fault here, so it keeps its own status. */
          return res.status(err.status === 409 ? 409 : 502)
            .json({ error: err.message, code: err.code });
        }
        notified = result?.notified ?? null;

        /* What the API does to the *member* row is its business and may change.
           Rather than assume, check whether they can actually get in, and mend
           it only if they cannot. A repair, not part of the normal path. */
        clearCache();
        const fresh = await registrationById(r.id);
        const rowId = r.memberRowId ?? fresh?.memberRowId;
        const them = (await listMembers({})).find((m) => String(m.rowId) === String(rowId));

        /* The app lets them in when the registration reads 'approved'. If the
           API said yes but the table disagrees, say so: reporting a clean
           approval that did not land is the worst answer. */
        if (!canEnterApp(them, fresh)) {
          return res.status(502).json({
            error: 'The Noah API accepted the approval, but the registration does not read approved yet. Refresh in a moment; if it still says pending, tell the Catalyst developer.',
          });
        }
        /* The API also clears `isUnVerified` so the office's own tools see the
           member as verified. Mend it only if that did not land. */
        if (them && !them.officeVerified) {
          await activateMemberOnly(rowId);
          repaired = true;
        }
        /* `id` as well as `memberRowId`: in this schema they are the same
           value, and the contract — and the app — ask for `id`. */
        member = { id: rowId, memberRowId: rowId, status: 'active', roles: ['member'] };
      } else {
        /* No admin key yet. The console still works, but nothing reaches the
           member — so say that, rather than reporting a clean approval. */
        try {
          member = await approveRegistration({
            registration: r, staffName: req.user.name, loc, remark: req.body?.remark,
          });
        } catch (err) {
          return res.status(502).json({ error: `Catalyst refused the approval: ${err.message}` });
        }
        silent = true;
      }

      const memberId = member.id || member.memberRowId;
      await writeAudit({
        actor: req.user.name, role: staffRole(req.session.role).name,
        action: 'Approved registration', module: 'Membership', record: r.id,
        before: { state: r.state },
        after: { state: 'approved', member: memberId, via: silent ? 'tables' : 'noah-api' },
        remark: req.body?.remark || '', ip: '10.20.4.17',
      });
      return res.json({
        ok: true,
        registration: { ...r, state: 'approved', memberId },
        member,
        notified,
        appAccess: 'The member can now sign in to the Noah app.',
        warning: silent
          ? 'Approved in the tables, but the member was NOT told: NOAH_ADMIN_API_KEY is not set, so no email went out.'
          : undefined,
        repaired: repaired || undefined,
      });
    }

    const id = 'NH-' + (104210 + db.MEMBERS.length + 1);
    const member = {
      id,
      first: r.firstName, last: r.lastName, name: r.fullName,
      g: r.gender === 'Male' ? 'M' : 'F',
      age: Math.floor((now() - r.dob) / 31557600000),
      kid: false, rel: 'Head', family: null,
      mobile: r.mobile, email: r.email,
      loc: loc || r.city, pastor: pastor || null, leader: null, cell: cell || null,
      status: 'Active', partner: false, joined: now(), lang: r.declarationLang,
      photo: 'Approved', alert: '', crm: 'Pending', lastActive: null,
      address: [r.line1, r.line2, r.city, r.pin].filter(Boolean).join(', '),
      guardian: null, aadhaar: r.idType === 'Aadhaar' ? 'Verified' : 'Not done',
      youngPartner: false,
      fromRegistration: r.id,
    };
    db.MEMBERS.push(member);

    r.state = 'approved';
    r.decidedAt = now();
    r.decidedBy = req.user.name;
    r.memberId = id;
    r.remark = req.body?.remark || '';

    log(req, 'Approved registration', 'Membership', r.id, { state: 'pending' }, { state: 'approved', member: id }, r.remark);
    res.json({ ok: true, registration: r, member });
  });

  /* Return the video. The member re-records step 6 and resubmits. */
  app.post('/api/registrations/:id/return-video', ...guard('members.edit'), async (req, res) => {
    const r = live() ? await registrationById(req.params.id) : find('REGISTRATIONS', req.params.id);
    if (!r) return notFound(res);
    const remark = String(req.body?.remark || '').trim();
    if (!remark) return res.status(400).json({ error: 'Say why the video is being returned. The member sees this.' });

    /* Only a registration waiting for a decision can be decided. The Noah API
       enforces this itself (409 not_pending); without its key the table writes
       would not, so the console does, and says which case it is. */
    if (live() && r.state !== 'pending') {
      return res.status(409).json({ error: notPendingMessage(r.state) });
    }

    const before = { state: r.state };

    if (live()) {
      let silent = false;

      /* The remark is the whole point of this route: the member is being asked
         to record it again and needs to know what was wrong. Only the API
         delivers that, so a table write would return the video and tell them
         nothing. */
      if (noahConfigured()) {
        try {
          await noah.returnVideo(r.id, { actor: req.user.name, note: remark });
        } catch (err) {
          return res.status(err.status === 409 ? 409 : 502)
            .json({ error: err.message, code: err.code });
        }
        clearCache();
      } else {
        try {
          await returnVideo({ registration: r, staffName: req.user.name, remark });
        } catch (err) {
          return res.status(502).json({ error: `Catalyst refused the change: ${err.message}` });
        }
        silent = true;
      }

      await writeAudit({
        actor: req.user.name, role: staffRole(req.session.role).name,
        action: 'Returned registration video', module: 'Membership', record: r.id,
        before, after: { state: 'videoReturned', via: silent ? 'tables' : 'noah-api' },
        remark, ip: '10.20.4.17',
      });
      return res.json({
        ok: true,
        registration: { ...r, state: 'videoReturned', remark },
        warning: silent
          ? 'Marked as returned, but the member was NOT told what to fix: NOAH_ADMIN_API_KEY is not set.'
          : undefined,
      });
    }

    r.state = 'videoReturned';
    r.decidedAt = now();
    r.decidedBy = req.user.name;
    r.remark = remark;
    r.videoAttempt = (r.videoAttempt || 1) + 1;

    log(req, 'Returned registration video', 'Membership', r.id, before, { state: 'videoReturned' }, remark);
    res.json({ ok: true, registration: r });
  });

  /* Reject. The member sees the reason, in the email and in the app, so it is
     required — the same rule as returning a video. Only the new schema has a
     rejected status, and only the Noah API tells the member. */
  app.post('/api/registrations/:id/reject', ...guard('members.edit'), async (req, res) => {
    const r = live() ? await registrationById(req.params.id) : find('REGISTRATIONS', req.params.id);
    if (!r) return notFound(res);
    const remark = String(req.body?.remark || '').trim();
    if (!remark) return res.status(400).json({ error: 'Say why it is being rejected. The member sees this.' });
    if (r.state === 'approved') return res.status(409).json({ error: 'That registration is already approved.' });

    /* Only a registration waiting for a decision can be decided. The Noah API
       enforces this itself (409 not_pending); without its key the table writes
       would not, so the console does, and says which case it is. */
    if (live() && r.state !== 'pending') {
      return res.status(409).json({ error: notPendingMessage(r.state) });
    }

    const before = { state: r.state };

    if (live()) {
      let silent = false;
      if (noahConfigured()) {
        try {
          await noah.reject(r.id, { actor: req.user.name, note: remark });
        } catch (err) {
          return res.status(err.status === 409 ? 409 : 502).json({ error: err.message, code: err.code });
        }
        clearCache();
      } else {
        try {
          await rejectRegistration({ registration: r, remark });
        } catch (err) {
          return res.status(502).json({ error: `Catalyst refused the change: ${err.message}` });
        }
        silent = true;
      }
      await writeAudit({
        actor: req.user.name, role: staffRole(req.session.role).name,
        action: 'Rejected registration', module: 'Membership', record: r.id,
        before, after: { state: 'rejected', via: silent ? 'tables' : 'noah-api' }, remark, ip: '10.20.4.17',
      });
      return res.json({
        ok: true,
        registration: { ...r, state: 'rejected', remark },
        warning: silent
          ? 'Marked as rejected, but the member was NOT told why: NOAH_ADMIN_API_KEY is not set.'
          : undefined,
      });
    }

    r.state = 'rejected';
    r.decidedAt = now();
    r.decidedBy = req.user.name;
    r.remark = remark;
    log(req, 'Rejected registration', 'Membership', r.id, before, { state: 'rejected' }, remark);
    res.json({ ok: true, registration: r });
  });

  /* A short-lived URL for one of the three uploads, so the office can read
     the ID document, look at the photograph and watch the KYC video.

     Looking at someone's identity document is an action, not a page view, so
     it is audited the same way revealing a phone number is. The URL expires;
     a permanent one would leak the moment it was pasted anywhere.

     In the mock the URL goes nowhere — there is no storage. The shape is what
     Catalyst must return. */
  app.get('/api/registrations/:id/file/:kind', ...guard('members.edit'), async (req, res) => {
    const kind = req.params.kind;
    if (!['id', 'photo', 'video'].includes(kind)) {
      return res.status(400).json({ error: 'kind must be id, photo or video.' });
    }

    const r = live() ? await registrationById(req.params.id) : find('REGISTRATIONS', req.params.id);
    if (!r) return notFound(res);

    /* Looking at someone's identity document is an action, not a page view. */
    log(req, 'Viewed a registration document', 'Membership', r.id, null, { document: kind });

    if (!live()) {
      const field = { id: 'idFile', photo: 'photoFile', video: 'videoFile' }[kind];
      if (!r[field]) return res.status(404).json({ error: `No ${kind} was uploaded.` });
      return res.status(503).json({
        error: 'There is no file storage in the sample data. Connect Catalyst to read real uploads.',
        filename: r[field],
      });
    }

    /* Streamed through this server rather than handed out as a public URL, so
       the permission check and the audit entry cannot be bypassed. */
    const stream = (buffer, contentType) => {
      res.setHeader('content-type', contentType);
      res.setHeader('cache-control', 'private, max-age=300');
      res.setHeader('content-disposition', `inline; filename="${kind}-${r.id}"`);
      return res.send(buffer);
    };

    const slot = { id: 'idProof', photo: 'photo', video: 'video' }[kind];
    /* `files` ROWID: what GET /admin/files/:id takes. */
    const filesRowId = r.fileIds?.[slot];
    /* `files.path`: the File Store id, for a direct download. */
    const tableFileId = r.storeIds?.[slot];
    let viaNoah = null;

    /* The Noah API first. Its admin key reaches File Store; the OAuth token at
       this end is tables-only, which is why the video could not be fetched
       before. The file ids come from the API's own registration detail, since
       only it knows what its ids mean — falling back to the id in the Files
       table when the detail does not name one. */
    if (noahConfigured()) {
      try {
        /* The id comes from our own join, which knows it exactly. Only when
           that has nothing is the API's own detail asked, which names files by
           whatever it calls them. */
        let fileId = filesRowId;
        if (!fileId) fileId = findFileId(await noah.getRegistration(r.id), kind);
        if (!fileId) {
          return res.status(404).json({ error: `No ${kind} was uploaded for this registration.` });
        }
        const { buffer, contentType } = await noah.getFile(fileId, { actor: req.user.name });
        return stream(buffer, contentType);
      } catch (err) {
        /* Fall through to the direct attempt below: one working path is enough,
           and if neither works both reasons are reported together. */
        viaNoah = err.message;
      }
    }

    if (!tableFileId) {
      return res.status(viaNoah ? 502 : 404).json({
        error: viaNoah
          ? `The Noah API could not serve this file: ${viaNoah}`
          : `No ${kind} was uploaded for this registration.`,
      });
    }

    try {
      const { buffer, contentType } = await downloadFile(tableFileId);
      return stream(buffer, contentType);
    } catch (err) {
      return res.status(fileScopeMissing() ? 403 : 502).json({
        error: noahConfigured()
          ? `The Noah API could not serve this file (${viaNoah}), and reading Catalyst File Store directly failed too: ${err.message}`
          : err.message,
        scopeMissing: !!fileScopeMissing(),
        needsAdminKey: !noahConfigured(),
        fileId: tableFileId,
      });
    }
  });

  /* ================= member roles in the app ================= */

  /* The catalogue: what roles exist, what each one opens. */
  app.get('/api/app-roles/catalogue', requireSession, (_req, res) => {
    res.json({ roles: MEMBER_ROLES, restrictions: MEMBER_RESTRICTIONS });
  });

  /* Everyone, with the roles they hold. */
  app.get('/api/app-roles/people', ...guard(['approles.manage', 'members.view']), async (req, res) => {
    if (!live()) return res.json({ rows: [], total: 0, notInProject: true, message: 'Member roles need the Catalyst connection.' });
    try {
      const [members, roleRows] = await Promise.all([listMembers({}), allMemberRoles()]);
      const rows = members
        .filter((m) => m.rowId)
        .map((m) => {
          const row = roleRows.get(String(m.rowId)) ?? null;
          /* The registration decides, not members.status (true for all). */
          const approved = !!m.approved;
          return {
            memberRowId: m.rowId,
            name: m.name,
            mobile: m.mobile,
            loc: m.loc,
            status: m.status,
            approved,
            /* Approved members with no roles row yet still count as church
               members — the row is written the first time anything changes. */
            ...appRoleSummary(row, { approved }),
            hasRolesRow: !!row,
          };
        });
      res.json({ rows, total: rows.length, offset: 0, limit: rows.length });
    } catch (err) {
      res.status(503).json({ error: err.message });
    }
  });

  /* Give or take away one role. */
  app.post('/api/app-roles/:memberRowId/:roleId', ...guard(['approles.manage', 'members.edit']), async (req, res) => {
    if (!live()) return res.status(409).json({ error: 'Member roles need the Catalyst connection.' });

    const { memberRowId, roleId } = req.params;
    const on = req.body?.on !== false;

    const patch = patchForRole(roleId, on) ?? patchForRestriction(roleId, on, req.body?.comment);
    if (!patch) {
      return res.status(400).json({
        error: memberRole(roleId)?.always
          ? 'Church member cannot be taken away. Archive the member instead.'
          : 'No such role.',
      });
    }

    try {
      const row = await patchMemberRoles(memberRowId, patch);
      const summary = appRoleSummary(row);
      const label = memberRole(roleId)?.label ?? restrictionById(roleId)?.label ?? roleId;

      await writeAudit({
        actor: req.user.name, role: staffRole(req.session.role).name,
        action: on ? `Gave the role: ${label}` : `Removed the role: ${label}`,
        module: 'App roles', record: memberRowId,
        before: null, after: { roles: summary.roles }, ip: '10.20.4.17',
      });

      res.json({ ok: true, ...summary, changed: label, on });
    } catch (err) {
      res.status(502).json({ error: `Catalyst refused the change: ${err.message}` });
    }
  });

  /* Tick or untick one of the office's checks while reviewing. */
  app.patch('/api/registrations/:id/checks', ...guard('members.edit'), (req, res) => {
    const r = find('REGISTRATIONS', req.params.id);
    if (!r) return notFound(res);
    const before = { ...r.checks };
    r.checks = { ...r.checks, ...(req.body || {}) };
    log(req, 'Amended registration checks', 'Membership', r.id, before, r.checks);
    res.json({ ok: true, checks: r.checks });
  });

  /* ================= prayer requests from the app ================= */

  app.post('/api/prayer-inbox/:id/decide', ...guard('community.moderate'), (req, res) => {
    const p = find('PRAYER_INBOX', req.params.id);
    if (!p) return notFound(res);
    const decision = req.body?.decision;
    if (!['Approved', 'Declined'].includes(decision)) return res.status(400).json({ error: 'Decide Approved or Declined.' });
    if (decision === 'Declined' && !String(req.body?.remark || '').trim()) {
      return res.status(400).json({ error: 'Say why it was declined. The member sees this.' });
    }
    const before = { state: p.state };
    p.state = decision;
    p.decidedBy = req.user.name;
    p.remark = req.body?.remark || '';

    /* An approved request joins the prayer wall the app reads. */
    if (decision === 'Approved') {
      db.PRAYERS.push({
        id: p.id, name: p.anonymous ? 'Anonymous' : p.memberName || 'A member',
        text: p.text, cat: p.category, at: p.at, state: 'Approved',
        everyone: p.everyone, prayed: 0,
      });
    }
    log(req, decision === 'Approved' ? 'Approved prayer request' : 'Declined prayer request', 'Community', p.id, before, { state: decision }, p.remark);
    res.json({ ok: true, request: p });
  });

  /* ================= community moderation ================= */

  /* One shape for the prototype's several approve/reject queues. */
  const DECIDE = {
    MODQ: { perm: 'community.moderate', field: 'state', ok: 'Approved', no: 'Rejected', mod: 'Community', what: 'post' },
    FLAGS: { perm: 'community.moderate', field: 'state', ok: 'Cleared', no: 'Removed', mod: 'Community', what: 'flagged item' },
    PRAYERS: { perm: 'community.moderate', field: 'state', ok: 'Approved', no: 'Rejected', mod: 'Community', what: 'prayer request' },
    PRAISE: { perm: 'community.moderate', field: 'state', ok: 'Published', no: 'Rejected', mod: 'Community', what: 'praise report' },
    OBITS: { perm: 'community.moderate', field: 'state', ok: 'Published', no: 'Rejected', mod: 'Community', what: 'obituary' },
    FEEDBACK: { perm: 'community.moderate', field: 'state', ok: 'Answered', no: 'Closed', mod: 'Community', what: 'feedback' },
    REWARD_TX: { perm: 'rewards.approve', field: 'status', ok: 'Approved', no: 'Rejected', mod: 'Community', what: 'withdrawal' },
    VIDEOKYC: { perm: 'members.edit', field: 'state', ok: 'Approved', no: 'Returned', mod: 'Membership', what: 'video check' },
    BATCHES: { perm: 'finance.approve', field: 'status', ok: 'Approved', no: 'Rejected', mod: 'Finance', what: 'payment batch' },
  };

  app.post('/api/decide/:coll/:id', requireSession, (req, res) => {
    const spec = DECIDE[req.params.coll];
    if (!spec) return res.status(404).json({ error: 'That queue cannot be decided here.' });
    if (!staffRole(req.session.role).perms.includes(spec.perm)) {
      return res.status(403).json({ error: 'You do not have access to this.', needs: [spec.perm] });
    }
    const row = find(req.params.coll, req.params.id);
    if (!row) return notFound(res);

    const approve = req.body?.approve !== false;
    const to = approve ? spec.ok : spec.no;
    const before = { [spec.field]: row[spec.field] };
    row[spec.field] = to;
    row.decidedBy = req.user.name;
    row.decidedAt = now();
    if (req.body?.remark) row.remark = req.body.remark;

    log(req, `${approve ? 'Approved' : 'Rejected'} ${spec.what}`, spec.mod, row.id, before, { [spec.field]: to }, row.remark);
    res.json({ ok: true, row });
  });

  /* Decide a batch of rows in one go. */
  app.post('/api/decide/:coll', requireSession, (req, res) => {
    const spec = DECIDE[req.params.coll];
    if (!spec) return res.status(404).json({ error: 'That queue cannot be decided here.' });
    if (!staffRole(req.session.role).perms.includes(spec.perm)) {
      return res.status(403).json({ error: 'You do not have access to this.', needs: [spec.perm] });
    }
    const ids = [].concat(req.body?.ids || []);
    const approve = req.body?.approve !== false;
    const to = approve ? spec.ok : spec.no;
    const done = [];
    for (const id of ids) {
      const row = find(req.params.coll, id);
      if (!row) continue;
      row[spec.field] = to;
      row.decidedBy = req.user.name;
      row.decidedAt = now();
      done.push(row.id);
    }
    log(req, `${approve ? 'Approved' : 'Rejected'} ${done.length} ${spec.what}s`, spec.mod, done.join(', '), null, { [spec.field]: to });
    res.json({ ok: true, decided: done, state: to });
  });

  /* ================= membership ================= */

  app.patch('/api/members/:id', ...guard('members.edit'), (req, res) => {
    const m = find('MEMBERS', req.params.id);
    if (!m) return notFound(res);
    const allowed = ['loc', 'cell', 'pastor', 'leader', 'status', 'lang', 'partner', 'email', 'mobile', 'address'];
    const before = {}, after = {};
    for (const k of allowed) {
      if (k in (req.body || {}) && req.body[k] !== m[k]) { before[k] = m[k]; after[k] = req.body[k]; m[k] = req.body[k]; }
    }
    if (!Object.keys(after).length) return res.json({ ok: true, member: m, changed: false });
    log(req, 'Amended member', 'Membership', m.id, before, after);
    res.json({ ok: true, member: m, changed: true });
  });

  app.post('/api/members/:id/archive', ...guard('members.archive'), (req, res) => {
    const m = find('MEMBERS', req.params.id);
    if (!m) return notFound(res);
    const before = { status: m.status };
    m.status = req.body?.to || 'Archived';
    log(req, 'Archived member', 'Membership', m.id, before, { status: m.status }, req.body?.remark || '');
    res.json({ ok: true, member: m });
  });

  /* Contact details are behind their own permission, and every reveal is
     logged — the prototype did the same. */
  app.get('/api/members/:id/contact', ...guard('members.pii'), (req, res) => {
    const m = find('MEMBERS', req.params.id);
    if (!m) return notFound(res);
    log(req, 'Revealed contact details', 'Membership', m.id, null, { fields: 'Mobile, email' });
    res.json({ mobile: m.mobile, email: m.email, address: m.address });
  });

  /* ================= content: Daily Manna ================= */

  app.post('/api/manna/:id/publish', ...guard('content.publish'), (req, res) => {
    const m = find('MANNA', req.params.id);
    if (!m) return notFound(res);
    const before = { status: m.status };
    m.status = 'Published';
    log(req, 'Published content', 'Content', 'Daily Manna, ' + m.id, before, { status: 'Published' });
    res.json({ ok: true, manna: m });
  });

  app.patch('/api/manna/:id', ...guard('content.edit'), (req, res) => {
    const m = find('MANNA', req.params.id);
    if (!m) return notFound(res);
    const before = { title: m.title, verse: m.verse };
    Object.assign(m, req.body || {});
    log(req, 'Amended content', 'Content', 'Daily Manna, ' + m.id, before, { title: m.title, verse: m.verse });
    res.json({ ok: true, manna: m });
  });

  /* ================= events ================= */

  app.post('/api/events/:id/publish', ...guard('events.manage'), (req, res) => {
    const e = find('EVENTS', req.params.id);
    if (!e) return notFound(res);
    const before = { status: e.status };
    e.status = req.body?.to || 'Published';
    log(req, 'Changed event status', 'Events', e.id, before, { status: e.status });
    res.json({ ok: true, event: e });
  });

  app.post('/api/passes/:id/scan', ...guard('events.scan'), (req, res) => {
    const p = find('PASSES', req.params.id);
    if (!p) return notFound(res);
    if (p.scanned) return res.status(409).json({ error: 'That pass was already scanned.', pass: p });
    p.scanned = true;
    p.scannedAt = now();
    db.SCANS.unshift({ id: 'SC-' + ri(9000, 9999), pass: p.id, name: p.name, at: now(), gate: req.body?.gate || 'Gate 1', result: 'Admitted' });
    log(req, 'Scanned pass', 'Events', p.id, { scanned: false }, { scanned: true });
    res.json({ ok: true, pass: p });
  });

  /* ================= Jodie verification ================= */

  app.post('/api/jodie/:id/stage/:stage', ...guard('jodie.verify'), (req, res) => {
    const p = find('JPROFILES', req.params.id);
    if (!p) return notFound(res);
    const stage = req.params.stage;
    if (!['I', 'P', 'E', 'Q'].includes(stage)) return res.status(400).json({ error: 'No such stage.' });

    const approve = req.body?.approve !== false;
    const remark = String(req.body?.remark || '').trim();
    if (!approve && !remark) return res.status(400).json({ error: 'Say why the stage was returned. The member sees this.' });

    const before = { [stage]: p.st[stage] };
    p.st[stage] = approve ? 'ok' : 'ret';
    p.stamps[stage] = now();
    /* A profile goes live only when all four stages are approved. */
    p.verified = ['I', 'P', 'E', 'Q'].every((k) => p.st[k] === 'ok');

    db.VERIF_DONE.unshift({
      id: 'VD-' + ri(100, 999), pid: p.id, name: p.name, stage,
      decision: approve ? 'Approved' : 'Returned', by: req.user.name, at: now(), remark,
    });
    log(req, approve ? 'Approved stage' : 'Returned stage', 'Jodie verification', p.id, before, { [stage]: p.st[stage] }, remark);
    res.json({ ok: true, profile: p });
  });

  /* ================= staff and permissions ================= */

  app.patch('/api/roles/:id', ...guard('staff.manage'), (req, res) => {
    const role = db.ROLES.find((r) => r.id === req.params.id);
    if (!role) return notFound(res);
    const { perm, on } = req.body || {};
    if (!db.ALL_PERMS.includes(perm)) return res.status(400).json({ error: 'No such permission.' });
    const had = role.perms.includes(perm);
    if (on && !had) role.perms.push(perm);
    if (!on && had) role.perms = role.perms.filter((p) => p !== perm);
    log(req, 'Changed role permissions', 'Staff and permissions', role.name, { [perm]: had }, { [perm]: !!on });
    res.json({ ok: true, role });
  });

  app.post('/api/staff/:id/status', ...guard('staff.manage'), (req, res) => {
    const s = find('STAFF', req.params.id);
    if (!s) return notFound(res);
    const before = { status: s.status };
    s.status = req.body?.to || 'Suspended';
    log(req, 'Changed staff account status', 'Staff and permissions', s.name, before, { status: s.status }, req.body?.remark || '');
    res.json({ ok: true, staff: s });
  });

  /* ================= reports ================= */

  app.get('/api/reports/coverage', ...guard('staff.manage'), (_req, res) => {
    const covered = db.ENDPOINTS.filter((e) => e.perm).length;
    res.json({ total: db.ENDPOINTS.length, covered, percent: pct(covered, db.ENDPOINTS.length), endpoints: db.ENDPOINTS });
  });
}
