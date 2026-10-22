/* Mock API for the Karuna Sadan admin console.

   It serves the same sample data as the HTML prototype, plus the two queues
   the prototype was missing: member registrations and prayer requests coming
   from the Noah mobile app.

   The member-facing routes under /api/app/* follow the contract in
   code/noah/docs/BACKEND_HANDOFF.md, so the Flutter app can point at this
   server and the admin's decisions will show up in it. See README.md.

   Prototype, not production: data lives in memory and resets on restart,
   there is no database, no file storage and no payment verification. */

import express from 'express';
import cors from 'cors';
import { db, audit, can, roleById, page, matches, find } from './db.js';
import { channels } from './deliver.js';
import { requestCode, verifyCode, requireSession, requirePerm, signOut, viewAs, listAccounts, checkPassphrase, passphraseRequired } from './auth.js';
import { testLoginEnabled, testLoginStatus, testOtp, listStaff } from './staff.js';
import { live, source, schema, surveyTables, listRegistrations, listMembers, listAudit, TABLES } from './store.js';
import { check, explainCatalyst, usage, ENVIRONMENT, PROJECT_ID } from './catalyst.js';
import { NOAH_TABLES, tableId, resolveTables, clearCache as clearReads } from './noah-schema.js';
import { queuesFor } from './queues.js';
import { now } from './seed/helpers.js';
import mountApp from './routes/app.js';
import mountAdmin from './routes/admin.js';
import mountStaff from './routes/staff.js';
import mountPeople from './routes/people.js';
import mountChanges from './routes/changes.js';
import mountContent from './routes/content.js';

/* The port, in order: one given on the command line (`node server/index.js 9000`, which is how
   Catalyst AppSail is started, so it never depends on a variable being injected), then
   X_ZOHO_CATALYST_LISTEN_PORT (AppSail), then PORT (Render), then 4000 for local development. */
const PORT = Number(/^\d+$/.test(process.argv[2] || '') ? process.argv[2] : 0)
  || Number(process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT) || 4000;
const app = express();

/* Who may call this API from a browser.

   In development the console is same-origin (Vite proxies /api), so this does
   not come up. Once the API is on its own host it does: the console is on
   another origin, and without this the browser blocks every call.

   `cors()` with no argument answers "yes" to every origin on the internet. The
   Authorization header means a stranger's page still cannot use your session,
   but there is no reason to let any site talk to this API, so it is a list.

   ALLOWED_ORIGINS is comma separated, e.g.
     https://karuna-admin-tnzlnait.onslate.in,https://ksm-admin.karunasadan.org
   Catalyst hosting and localhost are allowed without listing (below). Vercel is
   not: the console no longer lives there. */
const ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);

const LOCAL = /^http:\/\/localhost:\d+$/;
/* Catalyst's own hosting (Slate, Client Hosting): <name>-<id>.onslate.in (Slate), or
   <name>-<id>.<env>.catalystserverless.in / catalystslate.in. The session is a Bearer header, never a cookie, so a page on one of
   these cannot use anyone's session; it still has to sign in. ALLOWED_ORIGIN_SUFFIXES
   (comma separated, e.g. .karunasadan.org) adds more. */
const CATALYST_HOSTING = /^https:\/\/[a-z0-9.-]+\.(catalystserverless|catalystslate|onslate)\.(in|com|eu|com\.au)$/i;
const SUFFIXES = (process.env.ALLOWED_ORIGIN_SUFFIXES || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.startsWith('.') && s.length > 3);

