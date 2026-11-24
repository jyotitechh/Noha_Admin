/* Which languages the app's content is translated into: every language the Noah app offers besides English (Hindi, Marathi,
   Telugu, Malayalam, Tamil and Kannada; server/translate.js). The office does not choose: every entry saved is translated
   into all of them. A language added to TRANSLATION_LANGUAGES is translated into from the next deploy. */

import { TRANSLATION_LANGUAGES } from './translate.js';

const ALL = TRANSLATION_LANGUAGES.filter((l) => l.iso !== 'en').map((l) => l.iso);

/** { languages: ['hi', 'mr', ...] }: every language content is translated into. */
export async function chosenLanguages() {
  return { languages: ALL.slice(), chosen: true };
}

/** Kept for /api/refresh: there is nothing cached any more. */
export const forgetChosenLanguages = () => {};
