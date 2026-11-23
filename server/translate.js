/* Machine translation through Zoho's Deluge translate task.

   `zoho.ai.translate(text, target, source)` runs only inside a Deluge script
   (https://www.zoho.com/deluge/help/ai-tasks/translate.html), so the console calls a small Deluge function
   that does it and is published as a REST API in a Zoho product the office already has (Zoho CRM: Setup >
   Developer Hub > Functions > "REST API" with an API key). docs/TRANSLATION.md has the function to paste.

     ZOHO_TRANSLATE_URL     that function's REST API address, with its key (zapikey=...). A secret: .env.local only.
     CONTENT_TRANSLATE_TO   the languages to translate into until the office chooses them in Content > Languages
                            (server/translation-settings.js), as two-letter codes, comma-separated. Default: kn (Kannada).

   The function is called with { text, target, source } and answers { translated } or { error } (docs/TRANSLATION.md has it).
   The console also accepts the answer as Zoho CRM wraps it ({ details: { output } }), as Deluge's own map
   ({ translation: [{ translate }] }), or as plain text. */

/* Every language content can be in: the number the app stores in `contentLanguage` (docs/FOR-FLUTTER-TRANSLATIONS.md) and the
   two-letter code Zoho's translate takes. The one list the console reads: the language box on every form, the Languages screen
   and the translations all come from here.

   To add a language later: one line here with the next number (8, 9...) and its code from Zoho's list
   (https://www.zoho.com/deluge/help/ai-tasks/translate.html), and the same number in the app's language list. Nothing else. */
export const TRANSLATION_LANGUAGES = [
  { iso: 'en', code: 1, name: 'English', native: 'English' },
  { iso: 'hi', code: 2, name: 'Hindi', native: 'हिन्दी' },
  { iso: 'mr', code: 3, name: 'Marathi', native: 'मराठी' },
  { iso: 'te', code: 4, name: 'Telugu', native: 'తెలుగు' },
  { iso: 'ml', code: 5, name: 'Malayalam', native: 'മലയാളം' },
  { iso: 'ta', code: 6, name: 'Tamil', native: 'தமிழ்' },
  { iso: 'kn', code: 7, name: 'Kannada', native: 'ಕನ್ನಡ' },
];
export const LANGUAGE_CODES = Object.fromEntries(TRANSLATION_LANGUAGES.map((l) => [l.iso, l.code]));
export const LANGUAGE_NAMES = Object.fromEntries(TRANSLATION_LANGUAGES.map((l) => [l.iso, l.name]));
export const isoOf = (contentLanguage) =>
  Object.keys(LANGUAGE_CODES).find((k) => LANGUAGE_CODES[k] === Number(contentLanguage)) || 'en';

const URL_ = () => String(process.env.ZOHO_TRANSLATE_URL || '').trim();
/* https only; plain http only to this machine, for the offline stand-in. */
export const translationReady = () => /^https:\/\//.test(URL_()) || /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL_());

/** Language codes out of a list or "kn, hi": only ones the app knows, never English (the original), each once, in the list's order. */
export function parseLanguages(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
  const want = new Set(list.map((s) => String(s).trim().toLowerCase()));
  return TRANSLATION_LANGUAGES.filter((l) => l.iso !== 'en' && want.has(l.iso)).map((l) => l.iso);
}

/** The languages to translate into before the office has chosen any (CONTENT_TRANSLATE_TO, default Kannada). */
export function targetLanguages() {
  return parseLanguages(process.env.CONTENT_TRANSLATE_TO ?? 'kn');
}

export class TranslateError extends Error {
  constructor(message, code = 'translate_failed') { super(message); this.code = code; }
}

/** What the translated text is, out of whichever shape the answer came in. */
function readAnswer(body) {
  let b = body;
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch { return b; }
  }
  if (b && typeof b === 'object') {
    /* The function's own refusal: { "error": "..." } (docs/TRANSLATION.md), also when Zoho CRM wraps it in details.output. */
    if (typeof b.error === 'string' && b.error) throw new TranslateError(`Zoho could not translate it: ${b.error}`);
    if (b.code && b.code !== 'success' && !b.details) throw new TranslateError(b.message || `Zoho answered ${b.code}.`);
    const out = b.translated ?? b.details?.output ?? b.output ?? b.text;
    if (out !== undefined) return readAnswer(out);
    const t = b.translation?.[0]?.translate;
    if (typeof t === 'string') return t;
    if (b.status?.code && b.status.code !== 200) throw new TranslateError(b.status.message || 'The translation failed.');
  }
  throw new TranslateError('Zoho answered, but with no translated text in it.');
}

