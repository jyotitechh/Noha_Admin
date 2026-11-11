/* Entry passes at the door, attendance and bookings: the console's part of EVENTS-QR-CONTRACT.md and FOR-CONSOLE-EVENTS.md.

   The Noah API keeps the passes, checks the QR codes and records attendance. It trusts the console's admin key and knows nothing
   of the console's roles, so THIS server checks the permission before every call:

     events.scan                  the door scanner, and correcting attendance by hand
     events.view or events.scan   the attendance numbers, the live list, the CSV, the audit trail
     events.view                  bookings, and "is it shown in the app"

   Every call to the Noah API names the staff member (X-Admin-Name) and their id (staffId, digits), which it stores with the
   scan. A scan the Noah API could not record (500, or no answer) is shown as a failed scan, never as a success. */

import { roleById } from '../db.js';
import { writeAudit } from '../store.js';
import { io, loadMembers } from '../noah-schema.js';
import * as noah from '../noah-api.js';
import { onCatalyst, listEvents, storedRows } from '../events.js';

const { noahConfigured, NoahApiError } = noah;

/* The staff member's id, as digits: their member row, else their staff row. */
const staffIdOf = (req) => [req.session?.memberRowId, req.session?.rowId, req.session?.staffId]
  .map((v) => String(v ?? '')).find((v) => /^\d+$/.test(v)) || '';

