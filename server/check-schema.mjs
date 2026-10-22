/* Does this code still match the Catalyst schema?

     npm run check:schema

   The Catalyst developer has rebuilt the tables twice already, and the first
   symptom of a missing table or column is an error that does not say so. This
   asks Catalyst rather than waiting for a screen to break:

     1. is each table the console uses in the project, by name?
     2. does every column the code reads or writes exist on that table?

   Columns are asked of Catalyst directly, so an empty table is checked as well
   as a full one, and it costs no Data Store fetches.

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
  if (t.optional && !t.exists) {
    console.log(`  ${dim('--')}    ${name} ${dim('not created yet (optional): npm run catalyst:columns -- --apply creates it')}`);
    continue;
  }
  if (!t.exists) {
    failed++;
    console.log(`  ${bad}  ${name} is not in the Catalyst project`);
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
  console.log(`  ${ok}    ${name} ${dim(t.checked ? `${t.columns} columns, all the console uses are there` : 'exists')}`);
}

console.log('\n' + '─'.repeat(64));
console.log(failed
  ? `  ${failed} problem${failed > 1 ? 's' : ''}. Run npm run catalyst:columns to see what is missing, or ask the Catalyst developer.\n`
  : '  The code matches the schema.\n');
process.exit(failed ? 1 : 0);
