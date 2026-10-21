/* Sign-in for the admin console.

   NO ZOHO SINGLE SIGN-ON. This is a local email + one-time-code flow that
   stands in for it, so the console can be run and demonstrated today.

   When Zoho SSO goes in, this file is the only server-side change: issue the
   session after the Zoho callback instead of after `verify`, and leave the
   rest of the API untouched. The console's side is src/state/auth.tsx.

   The code is NOT emailed anywhere. `requestCode` returns it in the response
   (and prints it to the console) because this is a prototype. A real
   implementation must send it out of band and never return it. */

import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, roleById } from './db.js';
import { allStaff, live } from './store.js';
import { mobileKey, resolveStaff, markStaffSignedIn, testOtp, testLoginEnabled, testAccounts } from './staff.js';

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
const persistSessions = process.env.NODE_ENV !== 'production';

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
const keyOf = ({ mobile, email }) => (mobile ? mobileKey(mobile) : String(email || '').toLowerCase());

/**
 * Send a code to someone who is allowed to sign in.
 *
 * There is no SMS gateway yet, so the code is returned in the response, which
 * is why the deployed console is behind a passphrase. Test accounts get their
 * fixed code instead, and in production that is not echoed: whoever is testing
 * knows it.
 */
export async function requestCode({ mobile, email } = {}) {
  const found = await resolveStaff({ mobile, email });
  if (!found.staff) return { ok: false, error: found.error };
  const staff = found.staff;

  const isTest = staff.source === 'test';
  const code = isTest ? testOtp() : sixDigits();
  codes.set(keyOf({ mobile, email }), { code, expires: Date.now() + CODE_TTL_MS, tries: 0 });

  /* Real codes are not written to the log in production: a host's logs are read
     by more people than the code is meant for. */
  if (!production()) console.log(`[auth] one-time code for ${staff.name}: ${code}`);

  return {
    ok: true,
    mobile: staff.mobile || undefined,
    email: staff.email || undefined,
    name: staff.name,
    test: isTest || undefined,
    /* Prototype only. Remove with the SMS gateway. */
    devCode: isTest && production() ? undefined : code,
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