app.use(cors({
  origin(origin, cb) {
    /* No Origin header: curl, a health check, the tests. Not a browser, so
       there is no cross-origin question to answer. */
    if (!origin) return cb(null, true);
    const clean = origin.replace(/\/+$/, '');
    const host = (() => { try { return new URL(clean).hostname.toLowerCase(); } catch { return ''; } })();
    if (ORIGINS.includes(clean) || LOCAL.test(clean) || CATALYST_HOSTING.test(clean)
        || (clean.startsWith('https://') && SUFFIXES.some((x) => host.endsWith(x)))) {
      return cb(null, true);
    }
    /* Refuse by not allowing, rather than by throwing: an error here becomes
       a 500 and hides what actually happened. */
    return cb(null, false);
  },
  /* The console sends the session as a Bearer header, not a cookie. */
  allowedHeaders: ['content-type', 'authorization'],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use(express.json({ limit: '2mb' }));

/* Small request log, so you can see the console talking to the API. */
app.use((req, _res, next) => {
  if (req.path !== '/api/health') console.log(`${req.method} ${req.originalUrl}`);
  next();
});

/* ---------- health and metadata ---------- */

/* Two different questions, deliberately not the same answer.

   A host's health check asks "is this process alive?" and restarts or rolls
   back the deploy when the answer is no. Catalyst being unreachable does not
   mean this server is broken — it means Zoho is having a moment — and failing
   the health check over it would take the console down in sympathy, during a
   deploy, with nothing saying why.

   So: always 200 while the process can answer. Catalyst's state is reported
   in the body, where a person can read it, and the probe is cached so a host
   pinging every few seconds does not make a round trip to Zoho each time. */
let probeCache = null;
let probeAt = 0;
const PROBE_TTL_MS = 5 * 60_000;

/* Asks Catalyst, and counts against its quota. Catalyst's Data Store free tier
   is finite — the allowance ran out once already — so this is only ever called
   when a person asks for it, never on a timer. */
async function catalystState(force = false) {
  if (!force && probeCache && Date.now() - probeAt < PROBE_TTL_MS) return probeCache;
  try {
    /* A table that exists in whichever schema is configured. */
    const probe = await check(schema() === 'noah' ? await tableId(NOAH_TABLES.members) : TABLES.Staff);
    probeCache = { projectId: probe.projectId, environment: ENVIRONMENT, reachable: true };
  } catch (err) {
    probeCache = { reachable: false, error: err.message };
  }
  probeAt = Date.now();
  return probeCache;
}

/* What a host's health check polls, every few seconds, for as long as the
   service exists. It must cost nothing, so it never touches Catalyst: it
   answers "is this process alive", and reports what was last learned about
   Catalyst from real traffic or from /api/health/catalyst.

   It used to make a Data Store fetch every thirty seconds, around the clock.
   That is roughly three thousand fetches a day spent to learn nothing. */
app.get('/api/health', async (req, res) => {
  const base = { ok: true, at: now(), dataSource: source() };
  /* What this process has spent of Catalyst's free allowance since it started. Free to ask. */
  if (live()) base.catalystSpent = usage();
  if (!live()) {
    return res.json({ ...base, seedPinnedTo: '2026-10-09T10:30 IST', note: 'In-memory sample data. Set CATALYST_* in .env.local to use Catalyst.' });
  }
  /* ?fresh=1 is a person debugging, and is allowed to spend a fetch. */
  if (req.query.fresh === '1') return res.json({ ...base, catalyst: await catalystState(true) });
  res.json({
    ...base,
    catalyst: probeCache || { reachable: null, note: 'Not checked yet. Use /api/health?fresh=1 or /api/health/catalyst.' },
  });
});

/* The strict version, for a human or a monitor that wants to be told off:
   503 when Catalyst cannot be reached. Not what the host polls. */
app.get('/api/health/catalyst', async (_req, res) => {
  const catalyst = await catalystState(true);
  res.status(catalyst.reachable ? 200 : 503).json({ ok: catalyst.reachable, at: now(), catalyst });
});

/* Every table in the connected project and how many rows it holds.

   Useful when pointing at someone else's project: it answers "what is
   actually in here" without opening the Catalyst console. Behind a session,
   because it describes the whole database. */
app.get('/api/survey', requireSession, async (_req, res) => {
  if (!live()) return res.status(409).json({ error: 'Not connected to Catalyst.', dataSource: 'memory' });
  try {
    const tables = await surveyTables();
    res.json({
      schema: schema(),
      total: tables.reduce((n, t) => n + (t.rows || 0), 0),
      withData: tables.filter((t) => t.rows > 0).length,
      tables: tables.map(({ table, rows, error, sample }) => ({
        table, rows, error,
        columns: sample ? Object.keys(sample).filter((k) => !['CREATORID', 'CREATEDTIME', 'MODIFIEDTIME'].includes(k)) : [],
      })),
    });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.get('/api/meta', (_req, res) => {
  res.json({
    me: db.ME,
    roles: db.ROLES.map((r) => ({ id: r.id, name: r.name, desc: r.desc, perms: r.perms })),
    permGroups: db.PERM_GROUPS,
    permLabels: db.PERM_LBL,
    /* Named so the console can label things without hard-coding strings. */
    locations: db.LOCS,
    languages: db.LANGS,
    pastors: db.PASTORS.map((p) => ({ id: p.id, name: p.name, loc: p.loc })),
    towards: db.TOWARDS,
    /* 'catalyst' or 'memory', so a screen can tell real data from the sample
       set and not promise things the real one cannot do. */
    dataSource: source(),
    signOn: 'local-otp',
    signOnNote: 'Zoho single sign-on is not wired up. Sign-in is a local email + one-time code.',
    /* So the sign-in screen knows to ask for the passphrase and to stop
       offering the staff account menu. Saying it is required gives nothing
       away; the passphrase itself never leaves the server. */
    passphraseRequired: passphraseRequired(),
    /* Which ways of getting a code are really set up: the sign-in screen says
       "we will text you" or "we will email you" only when that is true. */
    codeChannels: channels(),
  });
});

/* ---------- sign-in (no Zoho SSO) ---------- */

app.post('/api/auth/request-code', async (req, res) => {
  try {
    /* On a deployed API the one-time code comes back in this response, so
       this passphrase is the only thing between the internet and a signed-in
       super administrator. Locally it is not set and this is a no-op. */
    const gate = checkPassphrase(req.body?.passphrase, req.ip);
    if (!gate.ok) return res.status(gate.status || 401).json({ ok: false, error: gate.error, needsPassphrase: true });

    const r = await requestCode({ mobile: req.body?.mobile, email: req.body?.email });
    const { status, ...body } = r;
    if (r.retryAfter) res.set('Retry-After', String(r.retryAfter));
    res.status(status || (r.ok ? 200 : 400)).json(body);
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  try {
  const r = await verifyCode({ mobile: req.body?.mobile, email: req.body?.email }, req.body?.code || '');
  if (!r.ok) return res.status(400).json(r);
  audit(r.user.name, roleById(r.user.role).name, 'Signed in', 'Access', 'Staff account', null, { method: r.user.source === 'test' ? 'Test account' : req.body?.mobile ? 'Mobile one-time code' : 'Email one-time code' });
  res.json(r);
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.get('/api/auth/me', requireSession, (req, res) => res.json({ user: req.user }));

app.post('/api/auth/view-as', requireSession, (req, res) => {
  const user = viewAs(req.session.token, req.body?.role);
  if (!user) return res.status(400).json({ error: 'No such role.' });
  res.json({ user });
});

app.post('/api/auth/sign-out', requireSession, (req, res) => {
  signOut(req.session.token);
  res.json({ ok: true });
});

/* Who you could sign in as. Prototype affordance: a real console would never
   list its own staff accounts before sign-in. */
/* The prototype's "pick an account to try a role" list.

   It names every member of staff and their email. That is a convenience while
   building and a gift to anyone probing a public URL, so once a passphrase is
   set the list is not published. The sign-in form then asks for an address
   instead of offering a menu. */
app.get('/api/auth/accounts', async (_req, res) => {
  if (passphraseRequired()) {
    return res.status(403).json({ error: 'Not available on this deployment. Type your mobile number instead.' });
  }
  try {
    res.json(await listAccounts());
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

/* Everything past here needs a session. */
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth') || req.path === '/health' || req.path === '/meta' || req.path.startsWith('/app/')) return next();
  return requireSession(req, res, next);
});

/* ---------- work queues ---------- */

app.get('/api/queues', requireSession, async (req, res) => {
  try {
    res.json(await queuesFor(req.session.role, can));
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

/* ---------- generic read access to any collection ---------- */

/* Which permission guards which collection. Anything not listed is refused,
   so adding a collection to the seed does not silently expose it. */
const READ_PERM = {
  MEMBERS: 'members.view', FAMILIES: 'members.view', PASTORS: 'members.view', LEADERS: 'members.view',
  CELLS: 'members.view', LOCATIONS: 'members.view', LOC_GROUPS: 'members.view', MINISTRIES: 'members.view',
  TAGS: 'members.view', DUPES: 'members.edit', MAPREPORTS: 'pastoral.manage', LEADER_HISTORY: 'members.view',
  VIDEOKYC: 'members.edit', REGISTRATIONS: 'members.edit',
  RECEIPTS: 'giving.view', FAILED: 'giving.reconcile', SETTLEMENTS: 'giving.reconcile',
  UNMATCHED: 'giving.reconcile', REFUNDS: 'giving.reconcile', GATEWAYS: 'giving.view',
  PFORMS: 'giving.view', WEBHOOKS: 'giving.reconcile',
  ACCOUNTS: 'finance.view', JOURNALS: 'finance.view', INCOME_VOUCHERS: 'finance.view',
  NARRATIONS: 'finance.view', TDS: 'finance.view', VENDORS: 'finance.view', PROJECTS: 'finance.view',
  EXPENSES: 'finance.view', BANKS: 'finance.view', BATCHES: 'finance.view', TXNS: 'finance.view',
  DRAFTS: 'finance.post', BANK_IMPORTS: 'finance.view', IMPORT_REQS: 'finance.view', FIN_HEADS: 'finance.view',
  TRANSLATORS: 'finance.view', REWARD_TX: 'rewards.approve', REWARD_RATES: 'rewards.approve',
  EVENTS: 'events.view', HALLS: 'events.view', PASSES: 'events.view', SCANS: 'events.scan',
  ABSENTEES: 'events.view', SERVICES: 'events.view', SERVICE_HISTORY: 'events.view',
  CHECKLISTS: 'events.manage', EV_TASKS: 'events.manage', EV_EXPENSES: 'events.manage',
  BUS_ROUTES: 'events.view', BUS_ATT: 'events.view',
  MODQ: 'community.moderate', FLAGS: 'community.moderate', POLLS: 'community.moderate',
  COMPETITIONS: 'community.moderate', PRAYERS: 'community.moderate', PRAYER_INBOX: 'community.moderate',
  PRAISE: 'community.moderate', OBITS: 'community.moderate', FEEDBACK: 'community.moderate',
  MANNA: 'content.edit', LIBRARY: 'content.edit', STUDIES: 'content.edit', COURSES: 'content.edit',
  PLAYBACK: 'content.edit', VIDEOS: 'content.edit', LIVES: 'content.edit', PODCASTS: 'content.edit',
  CHANNELS: 'content.edit', BANNERS: 'content.edit', ANNOUNCEMENTS: 'content.edit', CTYPES: 'content.edit',
  BLISTS: 'comms.send', BROADCASTS: 'comms.send', PUSHES: 'comms.send', PTEMPLATES: 'comms.send',
  EMAILS: 'comms.send', MLISTS: 'comms.send', CALLCAMPS: 'comms.calls', CALLLOGS: 'comms.calls',
  THREADS: 'comms.inbox', SMSLOG: 'comms.send', SENDERS: 'comms.send', SMSTPL: 'comms.send',
  DRIVE: 'ops.view', FILES: 'ops.view', PRODUCTS: 'ops.view', ORDERS: 'ops.view', TASKS: 'ops.view',
  ASSETS: 'ops.view', INV: 'ops.view', MOVES: 'ops.view', WAREHOUSES: 'ops.view', INV_CATS: 'ops.view',
  SETTINGS: 'ops.settings', DEVICES: 'ops.settings', JOBS: 'ops.settings', REMINDERS: 'ops.settings',
  REFLISTS: 'ops.settings',
  JPROFILES: ['jodie.verify', 'jodie.manage'], VERIF_DONE: 'jodie.verify', STAGES: 'jodie.verify',
  QUESTIONS: 'jodie.manage', JBLOCKS: 'jodie.manage', JREPORTS: 'jodie.manage', JTHREADS: 'jodie.manage',
  JCALLS: 'jodie.calls', JCALLLOG: 'jodie.calls', OUTBOUND: 'jodie.calls', STORIES: 'jodie.manage',
  JCONTENT: 'jodie.manage', COLLEGES: 'jodie.manage',
  PLANS: 'subs.view', ADDONS: 'subs.view', SUBS: 'subs.view', JINVOICES: 'subs.view',
  JSETTLE: 'subs.manage', JUNMATCHED: 'subs.manage', CREDIT_NOTES: 'subs.manage',
  STAFF: 'staff.manage', ROLES: 'staff.manage', ENDPOINTS: 'staff.manage',
  AUD: 'audit.view', REPORTS: 'reports.view', SCHEDULES: 'reports.schedule', EXPORTS: 'reports.view',
};

/* Fields the free-text `q` searches, per collection. */
const SEARCH_FIELDS = {
  MEMBERS: ['name', 'id', 'mobile', 'email', 'loc', 'cell', 'status'],
  REGISTRATIONS: ['fullName', 'id', 'mobile', 'email', 'city', 'region'],
  RECEIPTS: ['id', 'name', 'ref', 'towards', 'mode', 'status'],
  JPROFILES: ['name', 'id', 'loc', 'job', 'edu'],
  EVENTS: ['name', 'id', 'place', 'status'],
  PASSES: ['id', 'name', 'event'],
  STAFF: ['name', 'email', 'title', 'id'],
  AUD: ['actor', 'action', 'mod', 'rec', 'id'],
  MANNA: ['id', 'title', 'verse', 'cat'],
  PRAYER_INBOX: ['id', 'text', 'category', 'state'],
};

app.get('/api/data/:name', requireSession, async (req, res) => {
  const name = req.params.name;
  const perm = READ_PERM[name];
  if (!perm) return res.status(404).json({ error: 'No such collection.' });
  if (!can(req.session.role, perm)) {
    return res.status(403).json({ error: 'You do not have access to this.', needs: [].concat(perm), youAre: roleById(req.session.role).name });
  }

  /* Collections that come from Catalyst when it is configured. Everything
     else still reads the in-memory sample data, so the console keeps working
     while the rest of the tables are built. */
  const FROM_CATALYST = {
    REGISTRATIONS: () => listRegistrations({ state: req.query.state, search: req.query.q }),
    MEMBERS: () => listMembers({ search: req.query.q, loc: req.query.loc, status: req.query.status }),
    AUD: () => listAudit(),
    /* Staff are members with a role, found by mobile number. The sample people
       are not staff once Catalyst is connected. */
    STAFF: async () => {
      const q = String(req.query.q || '').toLowerCase().trim();
      const rows = await listStaff();
      return q
        ? rows.filter((s) => [s.name, s.email, s.mobile, s.title, s.role].some((v) => String(v || '').toLowerCase().includes(q)))
        : rows;
    },
  };
  if (live() && FROM_CATALYST[name]) {
    try {
      return res.json(page(await FROM_CATALYST[name](), req.query));
    } catch (err) {
      const explained = explainCatalyst(err);
      return res.status(503).json({ error: explained?.message ?? err.message, ...(explained ? { code: explained.code } : {}) });
    }
  }

  /* Connected to Catalyst, but this collection has no table there.

     Returning the sample data would put invented receipts and events beside
     real members, and nobody looking at the screen could tell which was
     which. Better to show nothing and say why. */
  if (live()) {
    /* Where the thing they were probably looking for actually lives. An
       empty screen that does not say "but try over there" sends people
       hunting, or makes them think the data is missing. */
    const INSTEAD = {
      VIDEOKYC: 'The KYC videos members record when they register are under App registrations — open a registration and look at step 6.',
      PRAYERS: 'Prayer requests from the app are under Community → App prayer requests.',
      MODQ: 'Noahgram moderation has no table in this project yet.',
      RECEIPTS: 'Giving has no tables in this project yet.',
      EVENTS: 'Events have no tables in this project yet.',
      MANNA: 'Daily Manna has a table in this project, but it is empty.',
    };
    return res.json({
      rows: [], total: 0, offset: 0, limit: 0,
      notInProject: true,
      message: `There is no ${name} table in the connected Catalyst project.`,
      instead: INSTEAD[name] ?? null,
    });
  }

  const raw = db[name];
  if (!Array.isArray(raw)) return res.json({ rows: raw, total: 1, offset: 0, limit: 1 });

  let rows = raw;
  const { q, sort, dir, ...filters } = req.query;

  if (q && SEARCH_FIELDS[name]) rows = rows.filter((r) => matches(r, q, SEARCH_FIELDS[name]));

  /* Any other query parameter is an exact field match: ?state=pending */
  for (const [k, v] of Object.entries(filters)) {
    if (k === 'offset' || k === 'limit') continue;
    const wanted = String(v).split(',');
    rows = rows.filter((r) => wanted.includes(String(r[k])));
  }

  if (sort) {
    const sign = dir === 'desc' ? -1 : 1;
    rows = rows.slice().sort((a, b) => {
      const x = a[sort], y = b[sort];
      if (x == null) return 1;
      if (y == null) return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * sign;
    });
  }

  res.json(page(rows, req.query));
});

app.get('/api/data/:name/:id', requireSession, (req, res) => {
  const perm = READ_PERM[req.params.name];
  if (!perm) return res.status(404).json({ error: 'No such collection.' });
  if (!can(req.session.role, perm)) return res.status(403).json({ error: 'You do not have access to this.' });
  const row = find(req.params.name, req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  res.json(row);
});

/* ---------- module routes ---------- */

/* Express 4 does not catch a rejected promise from an async handler: the
   request simply never gets a reply, and the caller sits there until it times
   out. A phone showing a spinner for five minutes is a worse failure than an
   error message, so every async handler registered from here on hands its
   rejection to the error middleware below.

   Each route still catches what it expects — this is the floor, not the plan. */
for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
  const original = app[method].bind(app);
  app[method] = (path, ...handlers) =>
    original(path, ...handlers.map((h) => (
      typeof h === 'function' && h.length < 4
        ? (req, res, next) => { try { Promise.resolve(h(req, res, next)).catch(next); } catch (e) { next(e); } }
        : h
    )));
}

mountStaff(app, { requireSession, requirePerm });
mountPeople(app, { requireSession, requirePerm });
mountChanges(app, { requireSession, requirePerm });
mountContent(app, { requireSession, requirePerm });
mountAdmin(app, { requireSession, requirePerm });
mountApp(app);

/* ---------- errors ---------- */
/* Refresh: forget what was read from Catalyst, so the next screen asks again.
   Reads are kept for a minute to spare the free allowance, so a registration
   the app has just sent in can take that long to appear; this is the button for
   "now". At most once every ten seconds, so it cannot be used to run the
   allowance down. */
let lastRefresh = 0;
app.post('/api/refresh', requireSession, (_req, res) => {
  const wait = 10_000 - (Date.now() - lastRefresh);
  if (wait > 0) return res.status(429).json({ error: `Refreshed a moment ago. Try again in ${Math.ceil(wait / 1000)} seconds.` });
  lastRefresh = Date.now();
  clearReads();
  res.json({ ok: true });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'No such endpoint.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;

  /* Body-parser and friends set a status on what they throw. Malformed JSON
     is the caller's mistake, so it should say 400, not report the server as
     broken. */
  if (err?.status >= 400 && err.status < 500) {
    return res.status(err.status).json({
      error: err.type === 'entity.parse.failed'
        ? 'The request body is not valid JSON.'
        : err.message || 'That request could not be handled.',
    });
  }

  /* A Catalyst refusal is not this server falling over, and saying so helps
     whoever is looking at it work out which end to fix. */
  /* The two Catalyst failures that really happen get a plain explanation and a
     503: the console is fine, a service it depends on is not. */
  const explained = explainCatalyst(err);
  if (explained) return res.status(explained.status).json({ error: explained.message, code: explained.code });

  const fromCatalyst = /catalyst/i.test(err?.message || '');
  res.status(fromCatalyst ? 502 : 500).json({
    error: fromCatalyst
      ? `Catalyst refused the request: ${err.message}`
      : 'Something went wrong on the server.',
  });
});

/* A Catalyst hiccup should surface as a 503, not kill the API. */
process.on('unhandledRejection', (err) => console.error('[unhandled]', err?.message || err));

/* Find the Catalyst tables by name before the first request, so the first
   person in does not pay for the lookup. A failure is not fatal: the lookup is
   made again, lazily, by whatever needs a table. */
if (live() && schema() === 'noah') {
  try {
    const tables = await resolveTables();
    console.log(`  Catalyst project ${PROJECT_ID} (${ENVIRONMENT}): ${tables.size} tables found.`);
  } catch (err) {
    console.log(`  Could not list the Catalyst tables yet: ${err.message}`);
  }
}

app.listen(PORT, () => {
  console.log(`\n  Karuna Sadan admin — mock API on http://localhost:${PORT}`);
  console.log(`  Sample data pinned to Friday 9 October 2026, 10:30 IST.`);
  console.log(testLoginEnabled()
    ? `  Test sign-in is ON: +91 90000 00001 (super administrator) to ...10, one-time code ${process.env.NODE_ENV === 'production' ? 'from TEST_LOGIN_OTP' : testOtp()}.`
    : `  Test sign-in is off (${testLoginStatus().why}).`);
  console.log(`  Real staff sign in with their mobile number; see docs/CONSOLE-ACCESS.md.
`);
});
