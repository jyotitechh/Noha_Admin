/* What the Catalyst project must hold for the console to work, as data.

   `npm run catalyst:columns` compares this with the live project and, with
   --apply, creates what is missing. Nothing here is ever changed or removed in
   Catalyst: only added.

   Three groups:

     the Noah tables       users, members, membersExtra, files, appRegistrations,
                           appChangeRequests. The Catalyst developer owns these and
                           says they are complete, so a gap is reported and, on
                           --apply, filled; the tables themselves are never created.
     consoleStaff          the console's own table: which member holds which console
                           role. Created if the project has room (Catalyst caps a
                           project's tables).
     content tables        what the office authors (content-types.js): daily manna,
                           prayers, Noahgram, courses. Most exist as empty shells.
                           Noah Tube's two do not exist and are created.

   Types are Catalyst's: varchar, text, int, bigint, double, boolean, date,
   datetime. Where the developer's own column already exists with another type it
   is left alone and reported. */

import { EXPECTED_COLUMNS } from './noah-schema.js';
import { TYPES, columnFor } from './content-types.js';

/** Catalyst's limit on columns in one table. */
export const MAX_COLUMNS = 104;

/* A type for a column the developer's schema should already have. Only used
   for one that turns out to be missing, so a wrong guess costs one column that
   can be fixed in the Catalyst console, never an existing one. */
const BOOLEAN = /^(is[A-Z_]|allow[A-Z]|archived$|declarationAccepted$|profileVerified$|smoking$|drink$|form_submit$)/;
const DATETIME = /(At|On)$/;
const DATE = new Set(['dateOfBirth', 'anniversaryDate']);
const BIGINT = new Set([
  'memberRowId', 'reviewedByRowId', 'uid', 'userId', 'connectedPastor', 'connectedLeader',
  'idProofFileId', 'videoFileId', 'videoBytes', 'size', 'annualIncome',
]);
const INT = new Set(['gender', 'fileType', 'videoSeconds', 'video_consent_submit']);
const LONG = new Set(['reviewNote', 'signatureText', 'remoteSource', 'note', 'alertListComment', 'oldValue', 'newValue']);

export function guessType(column) {
  if (BOOLEAN.test(column)) return { data_type: 'boolean' };
  if (DATE.has(column)) return { data_type: 'date' };
  if (DATETIME.test(column) || column === 'dateOfJoining') return { data_type: 'datetime' };
  if (BIGINT.has(column)) return { data_type: 'bigint' };
  if (INT.has(column)) return { data_type: 'int' };
  if (LONG.has(column)) return { data_type: 'text' };
  return { data_type: 'varchar', max_length: 255 };
}

const KIND_TYPE = {
  text: { data_type: 'varchar', max_length: 255 },
  select: { data_type: 'varchar', max_length: 255 },
  color: { data_type: 'varchar', max_length: 255 },
  textarea: { data_type: 'text' },
  url: { data_type: 'text' },
  date: { data_type: 'date' },
  toggle: { data_type: 'boolean' },
  number: { data_type: 'double' },
  ref: { data_type: 'bigint' },
};

/** The console's own table. */
export const CONSOLE_STAFF = [
  { column_name: 'memberRowId', data_type: 'bigint' },
  { column_name: 'role', data_type: 'varchar', max_length: 255 },
  { column_name: 'status', data_type: 'varchar', max_length: 255 },
  { column_name: 'title', data_type: 'varchar', max_length: 255 },
  { column_name: 'grantedBy', data_type: 'varchar', max_length: 255 },
  { column_name: 'grantedAt', data_type: 'datetime' },
  { column_name: 'lastSignedInAt', data_type: 'datetime' },
];

/** Every table the console needs, with the columns it needs on each. */
export function buildSpec() {
  const spec = [];

  for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
    if (table === 'consoleStaff') continue;
    spec.push({
      table, group: 'Noah tables', create: false,
      columns: columns.filter((c) => c !== 'id').map((c) => ({ column_name: c, ...guessType(c) })),
    });
  }

  spec.push({ table: 'consoleStaff', group: 'Console', create: true, columns: CONSOLE_STAFF });

  for (const t of TYPES) {
    spec.push({
      table: t.table, group: `Content: ${t.label}`,
      /* Noah Tube's two tables are not in the project. */
      create: ['videos', 'videoCategories'].includes(t.table),
      columns: t.fields.map((f) => ({ column_name: columnFor(f.key), ...(KIND_TYPE[f.kind] || KIND_TYPE.text) })),
    });
  }
  return spec;
}

/* ---------- comparing with the project ---------- */

/** Catalyst reports a type with its own spelling; compare on the family. */
const family = (t) => String(t || '').toLowerCase().replace(/\(.*$/, '').trim();

/**
 * Work out what is missing. `api` is { listTables, listColumns }, so a test can
 * give it a fake. Nothing is changed here.
 *
 * Returns [{ table, group, state, missing: [column spec], notes: [string], problem? }]
 * state: 'ok' | 'add-columns' | 'create-table' | 'absent' (missing, and not ours to create)
 */
export async function plan(spec, api) {
  const tables = new Map((await api.listTables()).map((t) => [t.name, String(t.id)]));
  const out = [];

  for (const s of spec) {
    const entry = { table: s.table, group: s.group, id: tables.get(s.table) || null, missing: [], notes: [] };

    if (!entry.id) {
      entry.state = s.create ? 'create-table' : 'absent';
      entry.missing = s.columns;
      out.push(entry);
      continue;
    }

    const have = await api.listColumns(entry.id);
    const byName = new Map(have.map((c) => [c.name, c]));
    entry.columnCount = have.length;
    entry.missing = s.columns.filter((c) => !byName.has(c.column_name));
    for (const c of s.columns) {
      const there = byName.get(c.column_name);
      if (there && family(there.type) && family(there.type) !== family(c.data_type)) {
        entry.notes.push(`${c.column_name} is ${there.type} in Catalyst; the console expected ${c.data_type}. Left alone.`);
      }
    }
    if (entry.missing.length && have.length + entry.missing.length > MAX_COLUMNS) {
      entry.state = 'too-wide';
      entry.problem = `It has ${have.length} columns and needs ${entry.missing.length} more; Catalyst allows ${MAX_COLUMNS} in a table.`;
    } else {
      entry.state = entry.missing.length ? 'add-columns' : 'ok';
    }
    out.push(entry);
  }
  return out;
}

/**
 * Carry out a plan. `api` also has { createTable, createColumns }. Each table is
 * done on its own and a failure on one does not stop the rest. Returns the plan
 * with `done` and `error` filled in. Only ever adds.
 */
export async function apply(planned, api) {
  const results = [];
  for (const p of planned) {
    const r = { ...p, done: [], error: null };
    try {
      if (p.state === 'create-table') {
        r.id = await api.createTable(p.table);
        if (!r.id) throw new Error('Catalyst did not say what the new table\'s id is.');
        r.created = true;
      }
      if ((p.state === 'create-table' || p.state === 'add-columns') && p.missing.length) {
        await api.createColumns(r.id, p.missing);
        r.done = p.missing.map((c) => c.column_name);
      }
    } catch (err) {
      r.error = err.message;
    }
    results.push(r);
  }
  return results;
}