const pad = (n) => String(n).padStart(2, '0');
const istDay = (offsetDays = 0) => {
  const d = new Date(Date.now() + 330 * 60000 + offsetDays * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

export default function mountAttendance(app, { requireSession, requirePerm }) {
  const scan = [requireSession, requirePerm('events.scan')];
  const watch = [requireSession, requirePerm(['events.view', 'events.scan'])];
  const view = [requireSession, requirePerm('events.view')];

  const audit = (req, action, record, after = null) =>
    writeAudit({
      actor: req.user.name, role: roleById(req.session.role).name,
      action, module: 'Events', record, before: null, after, remark: '', ip: req.ip || '',
    }).catch(() => {});

  /* Run a call to the Noah API; turn its refusals into replies the screen can show. */
  const viaNoah = (fn) => async (req, res) => {
    if (!noahConfigured()) return res.status(503).json({ error: 'The Noah API is not connected on this server, so passes cannot be checked.' });
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof NoahApiError && err.status >= 400 && err.status < 500) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      console.error(`[attendance] ${req.method} ${req.path}: ${err.message}`);
      res.status(502).json({ error: 'The Noah API could not be reached just now. Try again in a moment.' });
    }
  };

  /* ---------- the door scanner ---------- */

  /* Events to scan for: from yesterday to a week ahead, soonest first. */
  app.get('/api/event-admin/scan/events', ...scan, async (_req, res) => {
    try {
      res.json({ rows: await listEvents({ from: istDay(-1), to: istDay(7) }), today: istDay(0) });
    } catch (err) {
      console.error(`[attendance] scan events: ${err.message}`);
      res.status(503).json({ error: 'The events could not be read just now.' });
    }
  });

  /* Look at a pass (confirm: false) or admit it (confirm: true). */
  app.post('/api/event-admin/events/:id/scan', ...scan, async (req, res) => {
    if (!noahConfigured()) return res.status(503).json({ result: 'failed', ok: false, message: 'The Noah API is not connected on this server, so passes cannot be checked.' });
    const b = req.body || {};
    const token = String(b.token || '').trim().slice(0, 600);
    const reference = String(b.reference || '').trim().toUpperCase().slice(0, 40);
    if (!token && !reference) return res.status(400).json({ result: 'failed', ok: false, message: 'Scan a code, or type the reference from the pass.' });
    try {
      const out = await noah.scanPass(req.params.id, {
        token: token || undefined, reference: token ? undefined : reference, confirm: b.confirm === true,
        deviceRef: String(b.deviceRef || '').slice(0, 60) || undefined, staffId: staffIdOf(req), actor: req.user.name,
      });
      if (out?.result === 'admitted') {
        await audit(req, 'Admitted a member at the door', `${out.event?.name ?? 'Event'}: ${out.member?.name ?? 'member'}`,
          { pass: out.pass?.reference ?? out.pass?.id ?? null, by: token ? 'QR code' : 'typed reference' });
      }
      res.json(out);
    } catch (err) {
      /* A 4xx with an answer in the contract's shape is still a result to show; anything else is a failed scan. */
      if (err instanceof NoahApiError && err.status >= 400 && err.status < 500 && err.code !== 'invalid_admin_key') {
        return res.status(err.status).json({ result: 'failed', ok: false, message: err.message });
      }
      console.error(`[attendance] scan failed: ${err.message}`);
      res.status(502).json({ result: 'failed', ok: false, message: 'The scan could not be recorded. Nobody was admitted: scan the code again.' });
    }
  });

  /* ---------- attendance ---------- */

  app.get('/api/event-admin/events/:id/attendance', ...watch, viaNoah(async (req, res) => {
    res.json(await noah.eventAttendance(req.params.id));
  }));

  app.get('/api/event-admin/events/:id/attendance/export', ...watch, viaNoah(async (req, res) => {
    const { buffer } = await noah.eventAttendanceCsv(req.params.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${String(req.params.id).replace(/\D/g, '')}.csv"`);
    res.send(buffer);
  }));

  app.get('/api/event-admin/events/:id/attendance/audit', ...watch, viaNoah(async (req, res) => {
    const limit = Math.min(300, Math.max(1, Number(req.query.limit) || 100));
    res.json(await noah.attendanceAudit(req.params.id, limit));
  }));

  /* Mark present or absent by hand. A reason is required: the Noah API refuses a correction it cannot put on record. */
  app.post('/api/event-admin/events/:id/attendance/correct', ...scan, viaNoah(async (req, res) => {
    const b = req.body || {};
    const action = b.action === 'present' || b.action === 'absent' ? b.action : '';
    const reason = String(b.reason || '').trim().slice(0, 300);
    const passId = String(b.passId || '').trim();
    const memberId = String(b.memberId || '').trim();
    const errors = {};
    if (!action) errors.action = 'Choose present or absent.';
    if (reason.length < 3) errors.reason = 'Say why, in a few words.';
    if (!passId && !memberId) errors.passId = 'Choose the member.';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Some details need attention.', errors });
    const out = await noah.correctAttendance(req.params.id, { passId: passId || undefined, memberId: passId ? undefined : memberId, action, reason, staffId: staffIdOf(req), actor: req.user.name });
    await audit(req, action === 'present' ? 'Marked a member present by hand' : 'Marked a member absent by hand', `Event ${req.params.id}`, { passId: passId || null, memberId: memberId || null, reason });
    res.json({ ok: true, ...out });
  }));

  /* ---------- is it shown in the app ---------- */

  /* The Noah API's own reading of an event: shown to members or not, and why. */
  app.get('/api/event-admin/events/:id/in-app', ...view, viaNoah(async (req, res) => {
    const data = await noah.eventDiagnostics();
    const list = Array.isArray(data) ? data : Array.isArray(data?.events) ? data.events : Array.isArray(data?.rows) ? data.rows : [];
    const mine = list.find((e) => [e?.id, e?.eventId, e?.ROWID, e?.rowId].map((v) => String(v ?? '')).includes(String(req.params.id)));
    res.json({ found: !!mine, event: mine || null });
  }));

  /* ---------- bookings: the passes members hold ---------- */

  app.get('/api/event-admin/bookings', ...view, async (req, res) => {
    if (!onCatalyst()) return res.json({ rows: [] });
    try {
      const [passes, members, events] = await Promise.all([io.getRows('tbl:passes'), loadMembers(), storedRows('events')]);
      const who = new Map(members.map((m) => [m.rowId, m]));
      const what = new Map(events.map((e) => [String(e.ROWID), e]));
      const eventId = String(req.query.eventId || '').trim();
      const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';
      const rows = passes
        .filter((p) => !bool(p.archived) && (!eventId || String(p.eventId) === eventId))
        .map((p) => {
          const m = who.get(String(p.memberId));
          const e = what.get(String(p.eventId));
          const status = bool(p.inactive) ? 'Cancelled' : bool(p.passIsUsed) ? 'Attended' : 'Booked';
          return {
            id: String(p.ROWID), eventId: String(p.eventId ?? ''), event: e ? String(e.name ?? '') : '',
            memberId: String(p.memberId ?? ''), member: m?.name ?? 'Member', number: m?.id ?? '',
            seat: String(p.seatLabel ?? ''), status,
            bookedAt: String(p.created || p.CREATEDTIME || '').slice(0, 19), usedAt: p.passIsUsedTime ? String(p.passIsUsedTime).slice(0, 19) : '',
          };
        })
        .sort((a, b) => b.bookedAt.localeCompare(a.bookedAt));
      res.json({ rows });
    } catch (err) {
      console.error(`[attendance] bookings: ${err.message}`);
      res.status(503).json({ error: 'The bookings could not be read just now.' });
    }
  });
}
