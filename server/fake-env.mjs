/* Imported FIRST by fake-catalyst.mjs. ES modules run their imports in order,
   so this has set the environment before catalyst.js reads it.

   Everything is pointed at "offline", unconditionally. That is the safety:
   even if a call somehow bypassed the fake it would be signed with nothing, and
   a machine with real credentials in .env.local cannot reach the real project
   from a test by accident. */
Object.assign(process.env, {
  CATALYST_SCHEMA: 'noah',
  CATALYST_PROJECT_ID: 'offline',
  CATALYST_ORG_ID: 'offline',
  CATALYST_CLIENT_ID: 'offline',
  CATALYST_CLIENT_SECRET: 'offline',
  CATALYST_REFRESH_TOKEN: 'offline',
});
