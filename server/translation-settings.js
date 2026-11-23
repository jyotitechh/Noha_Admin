/* Which languages the office has content translated into.

   Chosen in Content > Languages and kept in Catalyst, in the app's own settings table `globalSettings`, as one row:
   keyCol "console.translateTo", value "kn,hi" (two-letter codes, server/translate.js). Keeping it in the project, not in
   this server's settings, means a language the office switches on stays on across deploys and is visible to the Noah API.

   Until the office has chosen, CONTENT_TRANSLATE_TO decides (default Kannada). Off Catalyst (the sample data) the choice is
   kept in memory. */

import { io, NOAH_TABLES as T } from './noah-schema.js';
import { onCatalyst } from './content.js';
import { parseLanguages, targetLanguages } from './translate.js';

export const SETTING_KEY = 'console.translateTo';
const CACHE_MS = 60_000;

let cached = null;
let cachedAt = 0;
let memory = null;

const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const live = (r) => !(r.isArchived === 1 || r.isArchived === '1' || r.isArchived === true);

async function settingRow() {
  const rows = await io.getRows(T.globalSettings);
  return rows.filter((r) => String(r.keyCol ?? '') === SETTING_KEY && live(r))
    .sort((a, b) => String(b.MODIFIEDTIME ?? '').localeCompare(String(a.MODIFIEDTIME ?? '')))[0] || null;
}

/** { languages: ['kn', ...], chosen: true when the office picked them, false when it is the default } */
export async function chosenLanguages() {
  if (!onCatalyst()) return memory ? { languages: memory, chosen: true } : { languages: targetLanguages(), chosen: false };
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  try {
    const row = await settingRow();
    cached = row ? { languages: parseLanguages(row.value), chosen: true } : { languages: targetLanguages(), chosen: false };
  } catch (err) {
    /* No settings table, or Catalyst is not answering: translate as the server is set up to, and try again next time. */
    console.error(`[translation] the chosen languages could not be read: ${err.message}`);
    return { languages: targetLanguages(), chosen: false };
  }
  cachedAt = Date.now();
  return cached;
}

/** Save the office's choice. `languages` is a list of codes; ones the app does not know are dropped. Returns what was saved. */
export async function saveChosenLanguages(languages) {
  const list = parseLanguages(languages);
  if (!onCatalyst()) {
    memory = list;
    return list;
  }
  const row = await settingRow();
  const value = list.join(',');
  if (row) await io.update(T.globalSettings, { ROWID: String(row.ROWID), value, updatedOn: stamp() });
  else await io.insert(T.globalSettings, { keyCol: SETTING_KEY, value, createdOn: stamp(), updatedOn: stamp(), isArchived: 0 });
  cached = { languages: list, chosen: true };
  cachedAt = Date.now();
  return list;
}

export const forgetChosenLanguages = () => { cached = null; };
