/* The member register's filters and its CSV export.

   The office filters the register by:

     city, state, country, mother tongue   the member's own columns (members.city, .state, .country, .motherTongue)
     group                                 groupsConnect + groups: one member may be in several (WOW, English, Marathi...)
     event                                 who came to it: passes with passIsUsed, not cancelled, not archived

   Text is matched without regard to case or extra spaces, so "Pune", "pune " and "PUNE" are one city. The choices offered are the
   values members actually have, each with how many members have it.

   The export is every column the console knows about a member, for the members the register is showing. It holds contact details, so
   it needs members.pii, and every export is written to the audit log (server/routes/register.js). */

import { live, isNoah } from './store.js';
import { io, memberExportRows } from './noah-schema.js';
import { listEvents } from './events.js';
import { MEMBER_FIELDS } from './member-fields.js';

const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const isLiveRow = (r) => !bool(r.isArchived) && !bool(r.archived);
const norm = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** The register's filters: query parameter -> the member's field. */
export const TEXT_FILTERS = { city: 'city', state: 'state', country: 'country', tongue: 'motherTongue' };
export const FILTER_KEYS = [...Object.keys(TEXT_FILTERS), 'group', 'event'];

/** The filters asked for in a query string, or null when there are none. Each is a list: a key repeated (city=Pune&city=Mumbai)
    means any of those values. Different filters must all match. */
export function filtersFrom(query = {}) {
  const f = {};
  for (const k of FILTER_KEYS) {
    const list = [].concat(query[k] ?? []).map((v) => String(v).trim()).filter(Boolean);
    if (list.length) f[k] = [...new Set(list)].slice(0, 200);
  }
  return Object.keys(f).length ? f : null;
}

/* ---------- groups and attendance, read once a minute ---------- */

const KEEP_MS = 60_000;
let links = null;
let linksAt = 0;

const EMPTY = () => ({ groups: [], events: [], groupsOf: new Map(), attendedOf: new Map() });

/** Which groups each member is in, and which events each came to. Keyed by the member's row id. */
export async function registerLinks() {
  if (!(live() && isNoah())) return EMPTY();
  if (links && Date.now() - linksAt < KEEP_MS) return links;

  /* A table that cannot be read leaves its filter empty; it does not stop the register. */
  const quiet = (what) => (err) => { console.error(`[register] ${what} could not be read: ${err.message}`); return []; };
  const [groups, groupLinks, passes, current, archived] = await Promise.all([
    io.getRows('tbl:groups').catch(quiet('groups')),
    io.getRows('tbl:groupsConnect').catch(quiet('groupsConnect')),
    io.getRows('tbl:passes').catch(quiet('passes')),
    listEvents().catch(quiet('events')),
    listEvents({ archived: true }).catch(quiet('archived events')),
  ]);

  /* groupsConnect.groupId may hold the group's own id or its row id. */
  const liveGroups = groups.filter(isLiveRow);
  const rowIdOf = new Map();
  for (const g of liveGroups) {
    rowIdOf.set(String(g.ROWID), String(g.ROWID));
    if (g.id != null && g.id !== '') rowIdOf.set(String(g.id), String(g.ROWID));
  }
  const groupsOf = new Map();
  for (const l of groupLinks.filter(isLiveRow)) {
    const gid = rowIdOf.get(String(l.groupId ?? ''));
    const mid = String(l.memberId ?? '');
    if (!gid || !mid) continue;
    if (!groupsOf.has(mid)) groupsOf.set(mid, new Set());
    groupsOf.get(mid).add(gid);
  }

  const attendedOf = new Map();
  for (const p of passes) {
    if (!isLiveRow(p) || bool(p.inactive) || !bool(p.passIsUsed)) continue;
    const mid = String(p.memberId ?? '');
    const eid = String(p.eventId ?? '');
    if (!mid || !eid) continue;
    if (!attendedOf.has(mid)) attendedOf.set(mid, new Set());
    attendedOf.get(mid).add(eid);
  }

  const events = [...current, ...archived].map((e) => ({ id: String(e.id), name: e.name || '(no name)', date: e.date || '' }));
  links = {
    groups: liveGroups.map((g) => ({ id: String(g.ROWID), name: String(g.name ?? '').trim() || '(unnamed group)' })),
    events,
    groupsOf,
    attendedOf,
  };
  linksAt = Date.now();
  return links;
}

/** Forget the cached groups and attendance (a test, or after a change). */
export const forgetRegisterLinks = () => { links = null; };

/* ---------- filtering ---------- */

