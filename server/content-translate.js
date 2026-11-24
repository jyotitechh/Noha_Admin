/* The app's written content in other languages, translated by Zoho (server/translate.js).

   Which content: the Daily Manna, Daily Prayers, Confessions, the dream dictionary and the Bible commentary (TRANSLATED below:
   the tables that have `translatingParentId`). Into which languages: every one the Noah app offers besides English
   (server/translation-settings.js).

   A translation is its own row in the same table: the same day, category, picture, partners-only and published state as the
   entry it was made from, its texts translated, `contentLanguage` set to the language's number (Kannada 7) and
   `translatingParentId` pointing at the original. The app shows a member the translation in their language and the original
   when there is none (docs/FOR-FLUTTER-TRANSLATIONS.md).

   When the office saves an entry, each language gets its row: made the first time, brought in step after that. Only the texts
   that changed in the original are translated again, so a correction the office made to a translation by hand survives an edit
   to another text. "Translate again" translates everything afresh. Publishing or taking down the original does the same to its
   translations; deleting it deletes them. The work runs in the background (translateLater), and older content is filled in by
   itself (startTranslationBackfill). A translation that fails never stops the original from being saved. */

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

  /* Every language at once: each is its own row, and a Zoho call takes a few seconds, so one after another would be slow. */
  const results = await inTurns(targets.filter((l) => l !== source), 6, async (lang) => {
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

/* ---------- in the background, one entry at a time ----------

   Translating a Daily Manna into six languages is dozens of Zoho calls, a minute or more, so a save does not wait for it: the
   work is queued and the office is told it is under way. Each entry has its own queue, so an edit, a publish or a delete made
   while its translation is still running waits its turn and is never overtaken (a delete therefore also removes the
   translations a running job was still making). The list shows "Translating" until the queue is empty. */

const chains = new Map();
const lastResult = new Map();
const keyOf = (typeId, id) => `${typeId}:${id}`;

/** Run `work` after whatever is already queued for this entry. Resolves with what `work` returns. */
function enqueue(key, work) {
  const next = (chains.get(key) || Promise.resolve()).catch(() => {}).then(work);
  chains.set(key, next);
  next.catch(() => {}).finally(() => { if (chains.get(key) === next) chains.delete(key); });
  return next;
}

/** Whether an entry's translations are being made or brought in step just now. */
export const isTranslating = (typeId, id) => chains.has(keyOf(typeId, id));

/** The languages the last run for this entry could not translate, or []. */
export const translationFailures = (typeId, id) => lastResult.get(keyOf(typeId, id))?.failed ?? [];

/** Wait for everything queued for this entry (tests, and anything that must see the finished translations). */
export const translationSettled = (typeId, id) => (chains.get(keyOf(typeId, id)) || Promise.resolve()).catch(() => {});

/**
 * Queue an entry's translations (see syncTranslations for `before`). Returns at once with what to tell the office.
 * `quiet` for a publish or take-down, where no text changed and there is nothing worth saying.
 */
export async function translateLater(typeId, id, { before = null, quiet = false } = {}) {
  if (!id || !onCatalyst() || !isTranslated(typeId)) return null;
  const { languages } = await chosenLanguages();
  if (!translationReady() || !languages.length) return null;
  const key = keyOf(typeId, id);
  enqueue(key, async () => {
    try {
      const t = await syncTranslations(typeId, id, { before });
      if (t.results.length) lastResult.set(key, { at: new Date().toISOString(), failed: t.results.filter((r) => !r.ok).map((r) => r.name) });
      const said = describeTranslation(t);
      if (said) console.log(`[translation] ${typeById(typeId).singular} ${id}: ${said}`);
    } catch (err) {
      lastResult.set(key, { at: new Date().toISOString(), failed: languages.map((l) => LANGUAGE_NAMES[l]) });
      console.error(`[translation] ${typeById(typeId).singular} ${id} could not be translated: ${err.message}`);
    }
  });
  const names = languages.map((l) => LANGUAGE_NAMES[l]);
  const and = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return { ready: true, queued: true, results: [], said: quiet ? '' : `Translating into ${and}. It takes a minute or two.` };
}

/** Queue removing an entry's translations, after anything still running for it. */
export function deleteTranslationsLater(typeId, id) {
  if (!onCatalyst() || !isTranslated(typeId)) return;
  const key = keyOf(typeId, id);
  lastResult.delete(key);
  enqueue(key, () => deleteTranslations(typeId, id).catch((err) => console.error(`[translation] removing the translations of ${id} failed: ${err.message}`)));
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
        /* In the entry's own queue, so a save made meanwhile never runs alongside it. */
        const t = await enqueue(keyOf(w.typeId, w.id), () => syncTranslations(w.typeId, w.id, { languages: w.missing }));
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

/* ---------- filling in older content by itself ----------

   Content written before a language was translated into (or whose translation failed) is filled in without anyone pressing a
   button: a few minutes after the server starts, and every few hours after, everything not yet in every language is
   translated, one entry at a time. Entries already translated are skipped, so a run with nothing to do costs only the table
   reads.

     CONTENT_TRANSLATE_BACKFILL         on | off. On by default in production, off otherwise.
     CONTENT_TRANSLATE_BACKFILL_HOURS   how often, 1 to 24. Default 6. */

const backfillWanted = () => {
  const v = String(process.env.CONTENT_TRANSLATE_BACKFILL || '').toLowerCase();
  if (v === 'off') return false;
  return v === 'on' || process.env.NODE_ENV === 'production';
};

async function backfill() {
  if (!onCatalyst() || !translationReady() || job?.running) return;
  try {
    const started = await startTranslateAll((await chosenLanguages()).languages, { actor: 'Console (by itself)' });
    if (started.total) console.log(`[translation] filling in ${started.total} entries not yet in every language`);
  } catch (err) {
    if (!(err instanceof TranslateError && err.code === 'busy')) console.error(`[translation] filling in could not start: ${err.message}`);
  }
}

/** Start the timer. Safe to call once at start-up. Returns the timer, or null when it is not wanted. */
export function startTranslationBackfill() {
  if (!backfillWanted() || !translationReady()) return null;
  const hours = Math.min(24, Math.max(1, Number(process.env.CONTENT_TRANSLATE_BACKFILL_HOURS) || 6));
  const timer = setInterval(backfill, hours * 3_600_000);
  timer.unref?.();
  setTimeout(backfill, 120_000).unref?.();
  console.log(`  Content not yet in every language is translated every ${hours} hours.`);
  return timer;
}
