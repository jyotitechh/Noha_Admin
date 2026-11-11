/* Events, event groups and event language groups (server/events.js keeps them).

     events.view    see events, groups and the details of one
     events.manage  add, change, copy and archive them

   Everything changed here goes in the audit log. A member's mobile number is shown (as the old app did for the
   preacher) only to a role that may see contact details; anyone else sees it masked. */

import { can, roleById } from '../db.js';
import { writeAudit } from '../store.js';
import { loadMembers, pastoralChoices } from '../noah-schema.js';
import { searchPlaces, PlaceError } from '../places.js';
import { announce } from '../event-announce.js';
import {
  EventError, onCatalyst, listEvents, getEvent, createEvent, updateEvent, archiveEvent, restoreEvent, deleteEvent,
  listGroups, createGroup, updateGroup, archiveGroup, restoreGroup, deleteGroup, listLanguageGroups, createLanguageGroup, choices,
} from '../events.js';

const maskMobile = (m = '') => String(m).replace(/(\d{2})\d+(\d{2})$/, '$1••••••$2');

export default function mountEvents(app, { requireSession, requirePerm }) {
  const view = [requireSession, requirePerm('events.view')];
  const manage = [requireSession, requirePerm('events.manage')];

  const audit = (req, action, record, after = null) =>
    writeAudit({
      actor: req.user.name, role: roleById(req.session.role).name,
      action, module: 'Events', record, before: null, after, remark: '', ip: req.ip || '',
    });

  const guarded = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof EventError) return res.status(e.status).json({ error: e.message, ...(e.errors ? { errors: e.errors } : {}) });
      if (e instanceof PlaceError) return res.status(e.status).json({ error: e.message });
      console.error('[events]', e);
      res.status(503).json({ error: 'That could not be done just now. Try again in a moment.' });
    }
  };

  /* Members by name, for the preacher and the teams. Only members who finished registering. */
  const members = async () => (onCatalyst() ? (await loadMembers()).filter((m) => m.name && m.name !== '(not registered yet)') : []);
  const isPastor = (m) => String(m.memberType || '').toLowerCase() === 'pastor';

  /* The preacher is always a pastor: anyone else is refused, whatever the form sent. */
  const checkPreacher = async (body) => {
    const id = String(body?.preacherId || '').trim();
    if (!id || !onCatalyst()) return;
    const m = (await members()).find((x) => x.rowId === id);
    if (!m || !isPastor(m)) {
      throw Object.assign(new EventError(400, 'Some details need attention.'), { errors: { preacherId: 'Choose a pastor. Only members marked as pastors can preach.' } });
    }
  };

  const shown = (req) => (m) => ({
    id: m.rowId, name: m.name,
    mobile: m.mobile ? (can(req.session.role, 'members.pii') ? m.mobile : maskMobile(m.mobile)) : '',
  });

  app.get('/api/event-admin/choices', ...view, guarded(async (_req, res) => {
    const c = await choices();
    const pastors = onCatalyst() ? (await pastoralChoices()).pastors.map((p) => ({ id: p.rowId, name: p.name })) : [];
    res.json({ ...c, pastors, source: onCatalyst() ? 'catalyst' : 'sample' });
  }));

  app.get('/api/event-admin/members', ...view, guarded(async (req, res) => {
    const all = (await members()).filter((m) => req.query.pastors !== '1' || isPastor(m));
    const ids = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length) return res.json({ rows: all.filter((m) => ids.includes(m.rowId)).map(shown(req)) });
    const q = String(req.query.q || '').trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const hit = q ? all.filter((m) => m.name.toLowerCase().includes(q) || (digits.length >= 3 && String(m.mobile).replace(/\D/g, '').includes(digits))) : [];
    res.json({ rows: hit.slice(0, 20).map(shown(req)) });
  }));

  /* Places on the map, for an event's location. Searching costs the public map service a request, so only someone who
     can add or change events may. */
  app.get('/api/event-admin/places', ...manage, guarded(async (req, res) => {
    res.json({ rows: await searchPlaces(String(req.query.q || '')) });
  }));

  /* ---------- events ---------- */

  app.get('/api/event-admin/events', ...view, guarded(async (req, res) => {
    res.json({ rows: await listEvents({ q: String(req.query.q || ''), from: String(req.query.from || ''), to: String(req.query.to || ''), archived: req.query.archived === '1' }) });
  }));

  app.get('/api/event-admin/events/:id', ...view, guarded(async (req, res) => {
    const all = await members();
    const who = async (rowId) => { const m = all.find((x) => x.rowId === rowId); return m ? shown(req)(m) : null; };
    res.json(await getEvent(req.params.id, who));
  }));

  app.post('/api/event-admin/events', ...manage, guarded(async (req, res) => {
    await checkPreacher(req.body);
    const made = await createEvent(req.body || {});
    await audit(req, 'Added an event', made.name);
    const told = await announce(made.id, { actor: req.user.name });
    if (told.status === 'sent') await audit(req, 'Told members about an event', made.name, { notified: told.notified, members: told.members });
    res.json({ ok: true, ...made, announce: told });
  }));

  app.put('/api/event-admin/events/:id', ...manage, guarded(async (req, res) => {
    await checkPreacher(req.body);
    const done = await updateEvent(req.params.id, req.body || {});
    await audit(req, 'Changed an event', done.name);
    /* Saving is when a hidden event may have been made visible; an event already announced answers "already". */
    const told = await announce(done.id, { actor: req.user.name });
    if (told.status === 'sent') await audit(req, 'Told members about an event', done.name, { notified: told.notified, members: told.members });
    res.json({ ok: true, id: done.id, name: done.name, announce: told });
  }));

  /* "Tell members" on an event: announce it now. `force` tells everyone again. */
  app.post('/api/event-admin/events/:id/announce', ...manage, guarded(async (req, res) => {
    const force = req.body?.force === true;
    const e = await getEvent(req.params.id, async () => null);
    if (e.archived) throw new EventError(409, 'That event is archived. Restore it first.');
    const told = await announce(req.params.id, { force, actor: req.user.name });
    if (told.status === 'sent') await audit(req, force ? 'Told members about an event again' : 'Told members about an event', e.name, { notified: told.notified, members: told.members });
    res.json({ ok: true, announce: told });
  }));

  app.delete('/api/event-admin/events/:id', ...manage, guarded(async (req, res) => {
    const done = await archiveEvent(req.params.id);
    await audit(req, 'Archived an event', done.name);
    res.json({ ok: true });
  }));

  app.post('/api/event-admin/events/:id/restore', ...manage, guarded(async (req, res) => {
    const done = await restoreEvent(req.params.id);
    await audit(req, 'Restored an archived event', done.name);
    res.json({ ok: true });
  }));

  app.delete('/api/event-admin/events/:id/permanently', ...manage, guarded(async (req, res) => {
    const done = await deleteEvent(req.params.id);
    await audit(req, 'Deleted an event', done.name);
    res.json({ ok: true });
  }));

  /* ---------- event groups ---------- */

  app.get('/api/event-admin/groups', ...view, guarded(async (req, res) => {
    res.json({ rows: await listGroups({ archived: req.query.archived === '1' }) });
  }));

  app.post('/api/event-admin/groups/:id/restore', ...manage, guarded(async (req, res) => {
    const done = await restoreGroup(req.params.id);
    await audit(req, 'Restored an archived event group', done.name);
    res.json({ ok: true });
  }));

  app.delete('/api/event-admin/groups/:id/permanently', ...manage, guarded(async (req, res) => {
    const done = await deleteGroup(req.params.id);
    await audit(req, 'Deleted an event group', done.name);
    res.json({ ok: true });
  }));

  app.post('/api/event-admin/groups', ...manage, guarded(async (req, res) => {
    const made = await createGroup(req.body || {});
    await audit(req, 'Added an event group', made.name);
    res.json({ ok: true, ...made });
  }));

  app.put('/api/event-admin/groups/:id', ...manage, guarded(async (req, res) => {
    const done = await updateGroup(req.params.id, req.body || {});
    await audit(req, 'Changed an event group', done.name);
    res.json({ ok: true, ...done });
  }));

  app.delete('/api/event-admin/groups/:id', ...manage, guarded(async (req, res) => {
    const done = await archiveGroup(req.params.id);
    await audit(req, 'Archived an event group', done.name);
    res.json({ ok: true });
  }));

  /* ---------- language groups ---------- */

  app.get('/api/event-admin/language-groups', ...view, guarded(async (_req, res) => {
    res.json({ rows: await listLanguageGroups() });
  }));

  app.post('/api/event-admin/language-groups', ...manage, guarded(async (req, res) => {
    const made = await createLanguageGroup(req.body || {});
    await audit(req, 'Added an event language group', made.name);
    res.json({ ok: true, ...made });
  }));
}
