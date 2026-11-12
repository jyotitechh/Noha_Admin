/* The office's three manual checks on a registration (ID readable, photograph matches the ID, video clear and audible).

   There is no column for them in the Catalyst tables, so they are kept here, by registration id, for as long as this server runs.
   That is as long as the review takes: they are ticks while looking at the uploads, not a decision, and the decision (approve,
   return the video, reject) is what is recorded, with who made it. A restart or a new deployment clears them.

   Before this, ticking one on a live registration did nothing: the route looked the registration up in the sample data, which holds
   none of the real ones, answered "not found", and the button seemed dead. */

export const CHECK_KEYS = ['idReadable', 'photoMatchesId', 'videoAudible'];

const saved = new Map();   /* registration id -> { idReadable?, photoMatchesId?, videoAudible? } */

/** A registration with the office's ticks laid over it. */
export function withChecks(reg) {
  if (!reg) return reg;
  const mine = saved.get(String(reg.id));
  return mine ? { ...reg, checks: { ...reg.checks, ...mine } } : reg;
}

/** Only the three known checks, and only true, false, or null (not yet checked). Anything else is ignored. */
export function pickChecks(body) {
  const out = {};
  for (const k of CHECK_KEYS) {
    if (body && Object.prototype.hasOwnProperty.call(body, k) && (body[k] === true || body[k] === false || body[k] === null)) out[k] = body[k];
  }
  return out;
}

export function saveChecks(regId, patch) {
  saved.set(String(regId), { ...(saved.get(String(regId)) || {}), ...patch });
  return saved.get(String(regId));
}
