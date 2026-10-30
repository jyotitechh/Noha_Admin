/* The formatted text the office writes (Daily Manna message, prayers, ...).

   The console's editor produces HTML and the Noah app renders it, so the server
   cleans it on every save: only the tags the editor can make are kept, links may
   only be http, https, mailto or tel, and nothing else (scripts, event handlers,
   styles, iframes) survives. The browser is never trusted to have done this. */

import sanitizeHtml from 'sanitize-html';

const OPTIONS = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup',
    'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'hr', 'a',
  ],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

const PLAIN = { allowedTags: [], allowedAttributes: {}, disallowedTagsMode: 'discard' };

const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** The same text with only safe formatting left. */
export const cleanHtml = (html) => sanitizeHtml(String(html ?? ''), OPTIONS).trim();

/** The words alone, with no formatting. Empty when the editor holds only empty paragraphs. */
export const plainText = (html) =>
  decode(sanitizeHtml(String(html ?? ''), PLAIN)).replace(/\s+/g, ' ').trim();

export const wordCount = (html) => {
  const t = plainText(html);
  return t ? t.split(' ').length : 0;
};
