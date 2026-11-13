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
  not_pending: 'That has already been decided. A decision can only be made once.',
  family_request_not_found: 'Noah has no family request with that id.',
  change_by_hand: 'That is the member\'s sign-in mobile number, so it cannot be approved here. Change it by hand in users and members, then turn the request down with a note such as "Changed".',
  server_misconfigured: 'The Noah service is not fully configured. The Catalyst developer needs to look at it.',
  session_invalid: 'Noah refused the request without an admin key.',
  event_not_found: 'Noah has no event with that id.',
  audit_unavailable: 'Attendance cannot be corrected yet: the appAttendanceAudit table is not in the Data Store.',
  pass_not_found: 'That pass is not one of this event\'s passes.',
  event_archived: 'That event is archived, so members are not told about it.',
  event_hidden: 'That event is hidden from members, so they are not told about it.',
  not_published_yet: 'That event is not published yet.',
  post_not_found: 'Noah has no Noahgram post with that id.',
};

export class NoahApiError extends Error {
  constructor(status, code, message, details) {
    super(EXPLAIN[code] || message || `Noah API ${status}`);
    this.name = 'NoahApiError';
    this.status = status;
    this.code = code;
    /* What else the API said about the refusal, such as the publish time of an event that is not published yet. */
    this.details = details || null;
  }
}

