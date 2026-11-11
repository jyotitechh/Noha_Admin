/* Events, event groups and event language groups: what the office sets up and the Noah app shows.

   WHERE IT IS KEPT
     The Catalyst project already has the office's tables for this, with the same fields the old admin app had:
       events               one row per event
       eventGroup           the group an event belongs to (its pastors, donation and scanning teams)
       eventLanguageGroups  "Mumbai - English" and the like; every event group belongs to one
       halls, groups        read only: the hall an event is in, and the member groups it can be limited to
       locations            the places the office has chosen on the map before, offered again when adding an event
     Without a Catalyst connection (the sample data) the same rows are kept in memory instead.

   HOW THE FIELDS ARE STORED (the tables were empty when this was written, so these are the console's choices,
   and docs/EVENTS.md lists them for the app's developers)
     the event's day         eventType 1 ("one date") and eventValue 'YYYY-MM-DD'
     start and end           startTime / endTime 'HH:mm' in the event's timezone, and startTimeUtc / endTimeUtc
     a person or a list      member ROWIDs: preacherId is one; donationCollectionTeam, scanningTeam,
                             connectedEmployees (the group's pastors) and blockIfPassBookedFor are JSON arrays
     who may see it          filters, JSON: { forPastor, forLeader, forVip, forPrayerWarrior, memberGroups: [ROWID] }
     visible                 isInvisible is the opposite of the form's "Visible" switch
     links between rows      by ROWID: events.eventGroupId, eventGroup.eventLanguageGroupId, events.hallId
     the place               locationName and locationAddress, with locationLat / locationLon and locationId (the map's own id
                             for it, e.g. 'way:12345'), picked from a map search (server/places.js)
   Nothing is deleted: archiving sets isArchived, as everywhere else in the office's schema. */

import { io } from './noah-schema.js';
import { live, isNoah } from './store.js';
import { cleanHtml } from './rich.js';

export class EventError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const onCatalyst = () => live() && isNoah();

/** The office's tables this file reads or writes, by name. */
export const EVENT_TABLES = { events: 'events', groups: 'eventGroup', langs: 'eventLanguageGroups', halls: 'halls', memberGroups: 'groups', locations: 'locations' };

/* ---------- rows, from Catalyst or from memory ---------- */

const memory = Object.fromEntries(Object.keys(EVENT_TABLES).map((k) => [k, []]));
let memoryId = 900000000000000n;
const KEEP_MS = 60_000;
const cache = new Map();

export function resetEventsMemory() {
  for (const k of Object.keys(memory)) memory[k] = [];
  cache.clear();
}

const ref = (k) => 'tbl:' + EVENT_TABLES[k];
/** Catalyst's datetime format, in IST like the rest of the office's columns. */
const stamp = (d = new Date()) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 19).replace('T', ' ');

async function rows(k) {
  if (!onCatalyst()) return memory[k];
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.rows;
  const got = await io.getRows(ref(k));
  cache.set(k, { at: Date.now(), rows: got });
  return got;
}

/** Forget what was read, so the next read is fresh: for rows the Noah API changes itself, such as passUsed. */
export const forgetEventRows = () => cache.clear();

/** The stored rows of one table, exactly as kept. For tests. */
export const storedRows = (k) => rows(k);

async function insertRow(k, row) {
  if (!onCatalyst()) {
    const made = { ROWID: String(memoryId++), CREATEDTIME: stamp(), MODIFIEDTIME: stamp(), ...row };
    memory[k].push(made);
    return made.ROWID;
  }
  const out = await io.insert(ref(k), row);
  cache.delete(k);
  const got = [].concat(out)[0]?.ROWID;
  if (typeof got === 'string' && got) return got;
  /* A ROWID read as a JSON number has lost its last digits (it is past 2^53). Find the row again instead: the
     newest one with this name. */
  const again = await rows(k);
  const mine = again.filter((r) => str(r.name) === str(row.name)).map((r) => BigInt(str(r.ROWID) || '0'));
  return mine.length ? String(mine.reduce((a, b) => (b > a ? b : a))) : '';
}

