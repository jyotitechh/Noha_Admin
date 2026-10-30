/* Storing what the office authors.

   One implementation for every content type in content-types.js. Two places it
   can live:

     Catalyst  the type's table in the Catalyst project, by NAME. Table ids are looked
               up from the project rather than written down, so a rebuilt table
               is found again.
     Sample    in memory, when there is no Catalyst connection at all.

   AGAINST CATALYST, A TABLE MAY NOT BE READY, and it is reported plainly rather
   than failing mysteriously: the table is missing from the project, or it lacks a
   column this kind writes (Catalyst then refuses the save and says which).
   The fields are the project's real columns, so on the current project both
   are expected not to happen; docs/CONTENT-TABLES.md lists them.

   What this never does is pretend. A save that did not reach Catalyst is an
   error, not a draft kept somewhere that members cannot see. */

import { io } from './noah-schema.js';
import { live, isNoah } from './store.js';
import { TYPES, typeById, columnFor, BOOKS } from './content-types.js';
import { sampleRows } from './content-seed.js';
import { cleanHtml, plainText, wordCount } from './rich.js';

export class ContentError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const onCatalyst = () => live() && isNoah();

const asBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const stampIst = (v) => {
  if (!v) return null;
  const d = new Date(String(v).replace(' ', 'T').slice(0, 19) + '+05:30');
  return Number.isNaN(+d) ? null : d;
};

/* ---------- reading a value, in the shape the console wants ---------- */

function readValue(field, v) {
  switch (field.kind) {
    case 'toggle': return asBool(v);
    case 'number': return v === null || v === undefined || v === '' ? null : Number(v);
    case 'date': return v ? String(v).slice(0, 10) : null;
    default: return v === null || v === undefined ? '' : String(v);
  }
}

function shape(def, row, id) {
  const out = { id };
  for (const f of def.fields) out[f.key] = readValue(f, row[columnFor(f.key)] ?? row[f.key]);
  out.live = def.publish ? !!out[def.publish] : true;
  out.createdAt = row.CREATEDTIME ? stampIst(row.CREATEDTIME) : row.createdAt ?? null;
  out.updatedAt = row.MODIFIEDTIME ? stampIst(row.MODIFIEDTIME) : row.updatedAt ?? null;
  return out;
}

/* ---------- rules that belong to one kind ---------- */

/** The 11-character id of a YouTube video, from a link or the id itself. */
const youtubeId = (s) => {
  const m = String(s).match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : /^[\w-]{11}$/.test(String(s)) ? String(s) : null;
};

/** A stored verse list -> [{ i, sc, sv, ec, ev }], or null when it is malformed. */
export function parseVerses(text) {
  const out = [];
  for (const part of String(text).split(';').map((p) => p.trim()).filter(Boolean)) {
    const [i, book, sc, sv, ec, ev] = part.split(',');
    const n = [i, sc, sv, ec, ev].map(Number);
    if (part.split(',').length !== 6 || n.some((x) => !Number.isInteger(x) || x < 0)) return null;
    if (BOOKS[n[0]] !== book || n[1] < 1 || n[2] < 1 || n[3] < n[1] || (n[3] === n[1] && n[4] < n[2])) return null;
    out.push({ i: n[0], sc: n[1], sv: n[2], ec: n[3], ev: n[4] });
  }
  return out;
}

const HOOKS = {
  bibleStudySteps(value) {
    const errors = {};
    if (value.youtubeId) {
      const id = youtubeId(value.youtubeId);
      if (!id) errors.youtubeId = 'That is not a YouTube link.';
      else {
        value.youtubeId = id;
        if (!value.youtubeThumbnail) value.youtubeThumbnail = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
      }
    }
    return errors;
  },
  bibleStudyQuizzes(value, { partial }) {
    if (partial) return {};
    const errors = {};
    const filled = [1, 2, 3, 4].filter((n) => value['option' + n]);
    if (filled.length < 2) errors.option2 = 'Give at least two options.';
    for (const n of [1, 2, 3, 4]) {
      if (value['option' + n + 'isAnswer'] && !value['option' + n]) errors['option' + n] = 'This is marked as a valid answer but has no text.';
    }
    if (!filled.some((n) => value['option' + n + 'isAnswer'])) errors.option1isAnswer = 'Tick at least one valid answer.';
    return errors;
  },
};

/* ---------- checking what was sent ---------- */

const TEXT_MAX = 255; /* a Catalyst varchar */
const LONG_MAX = 10000; /* Catalyst's own limit for a text column */

/**
 * Check a body against a type. Returns { value, errors }.
 * `partial` is an update: only what was sent is checked and returned.
 */
