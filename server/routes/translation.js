/* Content > Languages: which languages the app's content is translated into, how far along each is, and filling in the rest.

     GET  /api/translation               content.edit     the languages, which are on, how much is translated, the run in progress
     PUT  /api/translation/languages     content.publish  { languages: ['kn', 'hi'] }: switch languages on or off
     POST /api/translation/run           content.publish  { languages?: [...] }: translate everything not yet translated

   Switching a language on makes every entry saved from then on translated into it; "Translate everything" does the ones
   written before. Switching one off stops new translations; the ones made stay in the app until their original is deleted. */

import { roleById } from '../db.js';
import { writeAudit } from '../store.js';
import { TRANSLATION_LANGUAGES, translationReady, parseLanguages, TranslateError } from '../translate.js';
import { chosenLanguages, saveChosenLanguages } from '../translation-settings.js';
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

  app.put('/api/translation/languages', ...manage, async (req, res) => {
    const asked = Array.isArray(req.body?.languages) ? req.body.languages : null;
    if (!asked) return res.status(400).json({ error: 'Send the languages to translate into, as a list.' });
    const unknown = asked.filter((x) => !parseLanguages([x]).length);
    if (unknown.length) return res.status(400).json({ error: `Not a language content can be translated into: ${unknown.join(', ')}.` });
    const was = (await chosenLanguages()).languages;
    let saved;
    try {
      saved = await saveChosenLanguages(asked);
    } catch (err) {
      return res.status(502).json({ error: `Catalyst refused the change: ${err.message}` });
    }
    await audit(req, 'Changed the languages content is translated into', { from: was, to: saved });
    res.json({ ok: true, on: saved, added: saved.filter((l) => !was.includes(l)) });
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