async function removeRow(k, rowId) {
  if (!onCatalyst()) {
    memory[k] = memory[k].filter((x) => x.ROWID !== String(rowId));
    return;
  }
  await io.remove(ref(k), [String(rowId)]);
  cache.delete(k);
}

async function updateRow(k, row) {
  if (!onCatalyst()) {
    const r = memory[k].find((x) => x.ROWID === String(row.ROWID));
    if (!r) throw new EventError(404, 'Not found.');
    Object.assign(r, row, { MODIFIEDTIME: stamp() });
    return;
  }
  await io.update(ref(k), row);
  cache.delete(k);
}

/* ---------- small readers ---------- */

const asBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const isLive = (r) => !asBool(r.isArchived) && !asBool(r.archived);
const str = (v) => (v === null || v === undefined ? '' : String(v));
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const idList = (v) => {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  const s = str(v).trim();
  if (!s) return [];
  try { const j = JSON.parse(s); if (Array.isArray(j)) return j.map(String).filter(Boolean); } catch { /* a comma list */ }
  return s.split(',').map((x) => x.trim()).filter(Boolean);
};
const parseFilters = (v) => {
  let j = {};
  try { j = typeof v === 'object' && v ? v : JSON.parse(str(v) || '{}'); } catch { j = {}; }
  return {
    pastor: asBool(j.forPastor), leader: asBool(j.forLeader), vip: asBool(j.forVip), prayerWarrior: asBool(j.forPrayerWarrior),
    memberGroups: idList(j.memberGroups),
  };
};
/** 'YYYY-MM-DD HH:mm:ss' (IST) -> 'YYYY-MM-DDTHH:mm', for a datetime-local input. */
const toLocalInput = (v) => (v ? str(v).replace(' ', 'T').slice(0, 16) : '');

/** A wall-clock time in a timezone -> the instant, as a Date. */
export function zonedToUtc(date, time, timeZone) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const seen = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess - (seen - guess));
}
const utcStamp = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const validZone = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

export const EXPENSES = [
  ['hall', 'expenseHall', 'Hall'], ['sound', 'expenseSound', 'Sound'], ['lights', 'lights', 'Lights'],
  ['musician', 'expenseMusician', 'Musicians'], ['media', 'expenseMedia', 'Media'], ['bus', 'expenseBus', 'Bus'],
  ['transport', 'expenseTransport', 'Transport'], ['photography', 'expensePhotography', 'Photography'],
  ['translator', 'expenseTranslator', 'Translator'],
];

/* ---------- the shape the console works with ---------- */

function eventOut(r) {
  const f = parseFilters(r.filters);
  return {
    id: str(r.ROWID),
    name: str(r.name),
    description: str(r.description),
    showOnDashboard: asBool(r.showOnDashboard),
    hideFromPublic: asBool(r.hideFromPublic),
    hideFromLeaders: asBool(r.hideFromLeaders),
    groupId: str(r.eventGroupId),
    tallyLedgerTitle: str(r.tallyLegderTitle),
    messageTitle: str(r.preachingTitle),
    preacherId: str(r.preacherId),
    date: Number(r.eventType) === 1 || !r.eventType ? str(r.eventValue).slice(0, 10) : '',
    publishAt: toLocalInput(r.publishDateTime),
    locationId: str(r.locationId),
    locationName: str(r.locationName),
    locationAddress: str(r.locationAddress),
    locationLat: str(r.locationLat),
    locationLon: str(r.locationLon),
    startTime: str(r.startTime).slice(0, 5),
    endTime: str(r.endTime).slice(0, 5),
    timezone: str(r.timezone) || 'Asia/Kolkata',
    hideFromDonation: asBool(r.hideFromDonation),
    visible: !asBool(r.isInvisible),
    maxAge: num(r.allowMaxAge),
    meetingLink: str(r.meetingLink),
    zoomId: str(r.zoomMeetingId),
    zoomPassword: str(r.zoomMeetingPassword),
    about: str(r.formattedDescription),
    photo: str(r.photo),
    terms: str(r.terms),
    termsFormatted: str(r.formattedTermsAndConditions),
    translation: str(r.translation),
    hallId: str(r.hallId),
    /* Booking: a pass is needed, and how many seats (empty = no limit). passUsed is the Noah API's count of passes taken. */
    passRequired: asBool(r.passRequired),
    seats: num(r.passAvailable),
    passUsed: num(r.passUsed) ?? 0,
    expenses: Object.fromEntries(EXPENSES.map(([k, col]) => [k, num(r[col])])),
    filters: f,
    blockedEventIds: idList(r.blockIfPassBookedFor),
    archived: !isLive(r),
    createdAt: str(r.CREATEDTIME).slice(0, 19),
  };
}

