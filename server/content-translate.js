/* The app's written content in other languages, translated by Zoho (server/translate.js).

   Which content: the Daily Manna, Daily Prayers, Confessions, the dream dictionary and the Bible commentary (TRANSLATED below:
   the tables that have `translatingParentId`). Into which languages: the ones the office switched on in Content > Languages
   (server/translation-settings.js).

   A translation is its own row in the same table: the same day, category, picture, partners-only and published state as the
   entry it was made from, its texts translated, `contentLanguage` set to the language's number (Kannada 7) and
   `translatingParentId` pointing at the original. The app shows a member the translation in their language and the original
   when there is none (docs/FOR-FLUTTER-TRANSLATIONS.md).

   When the office saves an entry, each language gets its row: made the first time, brought in step after that. Only the texts
   that changed in the original are translated again, so a correction the office made to a translation by hand survives an edit
   to another text. "Translate again" translates everything afresh. Publishing or taking down the original does the same to its
   translations; deleting it deletes them. Switching a language on later, "Translate everything" fills in what was written
   before. A translation that fails never stops the original from being saved. */

import { io } from './noah-schema.js';
import { onCatalyst, tableIdFor } from './content.js';
import { typeById } from './content-types.js';
import { wordCount } from './rich.js';
import { chosenLanguages } from './translation-settings.js';
import {
  translateText, translateHtml, translationReady, isoOf, LANGUAGE_CODES, LANGUAGE_NAMES, TranslateError,
} from './translate.js';

/* What is translated in each kind, and how: html for the editor's formatted text. Only texts the console writes. */
export const TRANSLATED = {
  manna: { texts: [{ key: 'title' }, { key: 'content', html: true }, { key: 'prayer', html: true }], words: 'numberOfWords' },
  prayers: { texts: [{ key: 'title' }, { key: 'content', html: true }] },
  confessions: { texts: [{ key: 'title' }, { key: 'content', html: true }] },
  dictionary: { texts: [{ key: 'title' }, { key: 'content', html: true }] },
  bibleCommentary: { texts: [{ key: 'title' }, { key: 'content', html: true }] },
};
export const isTranslated = (typeId) => typeId in TRANSLATED;

const same = (a, b) => a != null && b != null && String(a) === String(b);
const isTranslation = (r) => String(r?.translatingParentId ?? '').trim() !== '';
const archived = (r) => r.isArchived === true || r.isArchived === 'true' || r.isArchived === 1 || r.isArchived === '1';

/* Never copied from the original: Catalyst's own, the counts members made, the stamps, and who wrote the translation. */
const NOT_COPIED = new Set([
  'ROWID', 'CREATEDTIME', 'MODIFIEDTIME', 'CREATORID', 'id', 'likes', 'comments', 'shares', 'counter', 'counterUpdatedOn',
  'created', 'updated', 'createdOn', 'updatedOn', 'createdBy', 'updatedBy', 'translatorId', 'translatingParentId',
  'contentLanguage', 'numberOfWords', 'digestFeaturedAt', 'weeklyDigestWeek', 'weeklyDigestYear',
]);