export function validate(def, body, { partial = false } = {}) {
  const value = {};
  const errors = {};

  for (const f of def.fields) {
    const present = Object.prototype.hasOwnProperty.call(body, f.key);
    if (partial && !present) continue;
    let v = body[f.key];

    /* A field that applies only in some cases (the donation amounts, when a donation is asked for)
       is not checked, and is cleared, when the case does not hold. */
    if (f.showIf && Object.prototype.hasOwnProperty.call(body, f.showIf.key) && !f.showIf.in.includes(String(body[f.showIf.key]))) {
      value[f.key] = f.kind === 'toggle' ? false : null;
      continue;
    }

    /* A toggle left out is off, unless the field says it starts on (an active category). */
    if (f.kind === 'toggle') { value[f.key] = present ? (v === true || v === 'true' || v === 1) : !!f.default; continue; }

    v = v === null || v === undefined ? '' : (typeof v === 'string' ? v.trim() : v);
    /* Formatted text is cleaned here, whatever the browser sent. An editor holding
       only empty paragraphs counts as empty. */
    if (f.kind === 'richtext' && typeof v === 'string') v = plainText(v) ? cleanHtml(v) : '';
    const empty = v === '';

    if (empty) {
      if (f.required) errors[f.key] = `${f.label} is needed.`;
      value[f.key] = null;
      continue;
    }

    switch (f.kind) {
      case 'number': {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) errors[f.key] = `${f.label} must be a number, zero or more.`;
        else value[f.key] = n;
        break;
      }
      case 'date': {
        const ok = /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(+new Date(v + 'T00:00:00Z'));
        if (!ok) errors[f.key] = `${f.label} must be a date, like 2026-10-19.`;
        else value[f.key] = String(v);
        break;
      }
      case 'select': {
        if (!f.options.some((o) => o.v === v)) errors[f.key] = `Pick one of the ${f.label.toLowerCase()} on offer.`;
        else value[f.key] = String(v);
        break;
      }
      case 'url': {
        /* http(s) only: a link that starts with anything else (javascript:, data:)
           has no business being stored and later put in front of members. */
        if (!/^https?:\/\/\S+$/i.test(String(v))) errors[f.key] = `${f.label} must be a web address starting http:// or https://.`;
        else if (String(v).length > 2000) errors[f.key] = `${f.label} is too long.`;
        else value[f.key] = String(v);
        break;
      }
      case 'color': {
        if (!/^#[0-9a-f]{6}$/i.test(String(v))) errors[f.key] = `${f.label} must be a colour, like #0A6BFF.`;
        else value[f.key] = String(v);
        break;
      }
      case 'richtext': {
        if (String(v).length > LONG_MAX) errors[f.key] = `${f.label} is too long (${LONG_MAX.toLocaleString('en-IN')} characters at most, counting the formatting).`;
        else value[f.key] = String(v);
        break;
      }
      case 'member': {
        if (!/^\d{1,20}$/.test(String(v))) errors[f.key] = `${f.label} is not valid.`;
        else value[f.key] = String(v);
        break;
      }
      case 'verses': {
        if (String(v).length > LONG_MAX || !parseVerses(v)) errors[f.key] = `${f.label} are not valid. Add them with the Add verse button.`;
        else value[f.key] = String(v);
        break;
      }
      case 'ref': {
        if (String(v).length > 64) errors[f.key] = `${f.label} is not valid.`;
        else value[f.key] = String(v);
        break;
      }
      default: {
        const max = f.kind === 'textarea' ? LONG_MAX : TEXT_MAX;
        if (String(v).length > max) errors[f.key] = `${f.label} is too long (${max.toLocaleString('en-IN')} characters at most).`;
        else value[f.key] = String(v);
      }
    }
  }
  Object.assign(errors, HOOKS[def.id]?.(value, { partial, body }) ?? {});
  return { value, errors };
}

/* ---------- Catalyst ---------- */

let tableIds = null;
let tableIdsAt = 0;

/** The id of a type's table, by name. Cached for ten minutes: a metadata call,
    not a Data Store fetch, but there is no reason to repeat it. */
async function tableIdFor(def) {
  if (!tableIds || Date.now() - tableIdsAt > 10 * 60_000) {
    tableIds = new Map((await io.listTables()).map((t) => [t.name, t.id]));
    tableIdsAt = Date.now();
  }
  const id = tableIds.get(def.table);
  if (!id) {
    throw new ContentError(409, `The Catalyst project has no table called ${def.table}.`, {
      notReady: true, code: 'no_table',
      hint: 'It is not in the Catalyst project. See docs/CONTENT-TABLES.md.',
    });
  }
  return id;
}

export const forgetTables = () => { tableIds = null; };

const REFUSED_HINT =
  'If it says a column does not exist, the table in the project differs from what the console expects. docs/CONTENT-TABLES.md lists the columns each kind writes, and `npm run catalyst:columns` compares them.';