/** Console form -> the columns. Only what the form sends is written. */
function eventIn(v) {
  const row = {
    name: v.name, description: v.description,
    showOnDashboard: !!v.showOnDashboard, hideFromPublic: !!v.hideFromPublic, hideFromLeaders: v.hideFromLeaders ? 1 : 0,
    eventGroupId: v.groupId || null,
    tallyLegderTitle: v.tallyLedgerTitle, preachingTitle: v.messageTitle,
    preacherId: v.preacherId || '',
    eventType: 1, eventValue: v.date,
    publishDateTime: v.publishAt.replace('T', ' ') + ':00',
    locationId: v.locationId, locationName: v.locationName, locationAddress: v.locationAddress,
    locationLat: v.locationLat, locationLon: v.locationLon,
    startTime: v.startTime, endTime: v.endTime, timezone: v.timezone,
    startTimeUtc: utcStamp(zonedToUtc(v.date, v.startTime, v.timezone)),
    endTimeUtc: utcStamp(zonedToUtc(v.date, v.endTime, v.timezone)),
    hideFromDonation: !!v.hideFromDonation, isInvisible: !v.visible,
    allowMaxAge: v.maxAge ?? null,
    meetingLink: v.meetingLink, zoomMeetingId: v.zoomId, zoomMeetingPassword: v.zoomPassword,
    formattedDescription: v.about, photo: v.photo,
    terms: v.terms, formattedTermsAndConditions: v.termsFormatted, translation: v.translation,
    hallId: v.hallId || null,
    /* passUsed is never written here: it is the count of passes taken, kept by the Noah API. A new event starts it at 0. */
    passRequired: v.passRequired, passAvailable: v.seats,
    filters: JSON.stringify({
      forPastor: v.filters.pastor, forLeader: v.filters.leader, forVip: v.filters.vip,
      forPrayerWarrior: v.filters.prayerWarrior, memberGroups: v.filters.memberGroups,
    }),
    blockIfPassBookedFor: JSON.stringify(v.blockedEventIds),
  };
  for (const [k, col] of EXPENSES) row[col] = v.expenses[k] ?? null;
  return row;
}

/* ---------- checking a form ---------- */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LINK = /^https?:\/\/\S+$/i;
const text = (v, max) => str(v).trim().slice(0, max);

