/* Daily Manna in other languages, translated by Zoho (server/translate.js).

   The app shows a member the Daily Manna in their language, and English when there is none for the day
   (docs/FLUTTER-CONTENT-INTEGRATION.md). A translation is therefore its own `dailyMana` row: the same day, category,
   picture and published state, the title, message and prayer translated, `contentLanguage` set to the language's number
   (Kannada 7) and `translatingParentId` pointing at the entry it was made from.

   When the office saves an entry, each language in CONTENT_TRANSLATE_TO gets its row: made the first time, brought in
   step after that. Only the texts that changed in the original are translated again, so a correction the office made to
   the Kannada title by hand survives an edit to the English message. "Translate again" translates everything afresh.
   Deleting an entry deletes its translations. A translation that fails never stops the original from being saved. */

import { io } from './noah-schema.js';
import { onCatalyst, tableIdFor } from './content.js';
import { typeById } from './content-types.js';
import { wordCount } from './rich.js';
import {
  translateText, translateHtml, translationReady, targetLanguages, isoOf, LANGUAGE_CODES, LANGUAGE_NAMES, TranslateError,
} from './translate.js';

const MANNA = () => typeById('manna');
const same = (a, b) => a != null && b != null && String(a) === String(b);

/* The texts translated, and how. */
const TEXTS = [
  { key: 'title', html: false },
  { key: 'content', html: true },
  { key: 'prayer', html: true },
];
/* Never copied from the original: Catalyst's own, the counts members made, and who wrote the translation. */
const NOT_COPIED = new Set([
  'ROWID', 'CREATEDTIME', 'MODIFIEDTIME', 'CREATORID', 'id', 'likes', 'comments', 'shares', 'counter', 'counterUpdatedOn',
  'created', 'updated', 'createdBy', 'updatedBy', 'translatorId', 'translatingParentId', 'contentLanguage', 'numberOfWords',
  'digestFeaturedAt', 'weeklyDigestWeek', 'weeklyDigestYear',
  ...TEXTS.map((t) => t.key),
]);

const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

async function rows() {
  return io.getRows(await tableIdFor(MANNA()));
}

/** The row of an entry, as stored. */
export async function mannaRow(id) {
  if (!onCatalyst()) return null;
  return (await rows()).find((r) => same(r.ROWID, id)) || null;
}

/** The entry just made with this title: Catalyst's answer to an insert is not trusted for the id (see noah-schema.js). */
export async function newestMannaId(title) {
  if (!onCatalyst()) return null;
  const hit = (await rows())
    .filter((r) => String(r.title ?? '') === String(title ?? '') && !String(r.translatingParentId ?? '').trim())
    .sort((a, b) => String(b.CREATEDTIME).localeCompare(String(a.CREATEDTIME)))[0];
  return hit ? String(hit.ROWID) : null;
}

/**
 * Bring an entry's translations in step with it. `before` is the row as it was before an edit (null for a new entry, or
 * to translate everything again). Returns { ready, results: [{ lang, name, ok, action, error }] }.
 */
export async function syncMannaTranslations(id, { before = null } = {}) {
  if (!onCatalyst()) return { ready: false, results: [] };
  const targets = targetLanguages();
  if (!translationReady() || !targets.length) return { ready: false, results: [] };

  const tid = await tableIdFor(MANNA());
  const all = await io.getRows(tid);
  const parent = all.find((r) => same(r.ROWID, id));
  /* A translation is not translated again; nor is an entry that has gone. */
  if (!parent || String(parent.translatingParentId ?? '').trim()) return { ready: true, results: [] };
  const source = isoOf(parent.contentLanguage);

  const meta = {};
  for (const [k, v] of Object.entries(parent)) if (!NOT_COPIED.has(k) && v !== null && v !== undefined) meta[k] = v;

  const results = [];
  for (const lang of targets.filter((l) => l !== source)) {
    const name = LANGUAGE_NAMES[lang];
    const mine = all.find((r) => same(r.translatingParentId, parent.ROWID) && Number(r.contentLanguage) === LANGUAGE_CODES[lang]);
    /* What to translate: everything for a new translation or a fresh start, else only what changed in the original. */
    const due = TEXTS.filter((t) => !mine || !before || String(before[t.key] ?? '') !== String(parent[t.key] ?? ''));
    try {
      const done = {};
      for (const t of due) {
        done[t.key] = t.html ? await translateHtml(parent[t.key], lang, source) : await translateText(parent[t.key], lang, source);
      }
      if ('content' in done) done.numberOfWords = wordCount(done.content);
      if (mine) {
        await io.update(tid, { ROWID: String(mine.ROWID), ...meta, ...done, updated: stamp() });
        results.push({ lang, name, ok: true, action: due.length ? 'updated' : 'kept', translated: due.map((t) => t.key) });
      } else {
        await io.insert(tid, {
          ...meta, ...done,
          contentLanguage: LANGUAGE_CODES[lang], translatingParentId: String(parent.ROWID), likes: 0, created: stamp(),
        });
        results.push({ lang, name, ok: true, action: 'created', translated: due.map((t) => t.key) });
      }
    } catch (err) {
      console.error(`[manna] the ${name} translation of ${parent.ROWID} failed: ${err.message}`);
      results.push({ lang, name, ok: false, error: err instanceof TranslateError ? err.message : `Catalyst refused the ${name} copy: ${err.message}` });
    }
  }
  return { ready: true, results };
}

/** Remove an entry's translations, when the entry itself is deleted. Returns how many went. */
export async function deleteMannaTranslations(id) {
  if (!onCatalyst()) return 0;
  const tid = await tableIdFor(MANNA());
  const mine = (await io.getRows(tid)).filter((r) => same(r.translatingParentId, id)).map((r) => String(r.ROWID));
  if (mine.length) await io.remove(tid, mine);
  return mine.length;
}

/** What to tell the office after a save, in one sentence, or '' when translation is not set up. */
export function describeTranslation(t) {
  if (!t?.ready || !t.results.length) return '';
  const ok = t.results.filter((r) => r.ok && r.action !== 'kept').map((r) => r.name);
  const bad = t.results.filter((r) => !r.ok);
  const parts = [];
  if (ok.length) parts.push(`${ok.join(' and ')} translation ${t.results.some((r) => r.action === 'created') ? 'added' : 'updated'}.`);
  for (const b of bad) parts.push(`The ${b.name} translation failed: ${b.error}`);
  return parts.join(' ');
}
