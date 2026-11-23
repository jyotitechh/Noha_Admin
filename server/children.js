/* Children: the office's list, and the notice at 15 (FOR-CONSOLE-CHILDREN.md).

   The Noah API tells both parents, once, when a child is 15 or more: press Make member, give the child's own number and the
   Aadhaar. It does this when a parent opens Family in the app, and when it is asked to by POST /admin/children/age-notices,
   which is safe to call as often as you like (nobody is told twice). The note asks for that call once a day; this server
   makes it every few hours, so a family that never opens the app is still told.

     CHILD_NOTICE_SWEEP          on | off. On by default in production, off otherwise (as EVENT_SWEEP).
     CHILD_NOTICE_SWEEP_HOURS    how often, 1 to 24. Default 6.

   The office can also send them at once from the Children list (POST /api/children/age-notices). */

import { noahConfigured, childAgeNotices, NoahApiError } from './noah-api.js';

let running = false;

/** Ask the Noah API to tell everyone who is due. Returns { checked, sent }, or { error } when it could not be asked. */
export async function sendAgeNotices({ actor = 'Console (scheduled)' } = {}) {
  if (!noahConfigured()) return { error: 'The Noah API is not connected, so the notices cannot be sent.', code: 'no_api' };
  if (running) return { error: 'The notices are being sent just now. Try again in a moment.', code: 'busy' };
  running = true;
  try {
    const out = await childAgeNotices({ actor });
    const checked = Number(out?.checked ?? 0);
    const sent = Number(out?.sent ?? 0);
    if (sent > 0) console.log(`[children] told the families of ${sent} child${sent === 1 ? '' : 'ren'} aged 15 or more`);
    return { checked, sent };
  } catch (err) {
    console.error(`[children] the age notices could not be sent: ${err.message}`);
    /* An API that does not have the call yet answers 404: say that plainly. */
    if (err instanceof NoahApiError && err.status === 404) {
      return { error: 'The Noah API does not offer the age notices yet. Ask the app developer to deploy it.', code: 'not_in_api' };
    }
    return { error: `The Noah API refused: ${err.message}`, code: 'refused' };
  } finally {
    running = false;
  }
}

const sweepWanted = () => {
  const v = String(process.env.CHILD_NOTICE_SWEEP || '').toLowerCase();
  if (v === 'off') return false;
  return v === 'on' || process.env.NODE_ENV === 'production';
};

/** Start the timer. Safe to call once at start-up. Returns the timer, or null when it is not wanted. */
export function startChildNoticeSweep() {
  if (!sweepWanted() || !noahConfigured()) return null;
  const hours = Math.min(24, Math.max(1, Number(process.env.CHILD_NOTICE_SWEEP_HOURS) || 6));
  const timer = setInterval(() => { sendAgeNotices(); }, hours * 3_600_000);
  timer.unref?.();
  setTimeout(() => { sendAgeNotices(); }, 180_000).unref?.();
  console.log(`  Families of children aged 15 or more are told every ${hours} hours.`);
  return timer;
}