async function validateEvent(body, selfId) {
  const errors = {};
  const ex = body.expenses || {};
  const fl = body.filters || {};
  const v = {
    name: text(body.name, 200),
    description: text(body.description, 2000),
    showOnDashboard: !!body.showOnDashboard,
    hideFromPublic: !!body.hideFromPublic,
    hideFromLeaders: !!body.hideFromLeaders,
    groupId: text(body.groupId, 30),
    tallyLedgerTitle: text(body.tallyLedgerTitle, 200),
    messageTitle: text(body.messageTitle, 300),
    preacherId: text(body.preacherId, 30),
    date: text(body.date, 10),
    publishAt: text(body.publishAt, 16),
    locationId: text(body.locationId, 100),
    locationName: text(body.locationName, 200),
    locationAddress: text(body.locationAddress, 500),
    locationLat: text(body.locationLat, 20),
    locationLon: text(body.locationLon, 20),
    locationParts: body.locationParts && typeof body.locationParts === 'object' ? {
      area: text(body.locationParts.area, 200), city: text(body.locationParts.city, 100),
      state: text(body.locationParts.state, 100), country: text(body.locationParts.country, 100),
    } : null,
    startTime: text(body.startTime, 5),
    endTime: text(body.endTime, 5),
    timezone: text(body.timezone, 60) || 'Asia/Kolkata',
    hideFromDonation: !!body.hideFromDonation,
    visible: body.visible !== false,
    maxAge: body.maxAge === '' || body.maxAge === null || body.maxAge === undefined ? null : Number(body.maxAge),
    meetingLink: text(body.meetingLink, 500),
    zoomId: text(body.zoomId, 60),
    zoomPassword: text(body.zoomPassword, 60),
    about: cleanHtml(body.about || ''),
    photo: text(body.photo, 1000),
    terms: text(body.terms, 10000),
    termsFormatted: cleanHtml(body.termsFormatted || ''),
    translation: text(body.translation, 10000),
    hallId: text(body.hallId, 30),
    passRequired: !!body.passRequired,
    seats: body.seats === '' || body.seats === null || body.seats === undefined ? null : Number(body.seats),
    expenses: Object.fromEntries(EXPENSES.map(([k]) => [k, ex[k] === '' || ex[k] === null || ex[k] === undefined ? null : Number(ex[k])])),
    filters: {
      pastor: !!fl.pastor, leader: !!fl.leader, vip: !!fl.vip, prayerWarrior: !!fl.prayerWarrior,
      memberGroups: idList(fl.memberGroups),
    },
    blockedEventIds: idList(body.blockedEventIds).filter((id) => id !== selfId),
  };

  if (!v.name) errors.name = 'Give the event a name.';
  if (!DATE.test(v.date) || Number.isNaN(Date.parse(v.date))) errors.date = 'Choose the event date.';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.publishAt)) errors.publishAt = 'Choose when it is published.';
  if (!TIME.test(v.startTime)) errors.startTime = 'Choose the start time.';
  if (!TIME.test(v.endTime)) errors.endTime = 'Choose the end time.';
  else if (TIME.test(v.startTime) && v.endTime <= v.startTime) errors.endTime = 'The end time must be after the start time.';
  if (!validZone(v.timezone)) errors.timezone = 'Choose a timezone from the list.';
  if (v.maxAge !== null && (!Number.isInteger(v.maxAge) || v.maxAge < 1 || v.maxAge > 120)) errors.maxAge = 'A whole number of years, 1 to 120.';
  if (v.locationLat || v.locationLon) {
    const lat = Number(v.locationLat); const lon = Number(v.locationLon);
    if (!v.locationLat || !v.locationLon || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) {
      errors.locationName = 'Choose the place again from the search.';
    }
  }
  if (v.seats !== null && (!Number.isInteger(v.seats) || v.seats < 0 || v.seats > 1000000)) errors.seats = 'A whole number of seats, or leave it empty for no limit.';
  if (v.meetingLink && !LINK.test(v.meetingLink)) errors.meetingLink = 'A link starting with https://';
  if (v.photo && !LINK.test(v.photo)) errors.photo = 'A picture link starting with https://';
  for (const [k, , label] of EXPENSES) {
    const n = v.expenses[k];
    if (n !== null && (!Number.isFinite(n) || n < 0)) errors[`expenses.${k}`] = `${label}: an amount of 0 or more.`;
  }

  if (v.groupId && !(await rows('groups')).some((g) => isLive(g) && str(g.ROWID) === v.groupId)) errors.groupId = 'That event group no longer exists.';
  if (v.hallId && !(await rows('halls')).some((h) => isLive(h) && str(h.ROWID) === v.hallId)) errors.hallId = 'That hall no longer exists.';
  if (v.blockedEventIds.length) {
    /* An event that has since been archived or deleted just drops out of the list. */
    const known = new Set((await rows('events')).filter(isLive).map((e) => str(e.ROWID)));
    v.blockedEventIds = v.blockedEventIds.filter((id) => known.has(id));
  }

  if (Object.keys(errors).length) throw Object.assign(new EventError(400, 'Some details need attention.'), { errors });
  return v;
}

