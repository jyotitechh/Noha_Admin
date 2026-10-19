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

/* A file id straight from the Files table, so the download is tried against
   something that really exists. */
const { getRows } = await import('./catalyst.js');
const { NOAH_TABLES } = await import('./noah-schema.js');
const files = await getRows(NOAH_TABLES.Files).catch(() => []);
const withId = files.filter((f) => f.catalystFileId);
console.log(`  Files table: ${files.length} rows, ${withId.length} with a catalystFileId`);
if (withId.length) {
  const sample = withId.find((f) => /video/i.test(f.kind || f.fileType || '')) || withId[0];
  console.log(`  trying ${JSON.stringify(sample).slice(0, 200)}\n`);
  await probe('download it', `/baas/v1/project/${PROJECT}/folder/${FOLDER}/file/${sample.catalystFileId}/download`);
}
console.log();
