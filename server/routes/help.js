/* The help bot's questions (FOR-CONSOLE-HELP-BOT.md), for the office to grow the FAQ.

   Members ask the help bot in the app (Menu > Help). It answers from the FAQ files in Catalyst QuickML; when the FAQ has nothing,
   or the member says the answer did not help, the question lands in "Needs attention". Nothing here is approved or answered:
   the member already had the answer or the "Talk to us" button. The list is the to-do list for the FAQ files.

     GET /api/help-questions?show=attention|answered|all     community.moderate

   Questions can hold personal words even with the numbers taken out, so only the moderators see them, like prayer requests. */

import { noahConfigured, listHelpQuestions, NoahApiError } from '../noah-api.js';

const SHOW = { attention: 'false', answered: 'true', all: 'all' };

const asBool = (v) => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : null);

/** One question as the screen shows it. */
export function shapeQuestion(q) {
  const at = q.at ? new Date(q.at) : null;
  const answered = asBool(q.answered) === true;
  const helpful = asBool(q.helpful);
  return {
    id: String(q.id),
    question: String(q.question || '').trim(),
    answer: q.answer ? String(q.answer) : null,
    answered,
    helpful,
    /* Why it is on the to-do list: the FAQ had nothing, or the member said the answer did not help. */
    problem: !answered ? 'none' : helpful === false ? 'unhelpful' : null,
    memberId: q.memberId != null ? String(q.memberId) : null,
    memberName: String(q.memberName || '').trim(),
    at: at && !Number.isNaN(+at) ? at : null,
  };
}

export default function mountHelp(app, { requireSession, requirePerm }) {
  app.get('/api/help-questions', requireSession, requirePerm('community.moderate'), async (req, res) => {
    if (!noahConfigured()) return res.json({ rows: [], needsAdminKey: true });
    const show = SHOW[req.query.show] ? String(req.query.show) : 'attention';
    try {
      const rows = (await listHelpQuestions(SHOW[show], 200)).map(shapeQuestion);
      res.json({ rows, show });
    } catch (err) {
      /* An app server without the help bot yet answers 404: say so plainly. */
      if (err instanceof NoahApiError && err.status === 404) {
        return res.status(502).json({ error: 'The app\'s server does not have the help bot yet. Ask the app developer to deploy it.', code: 'not_in_api' });
      }
      if (err instanceof NoahApiError) return res.status(502).json({ error: err.message, code: err.code });
      res.status(502).json({ error: `The help bot's questions could not be read: ${err.message}` });
    }
  });
}
