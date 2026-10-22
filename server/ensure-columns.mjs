/* Add what the Catalyst project is missing for the console.

     npm run catalyst:columns             shows what is missing (changes nothing)
     npm run catalyst:columns -- --apply  creates it

   Only ever adds columns. It never creates a table (the project is at its cap), alters or
   removes anything that is there, and it leaves the Noah tables themselves to the
   Catalyst developer. What it wants is in schema-spec.js.

   Needs the Self Client token to carry tables.ALL and tables.columns.ALL:
   `npm run catalyst:scopes` prints the list. */

import { configured, listTables, listColumns, createColumns, createTable, PROJECT_ID, ORG_ID, ENVIRONMENT } from './catalyst.js';
import { buildSpec, plan, apply } from './schema-spec.js';

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const doApply = process.argv.includes('--apply');

console.log('\nCatalyst: what the console needs\n' + '─'.repeat(64));

if (!configured()) {
  console.log(`
  Not connected. .env.local needs CATALYST_PROJECT_ID, CATALYST_ORG_ID,
  CATALYST_CLIENT_ID, CATALYST_CLIENT_SECRET and CATALYST_REFRESH_TOKEN.
  See docs/CATALYST-SETUP.md for how to get the last three.
`);
  process.exit(1);
}
console.log(`  Project ${PROJECT_ID}, organisation ${ORG_ID}, ${ENVIRONMENT}\n`);

const api = { listTables, listColumns, createTable, createColumns };

let planned;
try {
  planned = await plan(buildSpec(), api);
} catch (err) {
  console.log(`  ${red('FAIL')}  could not read the project: ${err.message}\n`);
  process.exit(1);
}

const label = {
  ok: green('ok  '), 'add-columns': '+cols', 'create-table': 'NEW ', absent: red('GONE'), 'too-wide': red('FULL'),
};
for (const p of planned) {
  const what = p.state === 'ok' ? dim('complete')
    : p.state === 'create-table' ? `table does not exist; would create it with ${p.missing.length} columns`
    : p.state === 'absent' ? 'is not in the project (the Catalyst developer\'s table; not created here)'
    : p.state === 'too-wide' ? p.problem
    : `missing ${p.missing.length}: ${p.missing.map((c) => `${c.column_name} (${c.data_type})`).join(', ')}`;
  console.log(`  ${label[p.state]} ${p.table.padEnd(22)} ${what}`);
  for (const n of p.notes) console.log(`         ${dim(n)}`);
}

const todo = planned.filter((p) => p.state === 'add-columns' || p.state === 'create-table');
const blocked = planned.filter((p) => p.state === 'absent' || p.state === 'too-wide');
console.log('\n' + '─'.repeat(64));

if (!todo.length) {
  console.log(`  Nothing to add.${blocked.length ? ` ${blocked.length} table${blocked.length > 1 ? 's need' : ' needs'} the Catalyst developer.` : ''}\n`);
  process.exit(blocked.length ? 1 : 0);
}

if (!doApply) {
  const cols = todo.reduce((n, p) => n + p.missing.length, 0);
  console.log(`  ${todo.length} table${todo.length > 1 ? 's' : ''} to change, ${cols} column${cols > 1 ? 's' : ''} to add.`);
  console.log('  Nothing has been changed. To create them:\n\n    npm run catalyst:columns -- --apply\n');
  process.exit(0);
}

console.log('  Creating…\n');
const results = await apply(todo, api);
let failed = 0;
for (const r of results) {
  if (r.error) { failed++; console.log(`  ${red('FAIL')}  ${r.table.padEnd(22)} ${r.error}`); }
  else console.log(`  ${green('ok')}    ${r.table.padEnd(22)} ${r.created ? 'table created; ' : ''}${r.done.length} column${r.done.length === 1 ? '' : 's'} added`);
}

/* Read it back rather than trust the replies. */
console.log('\n  Checking what Catalyst now has…\n');
/* Catalyst's column list can lag a moment behind a create call, so look again a few
   times before calling anything missing. */
let still = [];
for (let attempt = 0; attempt < 5; attempt++) {
  if (attempt) await new Promise((r) => setTimeout(r, 2000));
  const after = await plan(buildSpec(), api);
  still = after.filter((p) => results.some((r) => r.table === p.table) && p.missing.length);
  if (!still.length) break;
}
for (const p of still) console.log(`  ${red('STILL MISSING')} ${p.table}: ${p.missing.map((c) => c.column_name).join(', ')}`);
if (!still.length) console.log(`  ${green('Everything that was asked for is there.')}`);

console.log(`\n  Now run: npm run check:schema\n`);
process.exit(failed || still.length ? 1 : 0);
