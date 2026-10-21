/* Sign-in for the admin console.

   NO ZOHO SINGLE SIGN-ON. This is a local email + one-time-code flow that
   stands in for it, so the console can be run and demonstrated today.

   When Zoho SSO goes in, this file is the only server-side change: issue the
   session after the Zoho callback instead of after `verify`, and leave the
   rest of the API untouched. The console's side is src/state/auth.tsx.

   The code is texted (mobile number) or emailed (address) by deliver.js once
   that channel is configured. Until it is, `requestCode` falls back to returning
   the code in the response, which is only acceptable on a developer's machine
   or behind the office passphrase. */

import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, roleById } from './db.js';
import { allStaff, live } from './store.js';
import { mobileKey, resolveStaff, markStaffSignedIn, testOtp, testLoginEnabled, testAccounts } from './staff.js';
import { channels, sendCode, e164, maskMobile, maskEmail } from './deliver.js';

const CODE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** email -> { code, expires, tries } */
const codes = new Map();
/** token -> { staffId, email, name, title, role, expires } */
const sessions = new Map();

/* Sessions outlive a restart.

   They used to live only in this Map, so every time the API server restarted
   everyone was signed out — the browser still held its token, `/auth/me`
   answered 401, and the console bounced back to the sign-in screen. Harmless,
   self-healing, and baffling if you did not know the server had restarted.
   During development it restarts constantly.

   Kept in a gitignored file beside the code. These are sign-in tokens, so:
   never committed, and not written at all when NODE_ENV is production — a
   deployed server should use a real session store, not a file. */
const SESSION_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.sessions.json');
/* SESSIONS_FILE=off keeps sessions in memory only. The offline test harness sets
   it, so running the tests cannot overwrite the file a developer's own sign-in
   lives in. */
const persistSessions = process.env.NODE_ENV !== 'production' && process.env.SESSIONS_FILE !== 'off';

function loadSessions() {
  if (!persistSessions || !existsSync(SESSION_FILE)) return;
  try {
    const saved = JSON.parse(readFileSync(SESSION_FILE, 'utf8'));
    for (const [token, s] of Object.entries(saved)) {
      /* Expiry is the point of a session. A restart does not extend it. */
      if (s?.expires > Date.now()) sessions.set(token, s);
    }
  } catch { /* corrupt or half-written: start clean rather than crash */ }
}

function saveSessions() {
  if (!persistSessions) return;
  try {
    writeFileSync(SESSION_FILE, JSON.stringify(Object.fromEntries(sessions)));
  } catch { /* read-only checkout, full disk: not worth failing a sign-in */ }
}

loadSessions();

const production = () => process.env.NODE_ENV === 'production';

/** Six digits, as the prototype's sign-in screen expects. */
const sixDigits = () => String(Math.floor(100000 + Math.random() * 900000));

/* A shared passphrase, for when this is reachable from the internet.

   Sign-in here is a prototype: there is no mailer, so the one-time code comes
   back in the response. On localhost that is a convenience. On a public URL it
   means anyone can ask for the super administrator's code and be handed it —
   and behind that sit real members' phone numbers, addresses, ID numbers and
   identity documents.

   So: set ADMIN_PASSPHRASE on the deployed API and share it with the office.
   Unset — which is every local run and every test — nothing changes.

   This is a stopgap that makes deploying safe, not an auth system. It goes
   when the real mailer or Zoho SSO lands. */
const PASSPHRASE = () => process.env.ADMIN_PASSPHRASE || '';
export const passphraseRequired = () => !!PASSPHRASE();

/* Slow down guessing. One instance, in memory: enough for a shared
   passphrase, and it costs nothing. */
const attempts = new Map();
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 10 * 60 * 1000;

/** Constant time, so a wrong passphrase cannot be found one character at a
    time by measuring how long the comparison took. */
function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export function checkPassphrase(given, who = 'unknown') {
  if (!passphraseRequired()) return { ok: true };

  const now = Date.now();
  const a = attempts.get(who) || { n: 0, until: 0 };
  if (a.until > now) {
    return { ok: false, error: `Too many attempts. Try again in ${Math.ceil((a.until - now) / 60000)} minutes.` };
  }

  if (same(given || '', PASSPHRASE())) {
    attempts.delete(who);
    return { ok: true };
  }

  a.n += 1;
  if (a.n >= MAX_ATTEMPTS) { a.until = now + LOCKOUT_MS; a.n = 0; }
  attempts.set(who, a);
  return { ok: false, error: 'That passphrase is not right.' };
}

/* Who is asking, as a key the code is filed under: their number, or for the
   sample people (no Catalyst) their email. */
