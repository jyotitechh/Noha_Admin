/* How far the app's content is translated, and filling in the rest.

     GET  /api/translation               content.edit     the languages, how much is translated, the run in progress
     POST /api/translation/run           content.publish  translate everything not yet translated

   Every entry is translated into every language the app offers when it is saved (server/content-translate.js), and the
   console fills in older content by itself; these calls are for checking on it. */

import { roleById } from '../db.js';
import { writeAudit } from '../store.js';
import { TRANSLATION_LANGUAGES, translationReady, parseLanguages, TranslateError } from '../translate.js';
import { chosenLanguages } from '../translation-settings.js';
import { translationCoverage, translationJob, startTranslateAll, TRANSLATED } from '../content-translate.js';
import { typeById } from '../content-types.js';
import { onCatalyst } from '../content.js';

export default function mountTranslation(app, { requireSession, requirePerm }) {
  const view = [requireSession, requirePerm('content.edit')];
  const manage = [requireSession, requirePerm('content.publish')];

  const audit = (req, action, after) => writeAudit({
    actor: req.user.name, role: roleById(req.session.role).name,
    action, module: 'Content', record: 'Languages', before: null, after, remark: '', ip: req.ip || '',
  });

  app.get('/api/translation', ...view, async (_req, res) => {
    const { languages, chosen } = await chosenLanguages();
    res.json({
      ready: translationReady(),
      source: onCatalyst() ? 'catalyst' : 'sample',
      chosen,
      on: languages,
      languages: TRANSLATION_LANGUAGES.filter((l) => l.iso !== 'en').map((l) => ({ ...l, on: languages.includes(l.iso) })),
      kinds: Object.keys(TRANSLATED).map((id) => typeById(id).label),
      /* Every language, not only the ones on: one switched off still has the translations made while it was on. */
      coverage: await translationCoverage(TRANSLATION_LANGUAGES.filter((l) => l.iso !== 'en').map((l) => l.iso)),
      job: translationJob(),
    });
  });

  app.post('/api/translation/run', ...manage, async (req, res) => {
    const on = (await chosenLanguages()).languages;
    const languages = Array.isArray(req.body?.languages) ? parseLanguages(req.body.languages).filter((l) => on.includes(l)) : on;
    try {
      const job = await startTranslateAll(languages, { actor: req.user.name });
      await audit(req, 'Started translating everything not yet translated', { languages, entries: job.total });
      res.status(202).json({ ok: true, job });
    } catch (err) {
      if (err instanceof TranslateError) return res.status(409).json({ error: err.message, code: err.code });
      throw err;
    }
  });
}
