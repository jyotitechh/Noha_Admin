/* Load the October 2026 content (october-data.js) into Catalyst.

     node server/seed-october.mjs            shows what would be added; changes nothing
     node server/seed-october.mjs --apply    adds it

   It goes through the same create path as the console, so every value is
   validated and stored the way the app expects. Anything already there, matched
   by title, is skipped, so it is safe to run twice. */

import { createContent, listContent, onCatalyst } from './content.js';
import {
  dayOf, MANNA_CATEGORIES, MANNA, PRAYERS, CONFESSIONS,
  DICTIONARY_CATEGORIES, DICTIONARY, BANNERS, ANNOUNCEMENTS,
} from './october-data.js';

const APPLY = process.argv.includes('--apply');
const LANG = '1';
const ctx = { canPublish: true };

if (!onCatalyst()) {
  console.error('Not connected to Catalyst (see .env.local). Refusing to write to the sample store.');
  process.exit(1);
}

const norm = (s) => String(s || '').trim().toLowerCase();
let added = 0, skipped = 0;

/** Add each entry of a type whose title is not already there. Returns title -> id. */
async function load(typeId, titleKey, entries) {
  const have = await listContent(typeId);
  const byTitle = new Map(have.rows.map((r) => [norm(r[titleKey]), r.id]));
  for (const body of entries) {
    const key = norm(body[titleKey]);
    if (byTitle.has(key)) { skipped++; continue; }
    if (APPLY) await createContent(typeId, body, ctx);
    added++;
  }
  console.log(`  ${typeId.padEnd(22)} ${APPLY ? 'added' : 'would add'} ${added - (load.last ?? 0)}`);
  load.last = added;
  return byTitle;
}
load.last = 0;

/** After categories are created, the id of each by its name. */
async function idsOf(typeId, titleKey) {
  const { rows } = await listContent(typeId);
  return new Map(rows.map((r) => [norm(r[titleKey]), r.id]));
}

console.log(APPLY ? 'Adding October 2026 content to Catalyst\n' : 'DRY RUN. Nothing is written. Add --apply to write.\n');

await load('mannaCategories', 'title', MANNA_CATEGORIES.map((c) => ({ ...c, contentLanguage: LANG, status: true })));
await load('dictionaryCategories', 'name', DICTIONARY_CATEGORIES.map((c) => ({ ...c, contentLanguage: LANG })));

const mannaCat = APPLY ? await idsOf('mannaCategories', 'title') : new Map();
const dictCat = APPLY ? await idsOf('dictionaryCategories', 'name') : new Map();

await load('manna', 'title', MANNA.map(([d, cat, title, content, prayer]) => ({
  title, publishDate: dayOf(d), categoryIds: mannaCat.get(norm(cat)) || '', content, prayer,
  contentLanguage: LANG, published: true,
})));

await load('prayers', 'title', PRAYERS.map(([d, title, content]) => ({
  title, content, publishedDate: dayOf(d), contentLanguage: LANG, published: true,
})));

await load('confessions', 'title', CONFESSIONS.map(([d, title, content, prayer]) => ({
  title, content, prayer, publishDate: dayOf(d), contentLanguage: LANG, published: true,
})));

await load('dictionary', 'title', DICTIONARY.map(([d, cat, title, content, featured]) => ({
  title, content, categoryId: dictCat.get(norm(cat)) || '', publishedDate: dayOf(d),
  contentLanguage: LANG, isFeatured: featured, published: true,
})));

await load('banners', 'caption', BANNERS.map((b) => ({
  caption: b.caption, expiryTime: b.until, orderCol: b.order, contentLanguage: LANG,
})));

await load('announcements', 'title', ANNOUNCEMENTS);

console.log(`\n${APPLY ? 'Added' : 'Would add'} ${added}, already there ${skipped}.`);