const keyOf = ({ mobile, email }) => (mobile ? mobileKey(mobile) : String(email || '').trim().toLowerCase());

/* Sending costs money (SMS) and lands in someone's pocket, so asking for a code
   is limited per person: not again within the cooldown, and not more than a few
   times an hour. A ceiling across everyone bounds the bill if something loops.
   Only real sends count; the test accounts and the on-screen code cost nothing. */
const RESEND_AFTER_MS = 30 * 1000;
const MAX_PER_HOUR = 5;
const MAX_ALL_PER_HOUR = 200;
const HOUR_MS = 60 * 60 * 1000;
/** key -> times a code was sent to them, in the last hour */
const sends = new Map();
let allSends = [];

function throttle(key) {
  const now = Date.now();
  allSends = allSends.filter((t) => now - t < HOUR_MS);
  const mine = (sends.get(key) || []).filter((t) => now - t < HOUR_MS);
  sends.set(key, mine);

  if (mine.length && now - mine[mine.length - 1] < RESEND_AFTER_MS) {
    const wait = Math.ceil((RESEND_AFTER_MS - (now - mine[mine.length - 1])) / 1000);
    return { error: `A code was just sent. You can ask for another in ${wait} seconds.`, status: 429, retryAfter: wait };
  }
  if (mine.length >= MAX_PER_HOUR) {
    return { error: 'Too many codes asked for in the last hour. Try again later.', status: 429 };
  }
  if (allSends.length >= MAX_ALL_PER_HOUR) {
    return { error: 'Sign-in is busy. Try again in a little while.', status: 429 };
  }
  return null;
}

const recordSend = (key) => {
  const now = Date.now();
  sends.get(key).push(now);
  allSends.push(now);
};

/**
 * Send a code to someone who is allowed to sign in.
 *
 * By mobile number it is texted; by email it is emailed. If that channel is not
 * set up on this server the code is returned in the response instead, as the
 * prototype always did, which is only acceptable locally or behind the office
 * passphrase. Test accounts get their fixed code and nothing is sent.
 */
export async function requestCode({ mobile, email } = {}) {
  const found = await resolveStaff({ mobile, email });
  if (!found.staff) return { ok: false, error: found.error };
  const staff = found.staff;

  const isTest = staff.source === 'test';
  const via = mobile ? 'sms' : 'email';
  const key = keyOf({ mobile, email });
  const delivering = !isTest && channels()[via];

  /* Neither a real channel nor a gate: the code would go to whoever asked.
     That is only ever the prototype's behaviour on someone's own machine. */
  if (!isTest && !delivering && production() && !passphraseRequired()) {
    return {
      ok: false, status: 503,
      error: `Codes cannot be ${via === 'sms' ? 'texted' : 'emailed'} yet: ${via === 'sms' ? 'SMS' : 'email'} is not set up on this server.`
        + (channels()[via === 'sms' ? 'email' : 'sms'] ? ` Sign in with your ${via === 'sms' ? 'email' : 'mobile number'} instead.` : ''),
    };
  }

  if (delivering) {
    const wait = throttle(key);
    if (wait) return { ok: false, ...wait };
  }

  const code = isTest ? testOtp() : sixDigits();
  const to = via === 'sms' ? e164(key) : key;

  if (delivering) {
    try {
      await sendCode({ via, to, code, ttlMs: CODE_TTL_MS });
    } catch (err) {
      return { ok: false, status: 502, error: err.message };
    }
    recordSend(key);
  }
  codes.set(key, { code, expires: Date.now() + CODE_TTL_MS, tries: 0 });

  /* Real codes are not written to the log in production: a host's logs are read
     by more people than the code is meant for. Nor when it has been sent: then
     the log would be a second copy of something meant for one inbox. */
  if (!production() && !delivering) console.log(`[auth] one-time code for ${staff.name}: ${code}`);

  return {
    ok: true,
    /* Asked for by one thing (a number, an address), answered with nothing about
       the other: otherwise typing someone's email would hand back their phone
       number. The name goes too once a message is really sent; it is then
       shown only to whoever holds the inbox or the phone. */
    name: delivering ? undefined : staff.name,
    test: isTest || undefined,
    /* How it went: 'sms' or 'email' when it was really sent (and then to where,
       masked), or nothing when the code is on screen instead. */
    via: delivering ? via : undefined,
    sentTo: delivering ? (via === 'sms' ? maskMobile(to) : maskEmail(to)) : undefined,
    resendAfterSeconds: delivering ? RESEND_AFTER_MS / 1000 : undefined,
    /* Only when nothing was sent. Test accounts in production do not get it:
       whoever is testing knows the code. */
    devCode: delivering || (isTest && production()) ? undefined : code,
    expiresInSeconds: CODE_TTL_MS / 1000,
  };
}