/** Now, the way Catalyst wants a datetime: UTC, 'YYYY-MM-DD HH:mm:ss'. */
const stampNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/**
 * A checked value, as the row Catalyst stores. Some columns hold a value another
 * way than the form shows it: a toggle as 1 or 0, a language as its code number,
 * a date as a datetime (content-types.js says which). Also the row's own created
 * and updated times, which the Laravel backend filled in and the app may sort by,
 * and the constants a kind always carries.
 */
const toCatalyst = (def, value, { creating = false } = {}) => {
  const row = {};
  for (const f of def.fields) {
    if (!(f.key in value)) continue;
    let v = value[f.key];
    if (v !== null && v !== undefined) {
      if (f.store === 'int') v = f.kind === 'toggle' ? (v ? 1 : 0) : Number(v);
      else if (f.store === 'datetime' && f.kind === 'date') v = `${v} 00:00:00`;
    }
    row[columnFor(f.key)] = v;
  }
  /* The word count the Laravel backend kept, worked out from the message. */
  if (def.wordCount && typeof value.content === 'string') row[def.wordCount] = wordCount(value.content);
  const at = stampNow();
  if (creating) {
    Object.assign(row, def.constants || {});
    if (def.stamps?.created) row[def.stamps.created] = at;
  } else if (def.stamps?.updated) {
    row[def.stamps.updated] = at;
  }
  return row;
};

/* ---------- the sample set ---------- */

const memory = new Map();
const memoryRows = (def) => {
  if (!memory.has(def.id)) memory.set(def.id, sampleRows(def.id).map((r, i) => ({ ...r, _id: `${def.id}-${i + 1}` })));
  return memory.get(def.id);
};
let nextSample = 1000;

/* ---------- the operations ---------- */

const matchesQuery = (def, row, q) => {
  if (!q) return true;
  const n = q.toLowerCase();
  return def.fields.some((f) => ['text', 'textarea', 'richtext'].includes(f.kind) && String(row[f.key] ?? '').toLowerCase().includes(n));
};

/** The Daily Manna entries whose closing is of the kind `def` lists (a prayer or a confession),
    shaped like that kind's own rows. They are edited in the Daily Manna, not here. */
async function mannaClosings(def) {
  const m = typeById('manna');
  let src;
  try {
    src = onCatalyst()
      ? (await io.getRows(await tableIdFor(m))).map((r) => shape(m, r, String(r.ROWID)))
      : memoryRows(m).map((r) => shape(m, r, r._id));
  } catch (e) {
    if (e instanceof ContentError) return [];
    throw e;
  }
  return src
    .filter((x) => !!x.isConfession === def.fromManna.confession && x.prayer)
    .map((x) => ({
      id: x.id, [def.title]: x.title, content: x.prayer, [def.dateKey]: x.publishDate,
      contentLanguage: x.contentLanguage, writerId: x.writerId, visibleTo: x.visibleTo, image: x.image,
      published: x.published, live: x.published, createdAt: x.createdAt, updatedAt: x.updatedAt,
      from: 'manna', fromLabel: 'Daily Manna', source: x,
    }));
}

/** The name of what each row points at, as `<key>Label`, for the pointers a type lists as columns. */
async function addRefLabels(def, rows) {
  const refs = (def.columns || []).map((k) => def.fields.find((f) => f.key === k)).filter((f) => f?.kind === 'ref');
  for (const f of refs) {
    const target = typeById(f.ref);
    let src;
    try {
      src = onCatalyst()
        ? (await io.getRows(await tableIdFor(target))).map((r) => shape(target, r, String(r.ROWID)))
        : memoryRows(target).map((r) => shape(target, r, r._id));
    } catch (e) {
      if (e instanceof ContentError) continue;
      throw e;
    }
    const names = new Map(src.map((r) => [r.id, String(r[target.title] ?? '')]));
    for (const r of rows) r[f.key + 'Label'] = names.get(String(r[f.key])) ?? '';
  }
}