/* ---------- events ---------- */

/** Events whose day falls in [from, to] (inclusive, 'YYYY-MM-DD'), name containing `q`, soonest first.
    `archived` lists the archived ones instead, most recently archived first. */
export async function listEvents({ q = '', from = '', to = '', archived = false } = {}) {
  const needle = q.trim().toLowerCase();
  const all = await rows('events');
  if (archived) {
    return all.filter((r) => !isLive(r))
      .sort((a, b) => str(b.archivedOn).localeCompare(str(a.archivedOn)))
      .map(eventOut)
      .filter((e) => !needle || e.name.toLowerCase().includes(needle))
      .map(({ id, name, date, startTime, endTime, photo, locationName, visible, groupId }) => ({ id, name, date, startTime, endTime, photo, locationName, visible, groupId, archived: true }));
  }
  return all
    .filter(isLive)
    .map(eventOut)
    .filter((e) => (!needle || e.name.toLowerCase().includes(needle))
      && (!from || (e.date && e.date >= from)) && (!to || (e.date && e.date <= to)))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .map(({ id, name, date, startTime, endTime, photo, locationName, visible, groupId }) => ({ id, name, date, startTime, endTime, photo, locationName, visible, groupId }));
}

/** One event, with the names behind its ids. `nameOfMember(rowId)` -> { name, mobile } | null. */
export async function getEvent(id, nameOfMember) {
  const all = await rows('events');
  const r = all.find((x) => str(x.ROWID) === String(id));
  if (!r) throw new EventError(404, 'That event is not there any more.');
  const e = eventOut(r);
  const [groups, halls, memberGroups] = await Promise.all([rows('groups'), rows('halls'), rows('memberGroups')]);
  const nameIn = (list, rid) => str(list.find((x) => str(x.ROWID) === rid)?.name) || null;
  return {
    ...e,
    groupName: e.groupId ? nameIn(groups, e.groupId) : null,
    hallName: e.hallId ? nameIn(halls, e.hallId) : null,
    preacher: e.preacherId ? await nameOfMember(e.preacherId) : null,
    memberGroupNames: e.filters.memberGroups.map((g) => nameIn(memberGroups, g)).filter(Boolean),
    blockedEvents: e.blockedEventIds
      .map((bid) => all.find((x) => str(x.ROWID) === bid))
      .filter((x) => x && isLive(x))
      .map((x) => { const b = eventOut(x); return { id: b.id, name: b.name, date: b.date, startTime: b.startTime, endTime: b.endTime }; }),
  };
}

/** A place chosen on the map is kept in `locations`, so the next event can pick it from the saved list. A failure here
    never fails the event: the event already has the place written on it. */
async function rememberPlace(v) {
  if (!v.locationId || !v.locationLat || !v.locationLon || !v.locationName) return;
  try {
    if ((await rows('locations')).some((r) => str(r.locationId) === v.locationId && isLive(r))) return;
    const p = v.locationParts || {};
    await insertRow('locations', {
      locationId: v.locationId, name: v.locationName,
      area: p.area || v.locationAddress, city: p.city || '', state: p.state || '', country: p.country || '',
      lat: v.locationLat, lng: v.locationLon, createdOn: stamp(), archived: false,
    });
  } catch (err) {
    console.error(`[events] could not remember the place "${v.locationName}": ${err.message}`);
  }
}

export async function createEvent(body) {
  const v = await validateEvent(body, '');
  const id = await insertRow('events', { ...eventIn(v), passUsed: 0, isArchived: false, createdOn: stamp() });
  await rememberPlace(v);
  return { id, name: v.name };
}

export async function updateEvent(id, body) {
  const all = await rows('events');
  const r = all.find((x) => str(x.ROWID) === String(id));
  if (!r || !isLive(r)) throw new EventError(404, 'That event is not there any more.');
  const v = await validateEvent(body, String(id));
  await updateRow('events', { ROWID: String(id), ...eventIn(v), updatedOn: stamp() });
  await rememberPlace(v);
  return { id: String(id), name: v.name, before: eventOut(r).name };
}

