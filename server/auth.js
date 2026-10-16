/* Sign-in for the admin console.

   NO ZOHO SINGLE SIGN-ON. This is a local email + one-time-code flow that
   stands in for it, so the console can be run and demonstrated today.

   When Zoho SSO goes in, this file is the only server-side change: issue the
   session after the Zoho callback instead of after `verify`, and leave the
   rest of the API untouched. The console's side is src/state/auth.tsx.

   The code is NOT emailed anywhere. `requestCode` returns it in the response
   (and prints it to the console) because this is a prototype. A real
   implementation must send it out of band and never return it. */

import { randomUUID } from 'node:crypto';
import { db, roleById } from './db.js';
import { staffByEmail, allStaff, markSignedIn, live } from './store.js';

const CODE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** email -> { code, expires, tries } */
const codes = new Map();
/** token -> { staffId, email, name, title, role, expires } */
const sessions = new Map();

/** Six digits, as the prototype's sign-in screen expects. */
const sixDigits = () => String(Math.floor(100000 + Math.random() * 900000));

export async function requestCode(email) {
  const staff = await staffByEmail(email);
  if (!staff) return { ok: false, error: 'No staff account uses that address.' };
  if (staff.status && staff.status !== 'Active') {
    return { ok: false, error: `That account is ${String(staff.status).toLowerCase()}. Ask a super administrator to re-enable it.` };
  }
  const code = sixDigits();
  codes.set(staff.email.toLowerCase(), { code, expires: Date.now() + CODE_TTL_MS, tries: 0 });
  console.log(`[auth] one-time code for ${staff.email}: ${code}`);
  return {
    ok: true,
    email: staff.email,
    name: staff.name,
    /* Prototype only. Remove with the real mailer. */
    devCode: code,
    expiresInSeconds: CODE_TTL_MS / 1000,
  };
}

export async function verifyCode(email, code) {
  const key = String(email || '').toLowerCase();
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

  const staff = await staffByEmail(email);
  const token = randomUUID();
  const session = {
    token,
    staffId: staff.id,
    rowId: staff.rowId,
    email: staff.email,
    name: staff.name,
    title: staff.title || '',
    role: staff.role,
    expires: Date.now() + SESSION_TTL_MS,
  };
  sessions.set(token, session);
  /* Stamp the sign-in on the Staff row. Not worth failing the sign-in over. */
  if (staff.rowId) markSignedIn(staff.rowId).catch(() => {});
  return { ok: true, token, user: publicUser(session) };
}

/** The accounts the sign-in screen offers. Prototype affordance. */
export async function listAccounts() {
  const rows = await allStaff();
  return rows
    .filter((s) => s.status === 'Active')
    .map((s) => ({ email: s.email, name: s.name, title: s.title, role: s.role, roleName: roleById(s.role).name }));
}

export { live };

export const publicUser = (s) => ({
  id: s.staffId,
  name: s.name,
  title: s.title,
  email: s.email,
  role: s.role,
  roleName: roleById(s.role).name,
  perms: roleById(s.role).perms,
});

export function sessionFor(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expires) { sessions.delete(token); return null; }
  return s;
}

export const signOut = (token) => sessions.delete(token);

/** Prototype affordance: look at the console as any of the ten roles.
    The prototype had the same switch in its account menu. */
export function viewAs(token, roleId) {
  const s = sessionFor(token);
  if (!s) return null;
  if (!db.ROLES.some((r) => r.id === roleId)) return null;
  s.role = roleId;
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