/** Every entry of a type, newest first. */
export async function listContent(typeId, { q = '', state = '' } = {}) {
  const def = typeById(typeId);
  if (!def) throw new ContentError(404, 'No such kind of content.');

  let rows;
  let notReady = null;

  if (onCatalyst()) {
    try {
      const id = await tableIdFor(def);
      const raw = await io.getRows(id);
      rows = raw.map((r) => shape(def, r, String(r.ROWID)));
    } catch (e) {
      if (!(e instanceof ContentError)) throw e;
      rows = [];
      notReady = { code: e.extra.code, why: e.message, hint: e.extra.hint };
    }
  } else {
    rows = memoryRows(def).map((r) => shape(def, r, r._id));
  }

  /* A Daily Manna ends in a prayer or a confession. The ones that end in this kind
     are listed here too, marked as coming from the Daily Manna. */
  if (def.fromManna) rows = rows.concat(await mannaClosings(def));

  rows = rows.filter((r) => matchesQuery(def, r, q));
  if (state === 'live') rows = rows.filter((r) => r.live);
  if (state === 'draft') rows = rows.filter((r) => !r.live);

  if (def.columns) await addRefLabels(def, rows);

  if (def.sort) {
    const num = (v) => (v === '' || v === null || v === undefined ? Infinity : Number(v));
    rows.sort((a, b) => {
      for (const k of def.sort) {
        const x = a[k], y = b[k];
        const c = typeof x === 'number' || typeof y === 'number' ? num(x) - num(y) : String(x ?? '').localeCompare(String(y ?? ''));
        if (c) return c;
      }
      return 0;
    });
    return { rows, total: rows.length, source: onCatalyst() ? 'catalyst' : 'sample', notReady };
  }

  rows.sort((a, b) => {
    const k = def.dateKey;
    const x = k ? a[k] || '' : '', y = k ? b[k] || '' : '';
    if (x !== y) return x < y ? 1 : -1;
    return String(a[def.title]).localeCompare(String(b[def.title]));
  });

  return { rows, total: rows.length, source: onCatalyst() ? 'catalyst' : 'sample', notReady };
}

export async function createContent(typeId, body, { canPublish }) {
  const def = typeById(typeId);
  if (!def) throw new ContentError(404, 'No such kind of content.');
  const { value, errors } = validate(def, body ?? {});
  if (Object.keys(errors).length) throw new ContentError(400, 'Some answers need fixing.', { errors });
  if (def.publish && value[def.publish] && !canPublish) {
    throw new ContentError(403, 'Your role can write this but not publish it. Save it as a draft.');
  }

  if (onCatalyst()) {
    const id = await tableIdFor(def);
    try {
      await io.insert(id, toCatalyst(def, value, { creating: true }));
    } catch (e) {
      throw new ContentError(502, `Catalyst refused it: ${e.message}`, { hint: REFUSED_HINT });
    }
    return { ok: true, title: value[def.title] };
  }
  const rows = memoryRows(def);
  rows.push({ ...value, _id: `${def.id}-${nextSample++}`, createdAt: new Date(), updatedAt: new Date() });
  return { ok: true, title: value[def.title] };
}

export async function updateContent(typeId, id, body, { canPublish }) {
  const def = typeById(typeId);
  if (!def) throw new ContentError(404, 'No such kind of content.');
  const { value, errors } = validate(def, body ?? {}, { partial: true });
  if (Object.keys(errors).length) throw new ContentError(400, 'Some answers need fixing.', { errors });
  if (def.publish && def.publish in value && value[def.publish] && !canPublish) {
    throw new ContentError(403, 'Your role can edit this but not publish it.');
  }

  if (onCatalyst()) {
    const tid = await tableIdFor(def);
    try {
      await io.update(tid, { ROWID: String(id), ...toCatalyst(def, value) });
    } catch (e) {
      throw new ContentError(502, `Catalyst refused it: ${e.message}`, { hint: REFUSED_HINT });
    }
    return { ok: true, title: value[def.title] };
  }
  const row = memoryRows(def).find((r) => r._id === id);
  if (!row) throw new ContentError(404, 'No such entry.');
  Object.assign(row, value, { updatedAt: new Date() });
  return { ok: true, title: row[def.title] };
}

export async function publishContent(typeId, id, on, ctx) {
  const def = typeById(typeId);
  if (!def) throw new ContentError(404, 'No such kind of content.');
  if (!def.publish) throw new ContentError(400, `${def.label} have no publish step: they are simply there.`);
  return updateContent(typeId, id, { [def.publish]: !!on }, ctx);
}

export async function deleteContent(typeId, id) {
  const def = typeById(typeId);
  if (!def) throw new ContentError(404, 'No such kind of content.');

  if (onCatalyst()) {
    const tid = await tableIdFor(def);
    try {
      await io.remove(tid, [String(id)]);
    } catch (e) {
      throw new ContentError(502, `Catalyst refused it: ${e.message}`, { hint: REFUSED_HINT });
    }
    return { ok: true };
  }
  const rows = memoryRows(def);
  const at = rows.findIndex((r) => r._id === id);
  if (at < 0) throw new ContentError(404, 'No such entry.');
  const [gone] = rows.splice(at, 1);
  return { ok: true, title: gone[def.title] };
}

/** What a type is called, for the audit log. */
export const titleOf = (typeId, row) => {
  const def = typeById(typeId);
  return def ? String(row?.[def.title] ?? '').slice(0, 80) : '';
};

export { TYPES };