export async function archiveEvent(id) {
  const r = (await rows('events')).find((x) => str(x.ROWID) === String(id));
  if (!r || !isLive(r)) throw new EventError(404, 'That event is not there any more.');
  await updateRow('events', { ROWID: String(id), isArchived: true, archivedOn: stamp() });
  return { name: str(r.name) };
}

export async function restoreEvent(id) {
  const r = (await rows('events')).find((x) => str(x.ROWID) === String(id));
  if (!r || isLive(r)) throw new EventError(404, 'That event is not in the archive.');
  await updateRow('events', { ROWID: String(id), isArchived: false, archivedOn: null });
  return { name: str(r.name) };
}

/** Delete an event for good. Only an archived one can be: archiving comes first. */
export async function deleteEvent(id) {
  const all = await rows('events');
  const r = all.find((x) => str(x.ROWID) === String(id));
  if (!r) throw new EventError(404, 'That event is not there any more.');
  if (isLive(r)) throw new EventError(409, 'Archive the event first. Only an archived event can be deleted.');
  await removeRow('events', id);
  /* Nothing should keep pointing at it: take it off any list of events that block pass booking. */
  for (const o of all) {
    const blocked = idList(o.blockIfPassBookedFor);
    if (blocked.includes(String(id))) {
      await updateRow('events', { ROWID: str(o.ROWID), blockIfPassBookedFor: JSON.stringify(blocked.filter((b) => b !== String(id))) });
    }
  }
  return { name: str(r.name) };
}

/* ---------- event groups ---------- */

function groupOut(r, langs) {
  const langId = str(r.eventLanguageGroupId);
  return {
    id: str(r.ROWID),
    name: str(r.name),
    description: str(r.description),
    languageGroupId: langId,
    languageGroupName: str(langs.find((l) => str(l.ROWID) === langId)?.name) || null,
    donationTeam: idList(r.donationCollectionTeam),
    scanningTeam: idList(r.scanningTeam),
    pastors: idList(r.connectedEmployees),
  };
}

