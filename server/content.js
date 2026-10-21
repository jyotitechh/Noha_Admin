/* Storing what the office authors.

   One implementation for every content type in content-types.js. Two places it
   can live:

     Catalyst  the type's table in noah-backend, by NAME. Table ids are looked
               up from the project rather than written down, so a rebuilt table
               is found again.
     Sample    in memory, when there is no Catalyst connection at all.

   AGAINST CATALYST, TWO THINGS MAY NOT BE READY, and both are reported plainly
   rather than failing mysteriously:

     - The table does not exist (Noah Tube's `videos` and `videoCategories` are
       among the tables the office's schema left out, because Catalyst caps a
       project at 191).
     - The table exists but has no columns. Most content tables are empty shells
       until the Catalyst developer adds them; a save is then refused by
       Catalyst. docs/CONTENT-TABLES.md lists the columns to add.

   What this never does is pretend. A save that did not reach Catalyst is an
   error, not a draft kept somewhere that members cannot see. */

import { io } from './noah-schema.js';
import { live, isNoah } from './store.js';
import { TYPES, typeById } from './content-types.js';
import { sampleRows } from './content-seed.js';

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
  for (const f of def.fields) out[f.key] = readValue(f, row[f.key]);
  out.live = def.publish ? !!out[def.publish] : true;
  out.createdAt = row.CREATEDTIME ? stampIst(row.CREATEDTIME) : row.createdAt ?? null;
  out.updatedAt = row.MODIFIEDTIME ? stampIst(row.MODIFIEDTIME) : row.updatedAt ?? null;
  return out;
}

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

    if (f.kind === 'toggle') { value[f.key] = v === true || v === 'true' || v === 1; continue; }

    v = v === null || v === undefined ? '' : (typeof v === 'string' ? v.trim() : v);
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
      hint: 'It needs creating by the Catalyst developer. See docs/CONTENT-TABLES.md.',
    });
  }
  return id;
}

export const forgetTables = () => { tableIds = null; };

const REFUSED_HINT =
  'If it says a column does not exist, the table has not been given its columns yet. docs/CONTENT-TABLES.md lists them.';

/** Catalyst wants dates as YYYY-MM-DD and nulls as null. */
const toCatalyst = (def, value) => {
  const row = {};
  for (const [k, v] of Object.entries(value)) row[k] = v;
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
  return def.fields.some((f) => ['text', 'textarea'].includes(f.kind) && String(row[f.key] ?? '').toLowerCase().includes(n));
};

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

  rows = rows.filter((r) => matchesQuery(def, r, q));
  if (state === 'live') rows = rows.filter((r) => r.live);
  if (state === 'draft') rows = rows.filter((r) => !r.live);

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
      await io.insert(id, toCatalyst(def, value));
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
