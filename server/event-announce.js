/* Telling members about an event.

   The console writes events straight to the `events` table, so it asks the Noah API to announce them (the API sends the push,
   writes the member's notification row, and keeps its own once-only mark; see "Telling members about a new event" in the
   Noah backend README):

     POST /admin/events/:id/announce      one event; refused before its publish time, when hidden or archived
     POST /admin/events/announce-due      every event whose publish time passed in the last 24 hours and was not announced yet

   So there are two moments:
     - when an event is saved: announce it now (a later publish time is answered "not published yet", which is fine: the sweep sends it then);
     - every few minutes: the sweep, which is how an event saved for later goes out at its time.

   A failure to announce never fails the save. The event is saved either way, and the office is told what happened in words.

   The sweep runs inside this server, on a timer. It is on in production (the deployed API) and off elsewhere, so a developer's
   machine does not announce to real members; EVENT_SWEEP=on / off forces it, EVENT_SWEEP_MINUTES (1 to 60, default 5) sets how often.
   If the host puts the API to sleep, a Catalyst cron that calls the Noah API's announce-due with the admin key does the same job. */

import { announceEvent, announceDue, noahConfigured, NoahApiError } from './noah-api.js';

/** The office's words for what the Noah API answered. `status` is for the screen's tone. */
export function describeAnnounce(result) {
  if (result?.alreadySent) return { status: 'already', text: 'Members were already told about this event.' };
  const members = Number(result?.members) || 0;
  const pushed = Number(result?.notified) || 0;
  if (!members) return { status: 'none', text: 'There is nobody to tell yet: no approved member with the app matches who the event is for.', members, notified: pushed };
  if (!pushed) return { status: 'none', text: `${members} ${members === 1 ? 'member matches' : 'members match'}, but no phone could be reached.`, members, notified: pushed };
  return { status: 'sent', text: `Members told: ${pushed} of ${members} got a notification.`, members, notified: pushed };
}

/** The same, for a refusal or a failure. */
function describeFailure(err) {
  if (err instanceof NoahApiError) {
    if (err.code === 'not_configured') return { status: 'off', text: 'Members are not notified: the Noah API is not connected on this server.' };
    if (err.code === 'not_published_yet') {
      /* The API says the moment in UTC; the office thinks in IST. */
      const when = new Date(err.details?.publishAt);
      const at = Number.isNaN(+when) ? '' : when.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
      return { status: 'scheduled', text: at ? `Members will be told when it is published (${at} IST).` : 'Members will be told when it is published.' };
    }
    if (err.code === 'event_hidden') return { status: 'hidden', text: 'Not announced: the event is hidden from members.' };
    if (err.code === 'event_archived') return { status: 'hidden', text: 'Not announced: the event is archived.' };
    if (err.code === 'event_not_found') return { status: 'failed', text: 'The Noah API could not find this event, so members were not told.' };
    if (err.code === 'invalid_admin_key') return { status: 'failed', text: 'Members were not told: the Noah API refused the console\'s key.' };
  }
  console.error(`[events] could not announce: ${err.message}`);
  return { status: 'failed', text: 'The event is saved, but members could not be told just now. Use Tell members on the event to try again.' };
}

/** Announce one event. Never throws: the answer says what happened. */
export async function announce(id, { force = false, actor } = {}) {
  if (!noahConfigured()) return describeFailure(new NoahApiError(503, 'not_configured'));
  try {
    return describeAnnounce(await announceEvent(id, { force, actor }));
  } catch (err) {
    return describeFailure(err);
  }
}

let running = false;

/** One pass of the sweep. Returns what the Noah API said, or null when it could not be asked. */
export async function sweepOnce({ hours } = {}) {
  if (!noahConfigured() || running) return null;
  running = true;
  try {
    const out = await announceDue({ hours, actor: 'Console (scheduled)' });
    const sent = Number(out?.announced ?? out?.events?.length ?? 0);
    if (sent > 0) console.log(`[events] announced ${sent} event${sent === 1 ? '' : 's'} that came due`);
    return out;
  } catch (err) {
    console.error(`[events] the sweep for events that came due failed: ${err.message}`);
    return null;
  } finally {
    running = false;
  }
}

const sweepWanted = () => {
  const v = String(process.env.EVENT_SWEEP || '').toLowerCase();
  if (v === 'off') return false;
  return v === 'on' || process.env.NODE_ENV === 'production';
};

/** Start the timer. Safe to call once at start-up. Returns the timer, or null when it is not wanted. */
export function startEventSweep() {
  if (!sweepWanted() || !noahConfigured()) return null;
  const minutes = Math.min(60, Math.max(1, Number(process.env.EVENT_SWEEP_MINUTES) || 5));
  const timer = setInterval(() => { sweepOnce(); }, minutes * 60_000);
  timer.unref?.();
  setTimeout(() => { sweepOnce(); }, 90_000).unref?.();
  console.log(`  Events that come due are announced to members every ${minutes} minutes.`);
  return timer;
}
