/* The member register's filter choices and its CSV export (server/member-register.js).

     GET /api/member-register/filters   what each filter can be set to, with counts      members.view
     GET /api/member-register/export    the register as shown, every column, as CSV       members.export and members.pii, audited

   The export takes the same query as the register itself: q, status, loc and the filters (city, state, country, tongue, group,
   event). It holds phone numbers, email and addresses, so it needs the permission that reveals them as well as members.export, and each one is logged. */

import { can, roleById } from '../db.js';
import { listMembers, writeAudit } from '../store.js';
import { explainCatalyst } from '../catalyst.js';
import { registerLinks, registerFilterOptions, applyRegisterFilters, filtersFrom, registerCsv } from '../member-register.js';

export default function mountRegister(app, { requireSession, requirePerm }) {
  app.get('/api/member-register/filters', requireSession, requirePerm('members.view'), async (_req, res) => {
    try {
      const [rows, links] = await Promise.all([listMembers({}), registerLinks()]);
      res.json(registerFilterOptions(rows, links));
    } catch (err) {
      const explained = explainCatalyst(err);
      res.status(explained?.status ?? 503).json({ error: explained?.message ?? `The filters could not be loaded: ${err.message}` });
    }
  });

  app.get('/api/member-register/export', requireSession, requirePerm('members.export'), async (req, res) => {
    if (!can(req.session.role, 'members.pii')) {
      return res.status(403).json({ error: 'You do not have access to this.', needs: ['members.pii'], youAre: roleById(req.session.role).name });
    }
    try {
      const filters = filtersFrom(req.query);
      const [all, links] = await Promise.all([
        listMembers({ search: req.query.q, loc: req.query.loc, status: req.query.status }),
        registerLinks(),
      ]);
      const rows = applyRegisterFilters(all, filters, links);
      const csv = await registerCsv(rows, links);
      await writeAudit({
        actor: req.user.name, role: roleById(req.session.role).name,
        action: 'Exported the member register (CSV)', module: 'Members', record: `${rows.length} members`,
        before: null,
        after: { members: rows.length, search: req.query.q || null, status: req.query.status || null, ...(filters || {}) },
        remark: '', ip: req.ip || '',
      }).catch(() => {});
      const day = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="members-${day}.csv"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(csv);
    } catch (err) {
      const explained = explainCatalyst(err);
      res.status(explained?.status ?? 503).json({ error: explained?.message ?? `The file could not be made: ${err.message}` });
    }
  });
}
