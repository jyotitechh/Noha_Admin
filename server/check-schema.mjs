/* Does this code still match the Catalyst schema?

     npm run check:schema

   The Catalyst developer rebuilt the tables once already, and the first
   symptom of a dead table id is an error that does not say so. This asks
   Catalyst rather than waiting for a screen to break:

     1. does each table id in NOAH_TABLES still point at the table it names?
     2. does every column the code reads or writes exist on that table?

   Column names are only visible on a row, so an empty table cannot be checked.
   It says so, rather than passing it.

   Read-only. Exits 1 if anything is wrong, so it can gate a deploy. */

import { verifySchema } from './noah-schema.js';

const ok = '\x1b[32mok\x1b[0m';
const bad = '\x1b[31mFAIL\x1b[0m';
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

console.log('\nCatalyst schema\n' + '─'.repeat(64));

let report;
try {
  report = await verifySchema();
} catch (err) {
  console.log(`\n  ${bad}  could not read the project: ${err.message}\n`);
  process.exit(1);
}

let failed = 0;
for (const t of report) {
  const name = t.table.padEnd(20);
  if (!t.idOk) {
    failed++;
    console.log(`  ${bad}  ${name} id ${t.id} ${t.liveId ? `now belongs to a different table (${t.liveId})` : 'is not in the project'}`);
    continue;
  }
  if (t.error) {
    failed++;
    console.log(`  ${bad}  ${name} ${t.error}`);
    continue;
  }
  if (t.missing.length) {
    failed++;
    console.log(`  ${bad}  ${name} missing column${t.missing.length > 1 ? 's' : ''}: ${t.missing.join(', ')}`);
    continue;
  }
  const note = t.checked ? `columns checked, ${t.rows}+ rows` : (t.rows === 0 ? 'empty, so its columns could not be checked' : 'id only');
  console.log(`  ${ok}    ${name} ${dim(note)}`);
}

console.log('\n' + '─'.repeat(64));
console.log(failed ? `  ${failed} problem${failed > 1 ? 's' : ''}. Fix noah-schema.js, or ask the Catalyst developer what changed.\n` : '  The code matches the schema.\n');
process.exit(failed ? 1 : 0);
