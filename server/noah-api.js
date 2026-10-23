/* The Noah API, built by the Catalyst developer.

   Decisions on a registration MUST go through here, not through the tables.
   The API updates the registration *and tells the member* — an email now, a
   push once Firebase is set up. Writing `Registrations.status` straight into
   the table changes the record and tells nobody, which is how someone ends
   up approved and never finding out.

   See ADMIN_INTEGRATION.md.

   ── Setup ────────────────────────────────────────────────────────────────
   In .env.local:

     NOAH_API_BASE=https://noah-60088815946.development.catalystserverless.in/server/noah_api
     NOAH_ADMIN_API_KEY=<from ADMIN_API_KEY.txt>

   The key lives on this server only. It never goes to the React app: anything
   the browser holds, anyone can read. The console calls this server, and this
   server calls Noah.

   Authentication is `X-Admin-Key`. NOT `Authorization: Bearer` — the Catalyst
   gateway rejects that.
   ──────────────────────────────────────────────────────────────────────── */

/* For the side effect: catalyst.js reads .env.local into process.env when it
   loads. Imported here so this module behaves the same whether it is reached
   through the server or straight from a script. */
import './catalyst.js';

const BASE = () => (process.env.NOAH_API_BASE || '').replace(/\/+$/, '');
const KEY = () => process.env.NOAH_ADMIN_API_KEY || '';

/** True when there is enough configuration to call Noah. */
export const noahConfigured = () => !!(BASE() && KEY());

/** Readable reasons for the codes the API documents. */
const EXPLAIN = {
  invalid_admin_key: 'The admin key is wrong or missing. Check NOAH_ADMIN_API_KEY in .env.local.',
  registration_not_found: 'Noah has no registration with that id.',
  member_not_found: 'Noah has no member with that id.',
  not_pending: 'That registration has already been decided. A decision can only be made once.',
  server_misconfigured: 'The Noah service is not fully configured. The Catalyst developer needs to look at it.',
  session_invalid: 'Noah refused the request without an admin key.',
};

export class NoahApiError extends Error {
  constructor(status, code, message) {
    super(EXPLAIN[code] || message || `Noah API ${status}`);
    this.name = 'NoahApiError';
    this.status = status;
    this.code = code;
  }
}

