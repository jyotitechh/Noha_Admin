/* Machine translation through Zoho's Deluge translate task.

   `zoho.ai.translate(text, target, source)` runs only inside a Deluge script
   (https://www.zoho.com/deluge/help/ai-tasks/translate.html), so the console calls a small Deluge function
   that does it and is published as a REST API in a Zoho product the office already has (Zoho CRM: Setup >
   Developer Hub > Functions > "REST API" with an API key). docs/KANNADA-TRANSLATION.md has the function to paste.

     ZOHO_TRANSLATE_URL     that function's REST API address, with its key (zapikey=...). A secret: .env.local only.
     CONTENT_TRANSLATE_TO   the languages to translate into, as two-letter codes, comma-separated. Default: kn (Kannada).

   The function is called with the arguments { text, target, source } and answers the translated text. The
   console accepts the answer as Zoho CRM wraps it ({ details: { output } }), as Deluge's own map
   ({ translation: [{ translate }] }), or as plain text. */

/** The app's contentLanguage numbers (docs/FLUTTER-CONTENT-INTEGRATION.md), by the ISO code Deluge uses. */
export const LANGUAGE_CODES = { en: 1, hi: 2, mr: 3, te: 4, ml: 5, ta: 6, kn: 7 };
export const LANGUAGE_NAMES = { en: 'English', hi: 'Hindi', mr: 'Marathi', te: 'Telugu', ml: 'Malayalam', ta: 'Tamil', kn: 'Kannada' };
export const isoOf = (contentLanguage) =>
  Object.keys(LANGUAGE_CODES).find((k) => LANGUAGE_CODES[k] === Number(contentLanguage)) || 'en';

const URL_ = () => String(process.env.ZOHO_TRANSLATE_URL || '').trim();
/* https only; plain http only to this machine, for the offline stand-in. */
export const translationReady = () => /^https:\/\//.test(URL_()) || /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL_());

/** The languages Daily Manna is translated into, as ISO codes the app knows. */
export function targetLanguages() {
  const raw = String(process.env.CONTENT_TRANSLATE_TO ?? 'kn');
  return [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => LANGUAGE_CODES[s] && s !== 'en'))];
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
    if (b.code && b.code !== 'success' && !b.details) throw new TranslateError(b.message || `Zoho answered ${b.code}.`);
    const out = b.details?.output ?? b.output ?? b.translated ?? b.text;
    if (out !== undefined) return readAnswer(out);
    const t = b.translation?.[0]?.translate;
    if (typeof t === 'string') return t;
    if (b.status?.code && b.status.code !== 200) throw new TranslateError(b.status.message || 'The translation failed.');
  }
  throw new TranslateError('Zoho answered, but with no translated text in it.');
}

/** One text, translated. Empty text is not sent. */
export async function translateText(text, target, source = 'en') {
  const s = String(text ?? '');
  if (!s.trim()) return s;
  if (!translationReady()) throw new TranslateError('Translation is not set up: ZOHO_TRANSLATE_URL is empty.', 'not_set_up');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    /* Zoho CRM's REST functions take their arguments as one JSON value named `arguments`. */
    const res = await fetch(URL_(), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ arguments: JSON.stringify({ text: s, target, source }) }).toString(),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    if (!res.ok) {
      let msg = raw.slice(0, 200);
      try { const j = JSON.parse(raw); msg = j.message || j.code || msg; } catch { /* not JSON */ }
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
 * Formatted text (the Daily Manna message or prayer), translated block by block with the blocks kept. Text saved before
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