/** fn over items, `limit` at a time, the answers in the items' order. */
async function inTurns(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

async function tableOf(typeId) {
  return tableIdFor(typeById(typeId));
}

/** An entry's row, as stored. */
export async function entryRow(typeId, id) {
  if (!onCatalyst() || !isTranslated(typeId)) return null;
  return (await io.getRows(await tableOf(typeId))).find((r) => same(r.ROWID, id)) || null;
}

/** The original just made with this title: Catalyst's answer to an insert is not trusted for the id (see noah-schema.js). */
export async function newestEntryId(typeId, title) {
  if (!onCatalyst() || !isTranslated(typeId)) return null;
  const key = typeById(typeId).title;
  const hit = (await io.getRows(await tableOf(typeId)))
    .filter((r) => String(r[key] ?? '') === String(title ?? '') && !isTranslation(r))
    .sort((a, b) => String(b.CREATEDTIME).localeCompare(String(a.CREATEDTIME)))[0];
  return hit ? String(hit.ROWID) : null;
}

/**
 * Bring an entry's translations in step with it. `before` is the row as it was before an edit (null for a new entry, or to
 * translate everything again). `languages` limits it to some languages (the default is every one switched on); `rows` is the
 * table already read, so a long run does not read it again for every entry.
 * Returns { ready, results: [{ lang, name, ok, action, translated, error }] }.
 */
export async function syncTranslations(typeId, id, { before = null, languages = null, rows = null } = {}) {
  if (!onCatalyst() || !isTranslated(typeId)) return { ready: false, results: [] };
  const targets = languages || (await chosenLanguages()).languages;
  if (!translationReady() || !targets.length) return { ready: false, results: [] };

  const def = typeById(typeId);
  const { texts, words } = TRANSLATED[typeId];
  const tid = await tableIdFor(def);
  const all = rows || await io.getRows(tid);
  const parent = all.find((r) => same(r.ROWID, id));
  /* A translation is not translated again; nor is an entry that has gone. */
  if (!parent || isTranslation(parent)) return { ready: true, results: [] };
  const source = isoOf(parent.contentLanguage);
  const textKeys = new Set(texts.map((t) => t.key));

  const meta = {};
  for (const [k, v] of Object.entries(parent)) if (!NOT_COPIED.has(k) && !textKeys.has(k) && v !== null && v !== undefined) meta[k] = v;

  /* Three languages at a time: each is its own row, and Zoho answers each call in a second or two. */
  const results = await inTurns(targets.filter((l) => l !== source), 3, async (lang) => {
    const name = LANGUAGE_NAMES[lang];
    const mine = all.find((r) => same(r.translatingParentId, parent.ROWID) && Number(r.contentLanguage) === LANGUAGE_CODES[lang]);
    /* What to translate: everything for a new translation or a fresh start, else only what changed in the original. */
    const due = texts.filter((t) => !mine || !before || String(before[t.key] ?? '') !== String(parent[t.key] ?? ''));
    try {
      const done = {};
      for (const t of due) {
        done[t.key] = t.html ? await translateHtml(parent[t.key], lang, source) : await translateText(parent[t.key], lang, source);
      }
      if (words && 'content' in done) done[words] = wordCount(done.content);
      if (mine) {
        await io.update(tid, { ROWID: String(mine.ROWID), ...meta, ...done, [def.stamps?.updated || 'updated']: stamp() });
        return { lang, name, ok: true, action: due.length ? 'updated' : 'kept', translated: due.map((t) => t.key) };
      }
      await io.insert(tid, {
        ...meta, ...done,
        contentLanguage: LANGUAGE_CODES[lang], translatingParentId: String(parent.ROWID),
        ...('likes' in parent ? { likes: 0 } : {}), ...('comments' in parent ? { comments: 0 } : {}),
        [def.stamps?.created || 'created']: stamp(),
      });
      return { lang, name, ok: true, action: 'created', translated: due.map((t) => t.key) };
    } catch (err) {
      console.error(`[translation] ${def.singular} ${parent.ROWID} into ${name} failed: ${err.message}`);
      return { lang, name, ok: false, error: err instanceof TranslateError ? err.message : `Catalyst refused the ${name} copy: ${err.message}` };
    }
  });
  return { ready: true, results };
}

/** Remove an entry's translations, when the entry itself is deleted. Returns how many went. */
export async function deleteTranslations(typeId, id) {
  if (!onCatalyst() || !isTranslated(typeId)) return 0;
  const tid = await tableOf(typeId);
  const mine = (await io.getRows(tid)).filter((r) => same(r.translatingParentId, id)).map((r) => String(r.ROWID));
  if (mine.length) await io.remove(tid, mine);
  return mine.length;
}

/** What to tell the office after a save, in one sentence, or '' when there is nothing to say. */
export function describeTranslation(t) {
  if (!t?.ready || !t.results.length) return '';
  const made = t.results.filter((r) => r.ok && r.action === 'created').map((r) => r.name);
  const changed = t.results.filter((r) => r.ok && r.action === 'updated').map((r) => r.name);
  const bad = t.results.filter((r) => !r.ok);
  const and = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}` : l[0]);
  const parts = [];
  if (made.length) parts.push(`${and(made)} translation${made.length > 1 ? 's' : ''} added.`);
  if (changed.length) parts.push(`${and(changed)} translation${changed.length > 1 ? 's' : ''} updated.`);
  for (const b of bad) parts.push(`The ${b.name} translation failed: ${b.error}`);
  return parts.join(' ');
}

/* ---------- the whole library: how much is translated, and filling in the rest ---------- */

/**
 * For the Languages screen: each kind, how many originals it has and how many of them are in each language.
 * A kind whose table cannot be read is listed with `error` instead.
 */
export async function translationCoverage(languages) {
  const out = [];
  for (const typeId of Object.keys(TRANSLATED)) {
    const def = typeById(typeId);
    const row = { id: typeId, label: def.label, originals: 0, done: {} };
    if (!onCatalyst()) { out.push(row); continue; }
    try {
      const rows = await io.getRows(await tableIdFor(def));
      const originals = rows.filter((r) => !isTranslation(r) && !archived(r));
      const ids = new Set(originals.map((r) => String(r.ROWID)));
      row.originals = originals.length;
      for (const lang of languages) {
        const code = LANGUAGE_CODES[lang];
        /* An original already written in this language counts as done. */
        const have = new Set(rows.filter((r) => isTranslation(r) && Number(r.contentLanguage) === code && ids.has(String(r.translatingParentId)))
          .map((r) => String(r.translatingParentId)));
        row.done[lang] = originals.filter((r) => have.has(String(r.ROWID)) || Number(r.contentLanguage) === code).length;
      }
    } catch (err) {
      row.error = err.message;
    }
    out.push(row);
  }
  return out;
}

/* One run at a time. Its progress, for the Languages screen to show. */
let job = null;
export const translationJob = () => (job ? { ...job, failures: job.failures.slice(0, 20) } : null);

/**
 * Translate everything not yet in these languages, in the background, one entry after another (Zoho is asked one text at a
 * time). Returns the job; throws a TranslateError when one is already running or translation is not set up.
 */
export async function startTranslateAll(languages, { actor = '' } = {}) {
  if (!translationReady()) throw new TranslateError('Translation is not set up on this console yet.', 'not_set_up');
  if (job?.running) throw new TranslateError('Everything is being translated already. Wait for it to finish.', 'busy');
  if (!languages.length) throw new TranslateError('Switch on a language first.', 'no_language');

  /* What is missing, kind by kind: the work list, so the screen can say "12 of 40". */
  const work = [];
  for (const typeId of Object.keys(TRANSLATED)) {
    let rows;
    try { rows = await io.getRows(await tableIdFor(typeById(typeId))); } catch { continue; }
    for (const r of rows.filter((x) => !isTranslation(x) && !archived(x))) {
      const missing = languages.filter((lang) => Number(r.contentLanguage) !== LANGUAGE_CODES[lang]
        && !rows.some((t) => same(t.translatingParentId, r.ROWID) && Number(t.contentLanguage) === LANGUAGE_CODES[lang]));
      if (missing.length) work.push({ typeId, id: String(r.ROWID), title: String(r[typeById(typeId).title] ?? ''), missing });
    }
  }

  job = {
    running: true, actor, languages, startedAt: new Date().toISOString(), finishedAt: null,
    total: work.length, done: 0, made: 0, failed: 0, failures: [], current: '',
  };
  const mine = job;
  (async () => {
    for (const w of work) {
      if (job !== mine) return;
      mine.current = `${typeById(w.typeId).label}: ${w.title}`;
      try {
        const t = await syncTranslations(w.typeId, w.id, { languages: w.missing });
        mine.made += t.results.filter((r) => r.ok && r.action === 'created').length;
        for (const r of t.results.filter((x) => !x.ok)) {
          mine.failed += 1;
          mine.failures.push({ what: mine.current, lang: r.name, error: r.error });
        }
        /* Zoho not set up or refusing every call: stop rather than fail the same way hundreds of times. */
        if (t.results.length && t.results.every((r) => !r.ok) && mine.failed >= 5 && mine.made === 0) {
          mine.stopped = 'Zoho refused every translation, so the rest were not tried. Check the translate function, then start again.';
          break;
        }
      } catch (err) {
        mine.failed += 1;
        mine.failures.push({ what: mine.current, lang: '', error: err.message });
      }
      mine.done += 1;
    }
    mine.running = false;
    mine.current = '';
    mine.finishedAt = new Date().toISOString();
    console.log(`[translation] translate everything finished: ${mine.made} made, ${mine.failed} failed, of ${mine.total} entries`);
  })();
  return translationJob();
}
