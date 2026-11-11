/* Attendance and bookings: the console's part of EVENTS-QR-CONTRACT.md and FOR-CONSOLE-EVENTS.md.

   Door staff scan passes in the Noah app (the `scanner` app role, see server/scanner-role.js); the console has no scanner of its
   own. It shows who came: every event with its numbers, and for one event everyone booked, present or not, from the passes table;
   plus the Noah API's live numbers, latest arrivals, CSV and history (audit trail). The Noah API trusts the console's admin key
   and knows nothing of the console's roles, so THIS server checks the permission before every call:

     events.scan                  correcting attendance by hand
     events.view or events.scan   the events and their attendance, the CSV, the history
     events.view                  bookings, and "is it shown in the app"

   Every call to the Noah API names the staff member (X-Admin-Name) and their id (staffId, digits). */

import { roleById } from '../db.js';
import { writeAudit } from '../store.js';
import { io, loadMembers } from '../noah-schema.js';
import * as noah from '../noah-api.js';
import { onCatalyst, listEvents, storedRows } from '../events.js';

const { noahConfigured, NoahApiError } = noah;

/* The staff member's id, as digits: their member row, else their staff row. */
const staffIdOf = (req) => [req.session?.memberRowId, req.session?.rowId, req.session?.staffId]
  .map((v) => String(v ?? '')).find((v) => /^\d+$/.test(v)) || '';

const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';

/** The passes table, one row per booking, in plain words. `inactive` = cancelled by the member; `passIsUsed` = came in. */
async function passRows() {
  return (await io.getRows('tbl:passes'))
    .filter((p) => !bool(p.archived))
    .map((p) => ({
      id: String(p.ROWID), eventId: String(p.eventId ?? ''), memberId: String(p.memberId ?? ''),
      cancelled: bool(p.inactive), present: !bool(p.inactive) && bool(p.passIsUsed),
      bookedAt: String(p.created || p.CREATEDTIME || '').slice(0, 19),
      usedAt: p.passIsUsedTime ? String(p.passIsUsedTime).slice(0, 19) : '',
      usedBy: /^\d+$/.test(String(p.passIsUsedEmployeeId ?? '')) ? String(p.passIsUsedEmployeeId) : '',
      seat: String(p.seatLabel ?? ''),
    }));
}

/* The office's member number (members.memberId). The register falls back to the row id when there is none: show nothing then. */
const memberNumber = (m) => (m?.id && String(m.id) !== String(m.rowId) ? String(m.id) : '');

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

  /* Door staff scan passes in the Noah app (the `scanner` app role), not in the console. The console shows who came. */

  /* ---------- attendance: every event, and the people booked for one ---------- */

  /* The events, newest first, each with how many are booked, present and not yet arrived (from the passes table). */
  app.get('/api/event-admin/attendance/events', ...watch, async (_req, res) => {
    try {
      const [events, passes] = await Promise.all([listEvents(), onCatalyst() ? passRows() : []]);
      const tally = new Map();
      for (const p of passes) {
        const t = tally.get(p.eventId) || { booked: 0, present: 0, cancelled: 0 };
        if (p.cancelled) t.cancelled += 1; else { t.booked += 1; if (p.present) t.present += 1; }
        tally.set(p.eventId, t);
      }
      const rows = events
        .map((e) => {
          const t = tally.get(String(e.id)) || { booked: 0, present: 0, cancelled: 0 };
          return { ...e, ...t, notArrived: t.booked - t.present };
        })
        .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
      res.json({ rows, today: istDay(0) });
    } catch (err) {
      console.error(`[attendance] events: ${err.message}`);
      res.status(503).json({ error: 'The events could not be read just now.' });
    }
  });

  /* Everyone booked for one event, with whether they are present, when they came in and who let them in. */
  app.get('/api/event-admin/events/:id/people', ...watch, async (req, res) => {
    if (!onCatalyst()) return res.json({ rows: [] });
    try {
      const [passes, members] = await Promise.all([passRows(), loadMembers()]);
      const who = new Map(members.map((m) => [String(m.rowId), m]));
      const rows = passes
        .filter((p) => p.eventId === String(req.params.id))
        .map((p) => {
          const m = who.get(p.memberId);
          const by = p.usedBy ? who.get(p.usedBy) : null;
          return {
            passId: p.id, memberId: p.memberId, name: m?.name ?? 'Member', number: memberNumber(m),
            status: p.cancelled ? 'Cancelled' : p.present ? 'Present' : 'Not yet arrived',
            bookedAt: p.bookedAt, arrivedAt: p.usedAt,
            letInBy: p.usedBy ? (by?.name ?? `Staff ${p.usedBy}`) : '',
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json({ rows });
    } catch (err) {
      console.error(`[attendance] people: ${err.message}`);
      res.status(503).json({ error: 'The bookings could not be read just now.' });
    }
  });

  /* ---------- attendance: numbers, latest arrivals, CSV and history from the Noah API ---------- */

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
      const [passes, members, events] = await Promise.all([passRows(), loadMembers(), storedRows('events')]);
      const who = new Map(members.map((m) => [String(m.rowId), m]));
      const what = new Map(events.map((e) => [String(e.ROWID), e]));
      const eventId = String(req.query.eventId || '').trim();
      const rows = passes
        .filter((p) => !eventId || p.eventId === eventId)
        .map((p) => {
          const m = who.get(p.memberId);
          const e = what.get(p.eventId);
          return {
            id: p.id, eventId: p.eventId, event: e ? String(e.name ?? '') : '',
            memberId: p.memberId, member: m?.name ?? 'Member', number: memberNumber(m),
            seat: p.seat, status: p.cancelled ? 'Cancelled' : p.present ? 'Attended' : 'Booked',
            bookedAt: p.bookedAt, usedAt: p.usedAt,
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
