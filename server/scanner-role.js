/* The app's door-scanner role, kept in step with the console's own scan permission.

   FOR-CONSOLE-EVENTS.md 5b: door staff can scan passes inside the Noah app when they hold the app role `scanner`
   (POST /admin/members/:id/roles { scanner: true | false }, stored by the Noah API as users.is_employee). The console's
   `events.scan` is a separate thing, for its own staff accounts. So when a staff member's console access starts to include
   events.scan, they are given the app role too, and it is taken away when their access stops including it.

   A failure here never undoes the console change: it is reported, so the office can set the role by hand on App roles. */

import * as noah from './noah-api.js';
import { db } from './db.js';
import { clearCache, loadStaffDirectory, allMemberRoles } from './noah-schema.js';

const truthy = (v) => v === true || v === 'true' || v === 1 || v === '1';

/** Does this console role include scanning passes (in the permission grid as it is now)? Unknown roles never do. */
export const roleScans = (roleId) => !!db.ROLES.find((r) => r.id === roleId)?.perms?.includes('events.scan');

/** Can this console account scan right now: active, with a role that includes events.scan. */
export const accountScans = (role, status = 'Active') => status === 'Active' && roleScans(role);

/**
 * Give (`on`) or take away the app's scanner role. Returns null when done or when there is nothing to do here
 * (no Noah API, no member), else a sentence for the office.
 */
export async function syncAppScanner(memberRowId, on, { actor } = {}) {
  if (!memberRowId || !noah.noahConfigured()) return null;
  try {
    await noah.setMemberRoles(memberRowId, { scanner: !!on }, { actor });
    clearCache();
    return null;
  } catch (err) {
    console.error(`[scanner-role] could not ${on ? 'give' : 'take away'} the app scanner role for ${memberRowId}: ${err.message}`);
    return on
      ? 'Console access is saved, but the door-scanner role in the app could not be given. Give it on App roles (Door staff / Pass scanner).'
      : 'Console access is saved, but the door-scanner role in the app could not be taken away. Take it away on App roles.';
  }
}

/**
 * Active staff whose console access includes events.scan but who cannot scan in the app yet (their login's
 * users.is_employee, the flag the app reads, is not set). Staff given access before the two were kept in step
 * are the usual case. Only ever adds: someone given the role by hand on App roles is never listed or changed.
 */
export async function scannerGaps() {
  const [staff, roleRows] = await Promise.all([loadStaffDirectory(db.ROLES.map((r) => r.id)), allMemberRoles()]);
  const seen = new Set();
  return staff
    .filter((s) => s.memberRowId && accountScans(s.role, s.status))
    .filter((s) => !truthy(roleRows.get(String(s.memberRowId))?.is_employee))
    .filter((s) => !seen.has(s.memberRowId) && seen.add(s.memberRowId))
    .map((s) => ({ memberRowId: s.memberRowId, name: s.name }));
}

/** Give the app's scanner role to everyone `scannerGaps` lists. */
export async function fillScannerGaps({ actor } = {}) {
  if (!noah.noahConfigured()) return { given: 0, failed: [], noKey: true };
  const gaps = await scannerGaps();
  const failed = [];
  for (const g of gaps) if (await syncAppScanner(g.memberRowId, true, { actor })) failed.push(g.name);
  return { given: gaps.length - failed.length, failed };
}

/**
 * events.scan was switched on or off for a whole console role (the permission grid): give or take away the app role for
 * every active staff member who holds that console role. Returns a sentence when some could not be changed, else null.
 */
export async function syncRoleScanners(roleId, on, { actor } = {}) {
  if (!noah.noahConfigured()) return null;
  let staff;
  try {
    staff = (await loadStaffDirectory(db.ROLES.map((r) => r.id)))
      .filter((s) => s.role === roleId && s.status === 'Active' && s.memberRowId);
  } catch (err) {
    console.error(`[scanner-role] could not read the staff list: ${err.message}`);
    return 'The permission is saved, but the staff list could not be read to update the door-scanner role in the app. Set it on App roles.';
  }
  let failed = 0;
  for (const s of staff) if (await syncAppScanner(s.memberRowId, on, { actor })) failed += 1;
  return failed
    ? `The permission is saved, but the door-scanner role in the app could not be ${on ? 'given to' : 'taken from'} ${failed} of ${staff.length} staff. Set it on App roles.`
    : null;
}
