/* Who is console staff, however they are found.

   Three places, in this order:

     1. TEST ACCOUNTS: fixed numbers with a fixed one-time code, one per role,
        so every role can be tried without a real person. Off unless enabled.
     2. CATALYST: members the office flagged super admin, and members a super
        administrator gave a role (noah-schema.js). The real thing.
     3. THE SAMPLE PEOPLE: the prototype's fictional staff, matched by email.
        Only when there is no Catalyst connection at all.

   Number 3 is why this module exists as much as number 1. The sample people
   used to be sign-in-able even with Catalyst connected, which on a live
   deployment meant "anitha.varghese@karunasadan.org" opened a super
   administrator session onto real members' data. With Catalyst connected they
   are not staff any more. */

import { db, roleById } from './db.js';
import { live, isNoah, staffByEmail, allStaff } from './store.js';
import {
  mobileKey, findStaffByMobile, findStaffByEmail, loadStaffDirectory, consoleStaffEnabled, touchStaffSignIn,
} from './noah-schema.js';

export { mobileKey };

const production = () => process.env.NODE_ENV === 'production';

/* ---------- test accounts ----------

   Enabled by default everywhere except production, where it must be asked for
   with ENABLE_TEST_LOGIN=true AND given a code with TEST_LOGIN_OTP.

   There is deliberately no default code in production. This repository is
   public, so a default written here would be known to everyone: a deployed
   console with a published code and a super-administrator test account is an
   open door onto whatever data it is connected to. */

const flag = () => String(process.env.ENABLE_TEST_LOGIN ?? '').toLowerCase();

export const testOtp = () =>
  process.env.TEST_LOGIN_OTP || (production() ? '' : '123456');

export const testLoginEnabled = () => {
  if (flag() === 'false') return false;
  if (production()) return flag() === 'true' && !!testOtp();
  return true;
};

/** Why test login is off, for the person wondering why it does not work. */
export const testLoginStatus = () => {
  if (testLoginEnabled()) return { on: true };
  if (flag() === 'false') return { on: false, why: 'ENABLE_TEST_LOGIN is false.' };
  if (production() && flag() !== 'true') return { on: false, why: 'Production needs ENABLE_TEST_LOGIN=true.' };
  if (production() && !testOtp()) return { on: false, why: 'Production needs TEST_LOGIN_OTP, which has no default.' };
  return { on: false, why: 'Off.' };
};

/** One per role, in the order the roles are defined: ...01 is the super
    administrator, ...02 the membership officer, and so on. */
export function testAccounts() {
  return db.ROLES.map((r, i) => {
    const mobile = '+91 ' + '90000' + String(i + 1).padStart(5, '0');
    return {
      id: `TEST-${r.id}`,
      rowId: null,
      memberRowId: null,
      name: `Test · ${r.name}`,
      title: 'Test account',
      /* `.test` is reserved and can never be a real mailbox. */
      email: `${r.id}@console.test`,
      mobile,
      mobileKey: mobileKey(mobile),
      role: r.id,
      status: 'Active',
      from: null, lastIn: null, to: null, mfa: false, locs: ['All locations'], overrides: [],
      source: 'test',
      blocked: false,
    };
  });
}

const roleIds = () => db.ROLES.map((r) => r.id);

/** A found member of staff, if their access is switched on. Same rule whichever
    way they identified themselves. */
function usable(s, what, key) {
  if (s.blocked || s.status === 'Blocked') {
    return { error: `That ${what} is blocked. The member is archived, or their login is.` };
  }
  if (s.status !== 'Active') {
    return { error: `That access is ${String(s.status).toLowerCase()}. Ask a super administrator to restore it.` };
  }
  return { staff: { ...s, key } };
}

/**
 * Find who is signing in. Returns { staff } or { error }.
 *
 * `mobile` is the way in. `email` still works, but only with no Catalyst
 * connection: it is the prototype's sample people, and on live data they are
 * not staff.
 */
export async function resolveStaff({ mobile, email } = {}) {
  if (mobile) {
    const key = mobileKey(mobile);
    if (!key || key.length < 8) return { error: 'That is not a mobile number.' };

    if (testLoginEnabled()) {
      const t = testAccounts().find((a) => a.mobileKey === key);
      if (t) return { staff: { ...t, key } };
    }

    if (live() && isNoah()) {
      const s = await findStaffByMobile(mobile, roleIds());
      if (!s) {
        return { error: 'That number does not have access to this console. Ask a super administrator to give you a role.' };
      }
      return usable(s, 'number', key);
    }
    return { error: 'That number does not have access to this console.' };
  }

  if (email) {
    const addr = String(email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return { error: 'That is not an email address.' };

    if (testLoginEnabled()) {
      const t = testAccounts().find((a) => a.email === addr);
      if (t) return { staff: { ...t, key: addr } };
    }

    /* Live data: the address has to be on a member's row, and that member has
       to have been given a role, exactly as with a mobile number. */
    if (live() && isNoah()) {
      const r = await findStaffByEmail(addr, roleIds());
      if (r.ambiguous) {
        return { error: 'More than one person uses that address. Sign in with your mobile number instead.' };
      }
      if (!r.staff) {
        return { error: 'That address does not have access to this console. Ask a super administrator to give you a role.' };
      }
      return usable(r.staff, 'address', addr);
    }
    /* Catalyst connected, but not the schema that carries members. */
    if (live()) return { error: 'Sign in with your mobile number.' };

    const s = await staffByEmail(addr);
    if (!s) return { error: 'No staff account uses that address.' };
    if (s.status && s.status !== 'Active') {
      return { error: `That account is ${String(s.status).toLowerCase()}. Ask a super administrator to re-enable it.` };
    }
    return { staff: { ...s, mobile: '', source: 'sample', key: String(email).toLowerCase() } };
  }

  return { error: 'Enter your mobile number.' };
}

/** The Staff screen: everyone who can sign in, however they got there. */
export async function listStaff() {
  const rows = [];
  if (live() && isNoah()) {
    rows.push(...await loadStaffDirectory(roleIds()));
  } else {
    rows.push(...(await allStaff()).map((s) => ({ ...s, mobile: s.mobile || '', source: 'sample' })));
  }
  if (testLoginEnabled()) rows.push(...testAccounts());
  return rows;
}

/** Stamp the sign-in, for staff that live in Catalyst. */
export const markStaffSignedIn = (staff) => {
  if (staff?.source === 'catalyst') return touchStaffSignIn(staff.rowId);
  return Promise.resolve();
};

export { consoleStaffEnabled, roleById };