/** The members that match every filter given; within one filter, any of its values. `rows` are register rows (loadMembers). */
export function applyRegisterFilters(rows, f, l) {
  if (!f) return rows;
  const want = Object.fromEntries(Object.entries(f).map(([k, list]) =>
    [k, new Set([].concat(list).map((v) => (TEXT_FILTERS[k] ? norm(v) : String(v))))]));
  const anyIn = (set, mine) => {
    if (!mine) return false;
    for (const v of set) if (mine.has(v)) return true;
    return false;
  };
  return rows.filter((m) => {
    for (const [k, field] of Object.entries(TEXT_FILTERS)) {
      if (want[k] && !want[k].has(norm(m[field]))) return false;
    }
    const id = String(m.rowId ?? m.id);
    if (want.group && !anyIn(want.group, l.groupsOf.get(id))) return false;
    if (want.event && !anyIn(want.event, l.attendedOf.get(id))) return false;
    return true;
  });
}

/** What each filter can be set to, with how many members have it. Most members first; names in A-Z order after that. */
export function registerFilterOptions(rows, l) {
  const out = {};
  for (const [k, field] of Object.entries(TEXT_FILTERS)) {
    const seen = new Map();
    for (const m of rows) {
      const shown = String(m[field] ?? '').trim().replace(/\s+/g, ' ');
      if (!shown) continue;
      const key = shown.toLowerCase();
      const hit = seen.get(key);
      if (hit) hit.count += 1;
      else seen.set(key, { value: shown, label: shown, count: 1 });
    }
    out[k] = [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  const ids = new Set(rows.map((m) => String(m.rowId ?? m.id)));
  const countIn = (map, value) => {
    let n = 0;
    for (const [mid, set] of map) if (ids.has(mid) && set.has(value)) n += 1;
    return n;
  };
  out.group = l.groups
    .map((g) => ({ value: g.id, label: g.name, count: countIn(l.groupsOf, g.id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  /* Only events someone came to: an event with no one present gives an empty list. Newest first. */
  out.event = l.events
    .map((e) => ({ value: e.id, label: e.name, date: e.date, count: countIn(l.attendedOf, e.id) }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label));
  return out;
}

/* ---------- the CSV ---------- */

/** One cell. A value a spreadsheet would run as a formula starts with an apostrophe; phone numbers are left alone. */
export function csvCell(v) {
  let s = v == null ? '' : v instanceof Date ? (Number.isNaN(+v) ? '' : v.toISOString().slice(0, 10)) : String(v);
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-][\d\s()-]*$/.test(s))) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const LABELS = {
  postal: { corrAddress: 'Postal address', corrArea: 'Postal area', corrCity: 'Postal city', corrState: 'Postal state', corrCountry: 'Postal country', corrPincode: 'Postal pincode' },
  home: { address: 'Home address' },
};

/** The register's members as a CSV file (text, with a byte-order mark so Excel reads Indian scripts correctly). */
export async function registerCsv(rows, l) {
  const raw = live() && isNoah() ? await memberExportRows() : new Map();
  const groupName = new Map(l.groups.map((g) => [g.id, g.name]));
  const eventName = new Map(l.events.map((e) => [e.id, e.date ? `${e.name} (${e.date})` : e.name]));

  /* Mobile goes beside email; the rest of the member's own columns in the order of the edit form. */
  const own = MEMBER_FIELDS.map((f) => ({
    key: f.key,
    label: LABELS.postal[f.key] || LABELS.home[f.key] || f.label,
  }));
  const at = own.findIndex((f) => f.key === 'email');
  own.splice(at, 0, { key: '_mobile', label: 'Mobile' });

  /* One line per member: several groups or events go in one cell, separated by "; ". */
  const head = ['Member ID', 'Full name', ...own.map((f) => f.label), 'Age', 'Status', 'Registration date', 'Member since', 'Partner', 'Pastor', 'Cell leader', 'Groups', 'Events attended'];
  const lines = [head.map(csvCell).join(',')];

  for (const m of rows) {
    const id = String(m.rowId ?? m.id);
    const r = raw.get(id) || {};
    const fallback = { firstName: m.first, lastName: m.last, email: m.email, city: m.city ?? m.loc, state: m.state, country: m.country, motherTongue: m.motherTongue };
    const cells = [
      m.id || id,
      m.name,
      ...own.map((f) => (f.key === '_mobile' ? m.mobile : (r[f.key] ?? fallback[f.key] ?? ''))),
      m.age || '',
      m.status,
      r._registered || '',
      m.joined,
      m.partner ? 'Yes' : 'No',
      m.pastor || '',
      m.cell || '',
      [...(l.groupsOf.get(id) || [])].map((g) => groupName.get(g)).filter(Boolean).sort().join('; '),
      [...(l.attendedOf.get(id) || [])].map((e) => eventName.get(e)).filter(Boolean).sort().join('; '),
    ];
    lines.push(cells.map(csvCell).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
