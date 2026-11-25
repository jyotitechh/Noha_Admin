/* Emails that more than one member uses: the office's list of addresses to check.

   Members give an email when they register, and the app signs them in and writes to them with it. When two members share one,
   the app cannot tell them apart by email (EMAIL-OTP-FOR-FLUTTER.md: an address two members share is refused for sign-in), and
   one of them is usually a typo or a family member's address. So the office sees every shared address here, calls the people,
   and corrects the email on the right member (the ordinary member edit, PATCH /api/people/:id).

   Two kinds:
     duplicate            two or more members have exactly the same address (ignoring capitals and spaces);
     potential duplicate  the addresses differ but are very likely the same mailbox: Gmail ignores dots and anything after a +
                          (john.smith@gmail.com, johnsmith+x@gmail.com), and a few common typos of the big providers' names
                          are read as the provider (priya@gmial.com, priya@gmail.co).

   Each person in a group shows when their address came: when they sent their registration, or when they were added. The
   office can mark a group "checked" (for example, the same family on purpose). The mark is kept in the app's globalSettings
   table, one row per address (keyCol "console.emailCheck:<address>"), with the people it was checked for: if someone new joins
   with that address, or an address in it changes, the group is open again. */

import { io, NOAH_TABLES as T, memberEmailRows } from './noah-schema.js';

const CHECK_PREFIX = 'console.emailCheck:';

/* The big providers' names as they are often mistyped. Only the domain is corrected, and only to find likely duplicates: the
   stored address is never changed here. */
const TYPO_DOMAINS = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'googlemail.com': 'gmail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yahoo.con': 'yahoo.com',
  'hotmial.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'rediffmail.co': 'rediffmail.com', 'redifmail.com': 'rediffmail.com',
};

/** An address as typed, ignoring capitals and spaces around it. */
export const normal = (email) => String(email ?? '').trim().toLowerCase();

const looksLikeEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/** The mailbox an address most likely reaches: Gmail's dots and +tags dropped, common provider typos corrected. */
export function mailbox(email) {
  const n = normal(email);
  const at = n.lastIndexOf('@');
  if (at < 1) return n;
  let local = n.slice(0, at);
  const domain = TYPO_DOMAINS[n.slice(at + 1)] || n.slice(at + 1);
  if (domain === 'gmail.com') local = local.split('+')[0].replace(/\./g, '');
  return `${local}@${domain}`;
}

/** Who a group was checked for: the people and their addresses. A different set means the mark no longer applies. */
const signatureOf = (entries) => entries.map((e) => `${e.memberRowId}:${normal(e.email)}`).sort().join('|');

const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const live = (r) => !(r.isArchived === 1 || r.isArchived === '1' || r.isArchived === true);

async function checkRows() {
  try {
    return (await io.getRows(T.globalSettings)).filter((r) => String(r.keyCol ?? '').startsWith(CHECK_PREFIX));
  } catch (err) {
    console.error(`[duplicate emails] the checked marks could not be read: ${err.message}`);
    return [];
  }
}

const parse = (v) => { try { return JSON.parse(v); } catch { return null; } };

/**
 * Every address two or more members use, newest first. Each group: { key, kind, email, people, checked, check, latest,
 * familyShare, entries: [{ memberRowId, name, mobile, email, field, came, status, archived, first, childOf }] }.
 */