/* How the function is called. Zoho CRM's REST functions take their arguments as one JSON value named `arguments` (the
   default, "crm"); a function in Zoho Creator or Flow, or behind another gateway, takes the JSON itself ("json").
     ZOHO_TRANSLATE_FORMAT    crm | json. Default crm.
     ZOHO_TRANSLATE_HEADERS   extra headers as JSON, e.g. {"Authorization":"Zoho-oauthtoken ..."} when the function wants a
                              token rather than the zapikey in its address. A secret: .env.local only. */
function requestFor(payload) {
  let extra = {};
  try { extra = JSON.parse(process.env.ZOHO_TRANSLATE_HEADERS || '{}') || {}; } catch { extra = {}; }
  if (String(process.env.ZOHO_TRANSLATE_FORMAT || 'crm').toLowerCase() === 'json') {
    return { headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(payload) };
  }
  return {
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...extra },
    body: new URLSearchParams({ arguments: JSON.stringify(payload) }).toString(),
  };
}

/* Zoho does not say how long a text its translate task takes, so no call sends more than this; a longer paragraph is cut at
   the ends of sentences (or, for one endless sentence, at a space) and the pieces put back together. */
export const MAX_CHARS = 3000;
const SENTENCE = /[^.!?।॥؟]+[.!?।॥؟]*["')]’”]*s*/g;

/** One paragraph in pieces of at most `limit` characters, cut at sentence ends where possible. */
export function splitForLimit(text, limit = MAX_CHARS) {
  if (text.length <= limit) return [text];
  const chunks = [];
  let cur = '';
  const flush = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ''; };
  for (let piece of text.match(SENTENCE) || [text]) {
    while (piece.length > limit) {
      let cut = piece.lastIndexOf(' ', limit);
      if (cut < limit / 2) cut = limit;
      flush();
      chunks.push(piece.slice(0, cut).trim());
      piece = piece.slice(cut);
    }
    if ((cur + piece).length > limit) flush();
    cur += piece;
  }
  flush();
  return chunks;
}

/** One call to the function. */
async function callZoho(text, target, source) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(URL_(), { method: 'POST', ...requestFor({ text, target, source }), signal: ctrl.signal });
    const raw = await res.text();
    if (!res.ok) {
      let msg = raw.slice(0, 200);
      try { const j = JSON.parse(raw); msg = j.error || j.message || j.code || msg; } catch { /* not JSON */ }
      throw new TranslateError(`Zoho refused the translation (${res.status}): ${msg}`);
    }
    return String(readAnswer(raw)).trim();
  } catch (err) {
    if (err instanceof TranslateError) throw err;
    throw new TranslateError(err.name === 'AbortError' ? 'Zoho took too long to translate.' : `Zoho could not be reached: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** One text, translated. Empty text is not sent; a long one goes in pieces. */
export async function translateText(text, target, source = 'en') {
  const s = String(text ?? '');
  if (!s.trim()) return s;
  if (!translationReady()) throw new TranslateError('Translation is not set up: ZOHO_TRANSLATE_URL is empty.', 'not_set_up');
  const out = [];
  for (const piece of splitForLimit(s.trim())) out.push(await callZoho(piece, target, source));
  return out.join(' ');
}

/* ---------- formatted text ---------- */

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decode = (s) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/* The parts of the editor's HTML that hold words: paragraphs and headings, and list items without a paragraph inside.
   Each part is translated as a whole, so a sentence is never cut in two; bold and italic inside it are not kept. */
const BLOCK = /<(p|h[1-4])>([\s\S]*?)<\/\1>|<li>((?:(?!<\/?(?:p|ul|ol|li)\b)[\s\S])*?)<\/li>/g;

/** Several texts in as few calls as can be trusted: one per text (Zoho counts each call). */
async function translateAll(texts, target, source) {
  const out = [];
  for (const t of texts) out.push(t.trim() ? await translateText(t, target, source) : t);
  return out;
}

/**
 * Formatted text (a message, prayer or meaning from the editor), translated block by block with the blocks kept. Text saved before
 * the editor existed (no tags) is translated line by line.
 */
export async function translateHtml(html, target, source = 'en') {
  const s = String(html ?? '');
  if (!s.trim()) return s;
  if (!/<\/?[a-z][\s\S]*>/i.test(s)) {
    const lines = s.split(/\r?\n/);
    return (await translateAll(lines, target, source)).join('\n');
  }
  const parts = [];
  s.replace(BLOCK, (m, tag, inner, liInner) => { parts.push(decode(inner ?? liInner ?? '').trim()); return m; });
  const done = await translateAll(parts, target, source);
  let i = 0;
  return s.replace(BLOCK, (m, tag) => {
    const text = escapeHtml(done[i++] ?? '').replace(/\n/g, '<br>');
    return tag ? `<${tag}>${text}</${tag}>` : `<li>${text}</li>`;
  });
}