export async function verifyCode({ mobile, email } = {}, code) {
  const key = keyOf({ mobile, email });
  const entry = codes.get(key);
  if (!entry) return { ok: false, error: 'Ask for a new code.' };
  if (Date.now() > entry.expires) {
    codes.delete(key);
    return { ok: false, error: 'That code has expired. Ask for a new one.' };
  }
  if (++entry.tries > 5) {
    codes.delete(key);
    return { ok: false, error: 'Too many attempts. Ask for a new code.' };
  }
  if (String(code).trim() !== entry.code) {
    return { ok: false, error: 'That code is not right.' };
  }
  codes.delete(key);

  /* Look them up again rather than trusting the moment the code was sent: they
     may have been suspended or revoked since, and the code must not outlive
     that. */
  const found = await resolveStaff({ mobile, email });
  if (!found.staff) return { ok: false, error: found.error };
  const staff = found.staff;

  const token = randomUUID();
  const session = {
    token,
    staffId: staff.id,
    rowId: staff.rowId,
    memberRowId: staff.memberRowId ?? null,
    source: staff.source,
    email: staff.email || '',
    mobile: staff.mobile || '',
    name: staff.name,
    title: staff.title || '',
    role: staff.role,
    expires: Date.now() + SESSION_TTL_MS,
  };
  sessions.set(token, session);
  saveSessions();
  /* Stamp the sign-in. Not worth failing the sign-in over. */
  markStaffSignedIn(staff).catch(() => {});
  return { ok: true, token, user: publicUser(session) };
}

/** The accounts the sign-in screen offers. Prototype affordance. */
export async function listAccounts() {
  /* Only the test accounts are ever offered before sign-in. Real staff are
     real people, and a sign-in page that lists them is a directory for anyone
     probing it. Empty when test login is off. */
  if (!testLoginEnabled()) return [];
  return testAccounts().map((a) => ({
    mobile: a.mobile, name: a.name, title: a.title, role: a.role, roleName: roleById(a.role).name,
  }));
}

export { live };

export const publicUser = (s) => ({
  id: s.staffId,
  name: s.name,
  title: s.title,
  email: s.email,
  mobile: s.mobile || '',
  source: s.source || 'sample',
  role: s.role,
  roleName: roleById(s.role).name,
  perms: roleById(s.role).perms,
});

export function sessionFor(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expires) { sessions.delete(token); saveSessions(); return null; }
  return s;
}

/**
 * Change or end every session a staff member holds.
 *
 * Revoking someone's access has to take effect NOW, not when their session
 * runs out twelve hours later: the person being removed is, by definition,
 * someone the office no longer wants in. With `patch` it updates the role
 * they are signed in as instead, so a promotion or demotion applies at once.
 * Returns how many sessions it touched.
 */
export function refreshSessions(staffId, patch = null) {
  let n = 0;
  for (const [token, sess] of sessions) {
    if (sess.staffId !== staffId) continue;
    if (patch) Object.assign(sess, patch); else sessions.delete(token);
    n++;
  }
  if (n) saveSessions();
  return n;
}

/* Signing out must outlive a restart too, or the token would come back. */
export const signOut = (token) => {
  const had = sessions.delete(token);
  if (had) saveSessions();
  return had;
};

/** Prototype affordance: look at the console as any of the ten roles.
    The prototype had the same switch in its account menu. */
export function viewAs(token, roleId) {
  const s = sessionFor(token);
  if (!s) return null;
  if (!db.ROLES.some((r) => r.id === roleId)) return null;
  s.role = roleId;
  /* So the role you are viewing as survives a restart with the session. */
  saveSessions();
  return publicUser(s);
}

/* ---------- express middleware ---------- */

/** Attaches req.user, or answers 401. */
export function requireSession(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = sessionFor(token);
  if (!session) return res.status(401).json({ error: 'Sign in again.' });
  req.session = session;
  req.user = publicUser(session);
  next();
}

/** Refuses the request unless the signed-in role holds `perm`.
    The console hides what you cannot do; this is what actually stops it. */
export function requirePerm(perm) {
  return (req, res, next) => {
    const held = roleById(req.session.role).perms;
    const ok = [].concat(perm).some((p) => held.includes(p));
    if (!ok) {
      return res.status(403).json({
        error: 'You do not have access to this.',
        needs: [].concat(perm),
        youAre: roleById(req.session.role).name,
      });
    }
    next();
  };
}