export async function listGroups({ archived = false } = {}) {
  const [groups, langs, events] = await Promise.all([rows('groups'), rows('langs'), rows('events')]);
  const count = new Map();
  for (const e of events.filter(isLive)) count.set(str(e.eventGroupId), (count.get(str(e.eventGroupId)) || 0) + 1);
  return groups.filter((g) => isLive(g) !== archived).map((g) => ({ ...groupOut(g, langs), events: count.get(str(g.ROWID)) || 0, archived }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function validateGroup(body) {
  const v = {
    name: text(body.name, 200),
    description: text(body.description, 2000),
    languageGroupId: text(body.languageGroupId, 30),
    donationTeam: idList(body.donationTeam),
    scanningTeam: idList(body.scanningTeam),
    pastors: idList(body.pastors),
  };
  const errors = {};
  if (!v.name) errors.name = 'Give the group a name.';
  if (!v.languageGroupId) errors.languageGroupId = 'Choose the event language group.';
  else if (!(await rows('langs')).some((l) => isLive(l) && str(l.ROWID) === v.languageGroupId)) errors.languageGroupId = 'That language group no longer exists.';
  if (Object.keys(errors).length) throw Object.assign(new EventError(400, 'Some details need attention.'), { errors });
  return v;
}

const groupIn = (v) => ({
  name: v.name, description: v.description, eventLanguageGroupId: v.languageGroupId,
  donationCollectionTeam: JSON.stringify(v.donationTeam), scanningTeam: JSON.stringify(v.scanningTeam),
  connectedEmployees: JSON.stringify(v.pastors),
});

export async function createGroup(body) {
  const v = await validateGroup(body);
  const id = await insertRow('groups', { ...groupIn(v), isOnlyForKids: 0, isArchived: false, createdOn: stamp() });
  return { id, name: v.name };
}

export async function updateGroup(id, body) {
  const r = (await rows('groups')).find((x) => str(x.ROWID) === String(id));
  if (!r || !isLive(r)) throw new EventError(404, 'That event group is not there any more.');
  const v = await validateGroup(body);
  await updateRow('groups', { ROWID: String(id), ...groupIn(v), updatedOn: stamp() });
  return { id: String(id), name: v.name };
}

export async function archiveGroup(id) {
  const r = (await rows('groups')).find((x) => str(x.ROWID) === String(id));
  if (!r || !isLive(r)) throw new EventError(404, 'That event group is not there any more.');
  const inUse = (await rows('events')).filter(isLive).filter((e) => str(e.eventGroupId) === String(id)).length;
  if (inUse) throw new EventError(409, `${inUse} ${inUse === 1 ? 'event uses' : 'events use'} this group. Move ${inUse === 1 ? 'it' : 'them'} to another group first.`);
  await updateRow('groups', { ROWID: String(id), isArchived: true, archivedOn: stamp() });
  return { name: str(r.name) };
}

export async function restoreGroup(id) {
  const r = (await rows('groups')).find((x) => str(x.ROWID) === String(id));
  if (!r || isLive(r)) throw new EventError(404, 'That event group is not in the archive.');
  await updateRow('groups', { ROWID: String(id), isArchived: false, archivedOn: null });
  return { name: str(r.name) };
}

/** Delete an event group for good. Only an archived one, and only when no event (archived ones included) uses it. */
export async function deleteGroup(id) {
  const r = (await rows('groups')).find((x) => str(x.ROWID) === String(id));
  if (!r) throw new EventError(404, 'That event group is not there any more.');
  if (isLive(r)) throw new EventError(409, 'Archive the event group first. Only an archived one can be deleted.');
  const using = (await rows('events')).filter((e) => str(e.eventGroupId) === String(id)).length;
  if (using) throw new EventError(409, `${using} ${using === 1 ? 'event still uses' : 'events still use'} this group, including archived ones. Delete ${using === 1 ? 'it' : 'them'} or move ${using === 1 ? 'it' : 'them'} to another group first.`);
  await removeRow('groups', id);
  return { name: str(r.name) };
}

/* ---------- language groups, halls, member groups ---------- */

export async function listLanguageGroups() {
  return (await rows('langs')).filter(isLive).map((l) => ({ id: str(l.ROWID), name: str(l.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createLanguageGroup(body) {
  const name = text(body?.name, 120);
  if (!name) throw Object.assign(new EventError(400, 'Some details need attention.'), { errors: { name: 'Type a name, such as "Mumbai - English".' } });
  if ((await listLanguageGroups()).some((l) => l.name.toLowerCase() === name.toLowerCase())) {
    throw Object.assign(new EventError(409, `"${name}" is already there.`), { errors: { name: 'Already there.' } });
  }
  const id = await insertRow('langs', { name, isArchived: false, createdOn: stamp() });
  return { id, name };
}

/** What the forms choose from. */
export async function choices() {
  const [langs, halls, memberGroups, groups, places] = await Promise.all([listLanguageGroups(), rows('halls'), rows('memberGroups'), listGroups(), rows('locations')]);
  return {
    savedLocations: places.filter(isLive).map((p) => {
      const parts = [str(p.area), str(p.city), str(p.state), str(p.country)].filter(Boolean);
      return {
        id: str(p.locationId) || str(p.ROWID), name: str(p.name), area: str(p.area), city: str(p.city), state: str(p.state), country: str(p.country),
        address: parts.join(', '), lat: str(p.lat), lon: str(p.lng),
      };
    }).filter((p) => p.name && p.lat && p.lon).sort((a, b) => a.name.localeCompare(b.name)),
    languageGroups: langs,
    eventGroups: groups.map(({ id, name, languageGroupName }) => ({ id, name, languageGroupName })),
    halls: halls.filter(isLive).map((h) => ({ id: str(h.ROWID), name: str(h.name), seats: num(h.totalSeats) })),
    memberGroups: memberGroups.filter(isLive).map((g) => ({ id: str(g.ROWID), name: str(g.name) })),
    expenses: EXPENSES.map(([key, , label]) => ({ key, label })),
  };
}
