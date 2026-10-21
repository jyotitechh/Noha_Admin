/* Authoring: the content the Noah app reads, the media it plays, the school.

   One set of routes for every kind of content in content-types.js. Who may do
   what:

     content.edit     read, create, change. May save a DRAFT.
     content.publish  make something live or take it down, and delete.

   A role with only content.edit can write a devotional but cannot put it in
   front of members. Everything done here is written to the audit log. */

import { can, roleById } from '../db.js';
import { writeAudit } from '../store.js';
import { TYPES, SECTIONS, LANGUAGES, typeById } from '../content-types.js';
import {
  listContent, createContent, updateContent, publishContent, deleteContent, ContentError, onCatalyst,
} from '../content.js';

export default function mountContent(app, { requireSession, requirePerm }) {
  const edit = [requireSession, requirePerm('content.edit')];
  const publish = [requireSession, requirePerm('content.publish')];

  const audit = (req, action, def, what, extra = {}) =>
    writeAudit({
      actor: req.user.name, role: roleById(req.session.role).name,
      action, module: 'Content', record: `${def.label}: ${what}`,
      before: null, after: extra, remark: '', ip: req.ip || '',
    });

  /** Run a handler; turn a ContentError into the reply it describes. */
  const guarded = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof ContentError) return res.status(e.status).json({ error: e.message, ...e.extra });
      throw e;
    }
  };

  /* What can be authored, and how each form is drawn. The console builds its
     screens from this, so a field cannot be in one place and not the other. */
  app.get('/api/content/types', ...edit, (_req, res) => {
    res.json({
      sections: SECTIONS,
      languages: LANGUAGES,
      source: onCatalyst() ? 'catalyst' : 'sample',
      types: TYPES,
    });
  });

  app.get('/api/content/:type', ...edit, guarded(async (req, res) => {
    if (!typeById(req.params.type)) throw new ContentError(404, 'No such kind of content.');
    res.json(await listContent(req.params.type, { q: String(req.query.q || ''), state: String(req.query.state || '') }));
  }));

  app.post('/api/content/:type', ...edit, guarded(async (req, res) => {
    const def = typeById(req.params.type);
    if (!def) throw new ContentError(404, 'No such kind of content.');
    const r = await createContent(def.id, req.body, { canPublish: can(req.session.role, 'content.publish') });
    await audit(req, `Created ${def.singular}`, def, r.title || '');
    res.status(201).json(r);
  }));

  app.patch('/api/content/:type/:id', ...edit, guarded(async (req, res) => {
    const def = typeById(req.params.type);
    if (!def) throw new ContentError(404, 'No such kind of content.');
    const r = await updateContent(def.id, req.params.id, req.body, { canPublish: can(req.session.role, 'content.publish') });
    await audit(req, `Changed ${def.singular}`, def, r.title || req.params.id);
    res.json(r);
  }));

  app.post('/api/content/:type/:id/publish', ...publish, guarded(async (req, res) => {
    const def = typeById(req.params.type);
    if (!def) throw new ContentError(404, 'No such kind of content.');
    const on = req.body?.on !== false;
    const r = await publishContent(def.id, req.params.id, on, { canPublish: true });
    await audit(req, on ? `Published ${def.singular}` : `Took down ${def.singular}`, def, r.title || req.params.id);
    res.json({ ...r, on });
  }));

  app.delete('/api/content/:type/:id', ...publish, guarded(async (req, res) => {
    const def = typeById(req.params.type);
    if (!def) throw new ContentError(404, 'No such kind of content.');
    const r = await deleteContent(def.id, req.params.id);
    await audit(req, `Deleted ${def.singular}`, def, r.title || req.params.id);
    res.json(r);
  }));
}
