/* Writes docs/CONTENT-TABLES.md from the definitions in content-types.js, so the
   document cannot drift from what the console really writes.

     node server/gen-content-doc.mjs
*/

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TYPES, SECTIONS, columnFor } from './content-types.js';
import { buildSpec } from './schema-spec.js';

const here = dirname(fileURLToPath(import.meta.url));
const spec = new Map(buildSpec().map((s) => [s.table, s]));

const how = (f) => {
  const bits = [];
  if (f.store === 'int') bits.push(f.kind === 'toggle' ? 'stored as 1 or 0' : f.kind === 'select' ? 'stored as its code number' : 'whole number');
  if (f.store === 'datetime') bits.push('a date, stored as a datetime');
  if (f.kind === 'ref') bits.push(`the id of a row in \`${TYPES.find((t) => t.id === f.ref)?.table}\``);
  if (f.required) bits.push('required');
  if (f.default) bits.push('on by default');
  return bits.join('; ');
};

let out = `# What the console writes to each content table

Generated from \`server/content-types.js\` by \`node server/gen-content-doc.mjs\`. Do not edit by hand.

The console can author the Daily Manna, prayers, confessions, the dream dictionary,
Noahgram, Noah Tube, the Bible school and the courses. Each kind is saved to a table
in the Catalyst project, found **by name**. **Every field below is a real column of
that table**: they were matched to the project's own tables, which the Catalyst
developer built from the office's SQL schema (the same one the client's Laravel
backend, \`noah-estone-dev\`, uses). Nothing needs adding; \`npm run catalyst:columns\`
checks that, and only ever adds.

Things to know:

- **Languages** are stored as a number, from the Laravel config
  (\`config/options.php\`): 1 English, 2 Hindi, 3 Marathi, 4 Telugu, 5 Malayalam,
  6 Tamil, 7 Kannada.
- **Toggles** are a boolean in some tables and an int (1 or 0) in others; the console
  writes whichever the column is.
- **\`ministryId\`** is left empty. Every member row in the project has it empty, so
  this project does not use it. If the Noah API ever filters on it, content written
  here would not appear, and it would need setting.
- **Created and updated times** are written to the table's own columns
  (\`created\`/\`updated\` or \`createdOn\`/\`updatedOn\`) in UTC, as the Laravel
  backend did. \`createdBy\` and \`writerId\` are not set.
- **Pictures** are a link to the picture, in the table's picture column. Uploading a
  file from the console is not available yet.
- The Laravel admin had a few fields these tables do not: a scripture line on the
  Daily Manna, start and end dates on prayers, a writer's name on confessions,
  comment and like limits on Noahgram. They are not in the console, because there is
  nowhere to put them.
`;

for (const [key, sec] of Object.entries(SECTIONS)) {
  out += `\n---\n\n## ${sec.label}: ${sec.desc}\n`;
  for (const t of TYPES.filter((x) => x.section === key)) {
    out += `\n### ${t.label}: table \`${t.table}\`\n\n${t.intro}\n\n| Field | Column | Stored as | Notes |\n|---|---|---|---|\n`;
    for (const f of t.fields) {
      const col = columnFor(f.key);
      const type = spec.get(t.table).columns.find((c) => c.column_name === col)?.data_type ?? '';
      out += `| ${f.label} | \`${col}\` | ${type} | ${how(f)} |\n`;
    }
    const extras = [];
    if (t.stamps) extras.push(`written on create: \`${t.stamps.created}\`; on change: \`${t.stamps.updated}\``);
    if (t.constants) extras.push(`always written: ${Object.entries(t.constants).map(([k, v]) => `\`${k} = ${v}\``).join(', ')}`);
    if (t.publish) extras.push(`"live" means \`${t.publish}\``);
    else extras.push('there is no draft state: an entry is simply there');
    out += `\n${extras.join('. ')}.\n`;
  }
}
writeFileSync(resolve(here, '..', 'docs', 'CONTENT-TABLES.md'), out);
console.log('wrote docs/CONTENT-TABLES.md,', out.split('\n').length, 'lines');
