/* A person asking for console access, from the sign-in page.

   Someone who has registered in the Noah app and been approved, but is not console staff, types their
   mobile number and asks. A super administrator then sees the request (Staff and permissions > Access
   requests) and approves it with a role, or declines. Nothing here lets anyone in: it only adds a line to
   a list that a super administrator decides on.

   It is reachable without signing in, so:

     - It never says whether a number belongs to a member, or already has access. Every answer is the same
       sentence, so it cannot be used to find out who is on the register or who is staff.
     - It is limited per address and per number, because each ask costs a look-up in Catalyst and a line on
       a super administrator's list.
     - Only an approved, active member can be put on the list; anything else is quietly ignored.
     - When the office has set a passphrase for the console, it applies here too (the caller checks it). */

import { loadMembers, mobileKey, requestConsoleAccess } from './noah-schema.js';
import { live, isNoah } from './store.js';

/** The one answer given to every request, whatever happened. */
export const REQUEST_ANSWER =
  'If that number belongs to an approved member of the church, your request has been sent to a super administrator. '
  + 'When it is approved you can sign in with the same number.';
/** The same, for a request made with an email address (the console signs in by email). */
export const REQUEST_ANSWER_EMAIL =
  'If that address belongs to an approved member of the church, your request has been sent to a super administrator. '
  + 'When it is approved you can sign in with the same address.';
const PER_EMAIL = { max: 3, per: 24 * 60 * 60 * 1000 };   /* three a day for one address */

const PER_ADDRESS = { max: 6, per: 60 * 60 * 1000 };      /* six an hour from one address */
const PER_NUMBER = { max: 3, per: 24 * 60 * 60 * 1000 };  /* three a day for one number */
const seen = new Map();

/** Count a hit against `key`; false when it is over its limit. */
function allow(key, { max, per }) {
  const now = Date.now();
  const recent = (seen.get(key) || []).filter((t) => now - t < per);
  if (recent.length >= max) { seen.set(key, recent); return false; }
  recent.push(now);
  seen.set(key, recent);
  if (seen.size > 5000) seen.delete(seen.keys().next().value);
  return true;
}

/**
 * Handle one request. Returns { status, body }: 200 with the standard answer in almost every case, 429 when
 * the limits are hit, 400 when no number was given at all.
 */
export async function handleAccessRequest({ mobile, email, note }, ip = '') {
  /* By email address: the sign-in page asks for this while signing in by number is switched off. */
  if (email !== undefined && !mobile) {
    const addr = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) {
      return { status: 400, body: { ok: false, error: 'Type the email address you registered with in the app.' } };
    }
    if (!allow('ip:' + ip, PER_ADDRESS) || !allow('email:' + addr, PER_EMAIL)) {
      return { status: 429, body: { ok: false, error: 'That is too many requests. Try again later, or ask a super administrator directly.' } };
    }
    if (live() && isNoah()) {
      try {
        const hits = (await loadMembers()).filter((m) => String(m.email || '').trim().toLowerCase() === addr
          && m.approved && !m.blocked && !m.name.startsWith('('));
        /* One member only: an address two people share cannot say whose request it is. */
        if (hits.length === 1) await requestConsoleAccess(hits[0].rowId, note);
      } catch { /* as below: the answer does not depend on it */ }
    }
    return { status: 200, body: { ok: true, message: REQUEST_ANSWER_EMAIL } };
  }

  const key = mobileKey(mobile);
  if (!key || key.length < 8) return { status: 400, body: { ok: false, error: 'Type the mobile number you registered with in the app.' } };

  if (!allow('ip:' + ip, PER_ADDRESS) || !allow('number:' + key, PER_NUMBER)) {
    return { status: 429, body: { ok: false, error: 'That is too many requests. Try again later, or ask a super administrator directly.' } };
  }

  /* Only with Catalyst: on the sample data there is no register of real members to ask from. */
  if (live() && isNoah()) {
    try {
      const member = (await loadMembers()).find((m) => mobileKey(m.mobile) === key && m.approved && !m.blocked && !m.name.startsWith('('));
      if (member) await requestConsoleAccess(member.rowId, note);
    } catch {
      /* Not told to the caller either: the answer must not depend on what happened behind it. */
    }
  }
  return { status: 200, body: { ok: true, message: REQUEST_ANSWER } };
}
