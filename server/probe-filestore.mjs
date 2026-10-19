/* What can this token actually reach in File Store?

     node server/probe-filestore.mjs [folderId]

   Throwaway diagnostic. Prints the real status and body for each route so the
   answer is Zoho's, not a guess. */

import { accessToken } from './catalyst.js';

const FOLDER = process.argv[2] || '27145000000071527';
const PROJECT = process.env.CATALYST_PROJECT_ID;
const ORG = process.env.CATALYST_ORG_ID;
const API = 'https://api.catalyst.zoho.in';

const at = await accessToken();
console.log(`\n  project ${PROJECT}   org ${ORG}   folder ${FOLDER}\n`);

async function probe(label, path) {
  try {
    const res = await fetch(API + path, {
      headers: { authorization: 'Zoho-oauthtoken ' + at, 'CATALYST-ORG': ORG },
    });
    const text = await res.text();
    console.log(`  ${String(res.status).padEnd(4)} ${label}`);
    console.log(`       ${path}`);
    console.log(`       ${text.slice(0, 220).replace(/\s+/g, ' ')}\n`);
    return { status: res.status, text };
  } catch (err) {
    console.log(`  ERR  ${label}: ${err.message}\n`);
    return { status: 0, text: err.message };
  }
}

await probe('list folders', `/baas/v1/project/${PROJECT}/folder`);
await probe('this folder', `/baas/v1/project/${PROJECT}/folder/${FOLDER}`);
await probe('files in it', `/baas/v1/project/${PROJECT}/folder/${FOLDER}/file`);

/* A file id straight from the files table, so the download is tried against
   something that really exists. `files.path` is the File Store id; the row's
   own ROWID is what the Noah API's /admin/files/:id takes. */
const { getRows } = await import('./catalyst.js');
const { NOAH_TABLES } = await import('./noah-schema.js');
const files = await getRows(NOAH_TABLES.files).catch(() => []);
const withId = files.filter((f) => f.path);
console.log(`  files table: ${files.length} rows, ${withId.length} with a path (the File Store id)`);
if (withId.length) {
  const sample = withId.find((f) => String(f.fileType) === '3') || withId[0];
  console.log(`  trying files row ${sample.ROWID}: fileType ${sample.fileType}, ${sample.extension}, ${sample.size} bytes
`);
  await probe('download it', `/baas/v1/project/${PROJECT}/folder/${FOLDER}/file/${sample.path}/download`);
}
console.log();