async function call(path, { method = 'GET', body, actor, raw = false } = {}) {
  if (!noahConfigured()) {
    throw new NoahApiError(503, 'not_configured',
      'The Noah API is not configured. Set NOAH_API_BASE and NOAH_ADMIN_API_KEY in .env.local.');
  }

  const res = await fetch(BASE() + path, {
    method,
    headers: {
      'X-Admin-Key': KEY(),
      /* Who is acting, for Noah's own logs. */
      ...(actor ? { 'X-Admin-Name': actor } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  /* Files come back as bytes, not JSON. */
  if (raw) {
    if (!res.ok) {
      const text = await res.text();
      let code = '';
      try { code = JSON.parse(text)?.error?.code ?? ''; } catch { /* not JSON */ }
      throw new NoahApiError(res.status, code, text.slice(0, 200));
    }
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') || 'application/octet-stream',
    };
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }

  if (!res.ok) {
    throw new NoahApiError(res.status, data?.error?.code, data?.error?.message);
  }
  return data;
}

/* ---------- registrations ---------- */

/** `status` is one of pending, approved, rejected, videoReturned, draft. */
export const listRegistrations = (status) =>
  call(`/admin/registrations${status ? `?status=${encodeURIComponent(status)}` : ''}`);

/** Everything the member entered, plus the file ids. */
export const getRegistration = (id) => call(`/admin/registrations/${encodeURIComponent(id)}`);

/**
 * Approve. The member is emailed by Noah.
 * `note` is an internal note — the member does NOT see it.
 */
export const approve = (id, { actor, note } = {}) =>
  call(`/admin/registrations/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    actor,
    body: { note: note || `Approved by ${actor || 'the office'}`, profileVerified: true },
  });

/**
 * Reject. `note` IS shown to the member, in the email and in the app.
 */
export const reject = (id, { actor, note }) =>
  call(`/admin/registrations/${encodeURIComponent(id)}/reject`, {
    method: 'POST', actor, body: { note },
  });

/**
 * Ask for the video again. `note` IS shown to the member.
 */
export const returnVideo = (id, { actor, note }) =>
  call(`/admin/registrations/${encodeURIComponent(id)}/return-video`, {
    method: 'POST', actor, body: { note },
  });

/**
 * Tell the member about a decision that is ALREADY stored.
 *
 * For a registration decided without the API (the key was not set at the time, so the
 * table was written and nobody was told). Sends the push, and the email if no phone could
 * be reached. Each member is told once: asking again answers `{ alreadySent: true }`.
 * Prefer approve / reject / returnVideo, which decide AND tell in one call.
 */
export const notify = (id, { actor } = {}) =>
  call(`/admin/registrations/${encodeURIComponent(id)}/notify`, { method: 'POST', actor, body: {} });

/**
 * What a `notified` answer means, in a sentence the office can read, and whether it is
 * good news. The API answers `{ pushed: <phones reached>, emailed: <bool> }`; an approval
 * emails only when no phone could be reached.
 */
export function describeNotified(n) {
  if (!n || typeof n !== 'object') return { text: '', ok: true, known: false };
  if (n.alreadySent) return { text: 'The member had already been told.', ok: true, known: true };
  const phones = Number(n.pushed) || 0;
  if (phones > 0) return { text: `Push notification sent to ${phones} phone${phones === 1 ? '' : 's'}.`, ok: true, known: true };
  if (n.emailed) return { text: 'No phone could be reached, so they were emailed.', ok: true, known: true };
  return { text: 'The member could not be reached: no phone with the app and no email.', ok: false, known: true };
}

/* ---------- roles ----------

   POST /admin/members/:id/roles  { pastor?: boolean, admin?: boolean }

   Making someone a pastor (or office staff) goes through here, because the API
   also sets the flags the office's own tools read. The other roles (prayer
   warrior, cell leader, pass scanner...) are plain columns on membersExtra and
   are written directly: there is no API call for them.

   Send only what is changing. `:id` is the member's ROWID — the Catalyst
   developer's ADMIN_SETUP.md does not say so in words, only that the call is
   made on a member, so the first real call confirms it; a 404 comes back as
   member_not_found and the caller falls back to writing the column itself. */
export const setMemberRoles = (memberRowId, roles, { actor } = {}) =>
  call(`/admin/members/${encodeURIComponent(memberRowId)}/roles`, {
    method: 'POST', actor, body: roles,
  });

/* ---------- files ----------

   This is how the office sees an upload. It goes through Noah rather than
   Catalyst File Store directly, which also means no File Store OAuth scope
   is needed — the admin key is enough. */
export const getFile = (fileId, { actor } = {}) =>
  call(`/admin/files/${encodeURIComponent(fileId)}`, { raw: true, actor });

/** Is the API reachable and is the key accepted? */
export async function check() {
  await listRegistrations('pending');
  return { ok: true, base: BASE() };
}

/* ---------- finding the right file id ----------

   `GET /admin/registrations/:id` returns "everything the member entered, plus
   file ids", but not in a shape this end has seen. Rather than guess one field
   name and break on the first real response, this walks the object and matches
   on what the keys are called.

   A value counts as a file id when it is a long digit string: Catalyst ids are
   ~19 digits. That rules out `attempt: 2` and the like. */

const KIND_WORDS = {
  video: ['video', 'kyc'],
  photo: ['photo', 'picture', 'selfie', 'avatar', 'image'],
  id: ['idproof', 'id_proof', 'idfile', 'aadhaar', 'identity', 'document', 'idcard'],
};

const looksLikeFileId = (v) =>
  (typeof v === 'string' && /^\d{10,}$/.test(v)) ||
  (typeof v === 'number' && Number.isInteger(v) && v > 1e9);

/**
 * Pull the file id for one kind ('video' | 'photo' | 'id') out of whatever the
 * registration detail looks like. Returns null when there is nothing matching,
 * which is a real answer: the member may not have uploaded it.
 */
export function findFileId(detail, kind) {
  const words = KIND_WORDS[kind] || [kind];
  const hits = [];

  const walk = (node, trail) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, trail));
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      const here = trail + ' ' + k;
      const flat = here.toLowerCase().replace(/[^a-z]/g, '');

      /* A row like { kind: 'video', fileId: '271450000000…' } names its kind
         in a sibling value, not in the key — so check the values too. */
      const named = words.some((w) => flat.includes(w.replace(/[^a-z]/g, '')))
        || words.some((w) => Object.values(node).some(
          (sv) => typeof sv === 'string' && sv.toLowerCase().replace(/[^a-z]/g, '') === w.replace(/[^a-z]/g, ''),
        ));

      if (looksLikeFileId(v)) {
        if (named) hits.push(String(v));
      } else {
        walk(v, here);
      }
    }
  };

  walk(detail, '');
  return hits[0] ?? null;
}