export async function findDuplicateEmails() {
  const [members, marks] = await Promise.all([memberEmailRows(), checkRows()]);
  const nameOf = new Map(members.map((m) => [m.rowId, m.name]));

  /* Every address, under the mailbox it most likely reaches. A member with the same address twice counts once. */
  const byBox = new Map();
  for (const m of members) {
    const seen = new Set();
    for (const [email, field] of [[m.email1, 'Email'], [m.email2, 'Second email']]) {
      const n = normal(email);
      if (!n || !looksLikeEmail(n) || seen.has(n)) continue;
      seen.add(n);
      const key = mailbox(n);
      if (!byBox.has(key)) byBox.set(key, []);
      byBox.get(key).push({
        memberRowId: m.rowId, name: m.name, mobile: m.mobile, email, field,
        came: m.came, status: m.status, archived: m.archived, parentMemberId: m.parentMemberId,
      });
    }
  }

  const checks = new Map(marks.filter(live).map((r) => [String(r.keyCol).slice(CHECK_PREFIX.length), parse(r.value)]));
  const groups = [];
  for (const [key, all] of byBox) {
    if (new Set(all.map((e) => e.memberRowId)).size < 2) continue;
    /* Oldest first, so the office sees which address came first and which came after it. */
    const entries = all.sort((a, b) => (+a.came || 0) - (+b.came || 0));
    entries.forEach((e, i) => {
      e.first = i === 0;
      /* A child the parents made a member has the parent's address on purpose. */
      e.childOf = e.parentMemberId && entries.some((x) => x.memberRowId === e.parentMemberId) ? nameOf.get(e.parentMemberId) || null : null;
      delete e.parentMemberId;
    });
    /* Exactly the same address on two members is a duplicate; only the same mailbox written differently is a potential one. */
    const sameExactly = new Map();
    for (const e of entries) sameExactly.set(normal(e.email), (sameExactly.get(normal(e.email)) || new Set()).add(e.memberRowId));
    const kind = [...sameExactly.values()].some((s) => s.size > 1) ? 'duplicate' : 'potential';
    const signature = signatureOf(entries);
    const mark = checks.get(key);
    const checked = !!mark && mark.signature === signature;
    groups.push({
      key,
      kind,
      /* The address as most of them wrote it. */
      email: [...sameExactly.entries()].sort((a, b) => b[1].size - a[1].size)[0][0],
      people: new Set(entries.map((e) => e.memberRowId)).size,
      familyShare: entries.some((e) => e.childOf),
      checked,
      check: checked ? { by: mark.by || '', at: mark.at || null, note: mark.note || '' } : null,
      latest: entries.reduce((t, e) => (+e.came > +t ? e.came : t), null),
      signature,
      entries,
    });
  }
  return groups.sort((a, b) => (+b.latest || 0) - (+a.latest || 0));
}

/** The groups still to look at: not checked, or changed since they were. */
export const openDuplicateEmails = async () => (await findDuplicateEmails()).filter((g) => !g.checked);

/** Mark a group checked, for the people in it now. Returns the group, or null when the address is no longer shared. */
export async function markEmailChecked(key, { by = '', byRowId = null, note = '' } = {}) {
  const group = (await findDuplicateEmails()).find((g) => g.key === key);
  if (!group) return null;
  const value = JSON.stringify({ signature: group.signature, by, at: new Date().toISOString(), note: String(note || '').trim().slice(0, 500) });
  const row = (await checkRows()).find((r) => String(r.keyCol) === CHECK_PREFIX + key);
  if (row) {
    await io.update(T.globalSettings, { ROWID: String(row.ROWID), value, isArchived: 0, updatedOn: stamp(), ...(byRowId ? { updatedBy: String(byRowId) } : {}) });
  } else {
    await io.insert(T.globalSettings, {
      keyCol: CHECK_PREFIX + key, value, isArchived: 0, createdOn: stamp(), updatedOn: stamp(), ...(byRowId ? { createdBy: String(byRowId) } : {}),
    });
  }
  return { ...group, checked: true };
}

/** Open a checked group again. Returns false when it was not marked. */
export async function reopenEmailCheck(key, { byRowId = null } = {}) {
  const row = (await checkRows()).find((r) => String(r.keyCol) === CHECK_PREFIX + key && live(r));
  if (!row) return false;
  await io.update(T.globalSettings, { ROWID: String(row.ROWID), isArchived: 1, updatedOn: stamp(), ...(byRowId ? { updatedBy: String(byRowId) } : {}) });
  return true;
}

/** Enough of an address to recognise it, for staff who may not see contact details: an••••@gmail.com */
export const maskEmail = (email) => String(email || '').replace(/^([^@]{0,2})[^@]*(@.*)$/, '$1••••$2');