async function call(path, { method = 'GET', body, actor, staffId, raw = false } = {}) {
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
      /* The staff member's id (digits), stored with a scan or a correction. */
      ...(staffId ? { 'X-Admin-Staff-Id': String(staffId) } : {}),
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
    throw new NoahApiError(res.status, data?.error?.code, data?.error?.message, data?.error);
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
export async function notify(id, { actor } = {}) {
  const path = `/admin/registrations/${encodeURIComponent(id)}`;
  /* FOR-CONSOLE-REJECTED-REGISTRATIONS.md calls it `announce`; the live API has only `notify` so far
     (13 Nov 2026: announce answers 404). Ask for announce, and fall back when it is not there. */
  try {
    return await call(`${path}/announce`, { method: 'POST', actor, body: {} });
  } catch (err) {
    if (err.status !== 404 || err.code === 'registration_not_found') throw err;
    return call(`${path}/notify`, { method: 'POST', actor, body: {} });
  }
}

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

/* ---------- events ----------

   The console writes events to the table itself, so it asks Noah to tell the members (see server/event-announce.js).

   POST /admin/events/:id/announce  { force? }  -> { event, members, notified } | { alreadySent: true }
        404 event_not_found, 409 event_archived, 409 event_hidden, 409 not_published_yet (carries publishAt)
   POST /admin/events/announce-due  { hours? }  -> what it announced; every event whose publish time passed in the last
        24 hours (or `hours`, 1 to 24) and was not announced yet.

   An event is announced once: `force` tells everyone again. */
export const announceEvent = (id, { force = false, actor } = {}) =>
  call(`/admin/events/${encodeURIComponent(id)}/announce`, { method: 'POST', actor, body: force ? { force: true } : {} });

export const announceDue = ({ hours, actor } = {}) =>
  call('/admin/events/announce-due', { method: 'POST', actor, body: hours ? { hours } : {} });

/* ---------- entry passes, the door scanner and attendance ----------

   EVENTS-QR-CONTRACT.md. The console checks the permission itself before calling any of these: the Noah API does not know the
   console's roles. Every call names the staff member (X-Admin-Name, X-Admin-Staff-Id). Door staff scan in the Noah app
   (/staff/events/:id/scan with their own token), so the console never calls the scan endpoint itself.

   GET  /admin/events/:id/attendance          -> { event, registered, confirmed, checkedIn, notYetArrived, cancelled, attendancePercent, capped, recent }
   GET  /admin/events/:id/attendance/export   -> CSV
   POST /admin/events/:id/attendance/correct  { passId | memberId, action: present | absent, reason, staffId } */
export const eventAttendance = (eventId) => call(`/admin/events/${encodeURIComponent(eventId)}/attendance`);

export const eventAttendanceCsv = (eventId) => call(`/admin/events/${encodeURIComponent(eventId)}/attendance/export`, { raw: true });

export const attendanceAudit = (eventId, limit = 100) =>
  call(`/admin/events/${encodeURIComponent(eventId)}/attendance/audit?limit=${Number(limit) || 100}`);

/** The newest events, each with whether it is shown to members and why not (FOR-CONSOLE-EVENTS.md). */
export const eventDiagnostics = () => call('/admin/diagnostics/events');

export const correctAttendance = (eventId, { passId, memberId, action, reason, staffId, actor } = {}) =>
  call(`/admin/events/${encodeURIComponent(eventId)}/attendance/correct`, {
    method: 'POST', actor, staffId,
    body: { ...(passId ? { passId } : { memberId }), action, reason, ...(staffId ? { staffId: String(staffId) } : {}) },
  });

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

/* ---------- family requests ----------

   A member asks, from Me > Family in the app, to add a spouse, child, parent, brother, sister or
   anyone else. The office decides here; on approval the API links both accounts (or, for a child under
   18, adds the child and links them to the parent and the parent's spouse) and sends both a push.

   GET  /admin/family-requests?state=Pending|Approved|Rejected|Cancelled   -> { requests: [...] }
   POST /admin/family-requests/:id/decide { decision: 'Approved'|'Rejected', remark?, memberId? }

   `memberId` is only for a grown-up, to link a member the office picked when the number the member
   typed is not the one that person joined with. `remark` is shown to the member on a rejection. */
export const listFamilyRequests = async (state = 'Pending') => {
  const data = await call(`/admin/family-requests?state=${encodeURIComponent(state)}`);
  /* The note shows { requests: [...] }; a bare array is accepted too, rather than failing on the shape. */
  return Array.isArray(data) ? data : Array.isArray(data?.requests) ? data.requests : [];
};

export const decideFamilyRequest = (id, { decision, remark, memberId, actor } = {}) =>
  call(`/admin/family-requests/${encodeURIComponent(id)}/decide`, {
    method: 'POST', actor,
    body: { decision, ...(remark ? { remark } : {}), ...(memberId ? { memberId } : {}) },
  });

/* ---------- profile change requests ----------

   A member asks from Me > My information to change a detail, or their photo. The API writes the value in the right
   format (gender codes, dates, yes/no, phone split, addresses, income) and sends the member a push. Writing the table
   by hand does neither, and the app may keep showing the old value because the format has to match exactly.

   GET  /admin/profile-requests?status=pending|approved|rejected
        -> items { id, memberRowId, memberName, fieldId, oldValue, newValue, status, note, createdAt, newFileUrl?, oldFileUrl? }
   POST /admin/profile-requests/:id/decide  { decision: 'approve' | 'reject', note? }   -> { id, status, notified: { pushed } }

   `note` is shown to the member on a rejection. A photo request's `newValue` is a file id: read it with getFile.
   The member's main mobile number (phone1) answers 409 change_by_hand: it is their sign-in. */
export const listProfileRequests = async (status = 'pending') => {
  const data = await call(`/admin/profile-requests?status=${encodeURIComponent(status)}`);
  /* The note shows items; the list may come bare or wrapped, so neither is assumed. */
  if (Array.isArray(data)) return data;
  for (const k of ['requests', 'items', 'rows', 'data']) if (Array.isArray(data?.[k])) return data[k];
  return [];
};

export const decideProfileRequest = (id, { decision, note, actor } = {}) =>
  call(`/admin/profile-requests/${encodeURIComponent(id)}/decide`, {
    method: 'POST', actor,
    body: { decision, ...(note ? { note } : {}) },
  });

/* ---------- Noahgram ----------

   FOR-CONSOLE-NOAHGRAM.md. Every new post and reel waits for the office (`noahGram.isApproved` is false) and is shown to no one
   until it is approved. The decision goes through the API, which also tells the author; writing the table by hand tells nobody.

   GET  /admin/noahgram/pending                    -> the posts waiting (author with name and photo, caption, reel or not, file ref)
   POST /admin/noahgram/posts/:id/decide           { decision: 'approve' | 'reject', note? }
        approve: the post goes live and the author is told.  reject: it is archived (never deleted) and the author is told.
        The same reject takes down a post that is ALREADY live (a report, something unsuitable). */
export const listNoahgramPending = async () => {
  const data = await call('/admin/noahgram/pending');
  /* The note does not give the wrapper, so a bare list and the usual names are all accepted. */
  if (Array.isArray(data)) return data;
  for (const k of ['posts', 'items', 'pending', 'rows', 'data']) if (Array.isArray(data?.[k])) return data[k];
  return [];
};

export const decideNoahgramPost = (id, { decision, note, actor } = {}) =>
  call(`/admin/noahgram/posts/${encodeURIComponent(id)}/decide`, {
    method: 'POST', actor,
    body: { decision, ...(note ? { note } : {}) },
  });

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
