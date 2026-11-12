/* Noahgram, as the console moderates it (FOR-CONSOLE-NOAHGRAM.md).

   Members post pictures and reels in the app. Every new one waits for the office (`noahGram.isApproved` is false) and nobody
   sees it, not even on the share link, until it is approved.

   WHERE THINGS COME FROM
     waiting posts          the Noah API (GET /admin/noahgram/pending)
     the decision           the Noah API (POST .../decide): it makes the post live or archives it AND tells the author.
                            Writing `isApproved` by hand tells nobody, so this file never does.
     posts that are live    the `noahGram` table: newest first, approved and not archived. The API has no list of them.
     comments               the `comments` table (component = 2): removing one is `isArchived` and one fewer on the post's count,
                            hiding one is `notApproved`. The API has no call for this, so it is the table.
     pictures and videos    `files` through the Noah API (GET /admin/files/:id), served by our own server, and only for a file
                            that belongs to a post (never an id typed in by whoever is asking).

   A member's name on Noahgram is always their own: first, middle and last name, with no title. */

import { io, NOAH_TABLES as T, fileMeta } from './noah-schema.js';
import { listNoahgramPending } from './noah-api.js';

const asBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const text = (v) => String(v ?? '').trim();

/* Two clocks (see noah-schema.js): Catalyst's own CREATEDTIME is IST, a time the API sends carries its own zone. */
const zoned = (v, zone) => {
  if (!v) return null;
  const s = String(v).trim().replace(' ', 'T');
  const d = new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : s.slice(0, 19) + zone);
  return Number.isNaN(+d) ? null : d;
};
const asDate = (v) => zoned(v, '+05:30');
const asUtc = (v) => zoned(v, 'Z');

/* ---------- who posted ---------- */

const NAMES_MS = 60_000;
let names = null;
let namesAt = 0;
export const forgetNoahgram = () => { names = null; pending = null; reportedCount = null; };

const memberName = (m) => [m.firstName, m.middleName, m.lastName].map(text).filter(Boolean).join(' ');

async function nameMap() {
  if (names && Date.now() - namesAt < NAMES_MS) return names;
  const rows = await io.getRows(T.members);
  const map = new Map();
  for (const m of rows) {
    const name = memberName(m);
    if (name) { map.set(String(m.ROWID), name); if (m.id != null) map.set(String(m.id), name); }
  }
  names = map; namesAt = Date.now();
  return map;
}

const authorOf = (map, memberId, fallback = '') => {
  const id = text(memberId);
  if (!id || id === '0') return { id: '', name: fallback || 'The office' };
  return { id, name: map.get(id) || fallback || 'A member' };
};

/* ---------- pictures and videos ---------- */

/** A column holds `file:<files row id>`, or a plain https link the office wrote. */
export function refOf(v) {
  const s = text(v);
  const f = s.match(/^file:(\d{6,})$/);
  if (f) return { kind: 'file', id: f[1] };
  if (/^https?:\/\//i.test(s)) return { kind: 'url', url: s };
  return null;
}

/** Which column a post's picture, video or still image is in. A reel's video is `cloudflareLink`. */
function columnsOf(r) {
  const reel = asBool(r.addToReels) || (!!text(r.cloudflareLink) && !text(r.photo));
  const main = reel ? (refOf(r.cloudflareLink) || refOf(r.photo)) : (refOf(r.photo) || refOf(r.cloudflareLink));
  return { reel, main, still: refOf(r.videoImage) };
}

/** What the screen is given for one of the two: our own address for a stored file, the link itself for a plain one. */
const mediaUrl = (postId, which, ref) => {
  if (!ref) return null;
  return ref.kind === 'url' ? { url: ref.url, external: true } : { url: `/noahgram/posts/${postId}/media/${which}`, external: false };
};

/** The file id behind a post's picture or video, read from the POST, so a caller can only ever fetch what a post points at. */
export async function mediaOfPost(postId, which) {
  const row = await io.getRow(T.noahGram, postId);
  if (!row) return { error: 'No such post.', status: 404 };
  const ref = columnsOf(row)[which === 'still' ? 'still' : 'main'];
  if (!ref) return { error: `This post has no ${which === 'still' ? 'still picture' : 'picture or video'}.`, status: 404 };
  if (ref.kind === 'url') return { redirect: ref.url };
  let mime = '';
  try { mime = fileMeta(await io.getRow(T.files, ref.id))?.mimeType || ''; } catch { /* the type is a nicety */ }
  return { fileId: ref.id, mime, reel: columnsOf(row).reel };
}

/* ---------- posts ---------- */

function shapeRow(r, map, state) {
  const { reel, main, still } = columnsOf(r);
  const id = String(r.ROWID);
  return {
    id, state,
    author: authorOf(map, r.memberId),
    caption: text(r.caption),
    reel,
    media: { src: mediaUrl(id, 'main', main), still: mediaUrl(id, 'still', still) },
    at: asDate(r.CREATEDTIME),
    likes: Number(r.likes) || 0,
    comments: Number(r.comments) || 0,
    views: Number(r.counter) || 0,
    pinned: asBool(r.isPinned),
  };
}

/** Posts that members can see now: approved and not archived. Newest first. */
export async function livePosts({ limit = 100 } = {}) {
  const [rows, map] = await Promise.all([io.getRows(T.noahGram), nameMap()]);
  return rows
    .filter((r) => asBool(r.isApproved) && !asBool(r.isArchived))
    .map((r) => shapeRow(r, map, 'live'))
    .sort((a, b) => (+(b.at ?? 0)) - (+(a.at ?? 0)))
    .slice(0, Math.min(500, Math.max(1, Number(limit) || 100)));
}

/** One item from GET /admin/noahgram/pending. The wrapper is not written down, so the usual names are all read. */
export function shapePending(item, map = new Map()) {
  const id = text(item.id ?? item.postId ?? item.ROWID);
  const author = item.author && typeof item.author === 'object' ? item.author : {};
  const memberId = item.memberId ?? author.id ?? author.memberId;
  const who = authorOf(map, memberId, text(author.name ?? item.authorName ?? item.memberName ?? item.name));
  /* A name the API gave is its own; ours fills a gap only. */
  const named = text(author.name ?? item.authorName ?? item.memberName);
  const refs = {
    main: refOf(item.cloudflareLink) || refOf(item.photo) || refOf(item.file) || refOf(item.fileRef) || refOf(item.media),
    still: refOf(item.videoImage),
  };
  const reel = asBool(item.isReel ?? item.reel ?? item.addToReels) || /reel/i.test(text(item.type ?? item.kind));
  return {
    id, state: 'pending',
    author: { id: who.id, name: named || who.name },
    caption: text(item.caption ?? item.text ?? item.content),
    reel,
    /* The picture or video is looked up from the post itself when it is asked for, so a link is only taken as it stands. */
    media: {
      src: refs.main?.kind === 'url' ? { url: refs.main.url, external: true } : { url: `/noahgram/posts/${id}/media/main`, external: false },
      still: reel ? (refs.still?.kind === 'url' ? { url: refs.still.url, external: true } : { url: `/noahgram/posts/${id}/media/still`, external: false }) : null,
    },
    at: asUtc(item.createdAt ?? item.created ?? item.at) || asDate(item.CREATEDTIME),
    likes: 0, comments: 0, views: 0, pinned: false,
  };
}

/** Posts waiting for the office, oldest first (the one that has waited longest is the one to look at). */
export async function pendingPosts() {
  const [items, map] = await Promise.all([listNoahgramPending(), nameMap().catch(() => new Map())]);
  return items.map((i) => shapePending(i, map)).filter((p) => p.id).sort((a, b) => (+(a.at ?? 0)) - (+(b.at ?? 0)));
}

/* The queue badge asks on every page load; a short cache keeps it from calling Noah each time. A decision clears it. */
let pending = null;
let pendingAt = 0;
export async function cachedPending() {
  if (pending && Date.now() - pendingAt < 30_000) return pending;
  pending = await pendingPosts();
  pendingAt = Date.now();
  return pending;
}

/* ---------- comments ----------

   One table for Daily Manna and Noahgram comments (FOR-CONSOLE-REPORTS-AND-EDUCATION.md): `component` 1 is a Daily Manna
   (componentId = the dailyMana row), 2 is a Noahgram post (componentId = the noahGram row). Members can report a comment: the API
   raises `flagged`, and at three different reporters sets `hide` to 1 (an int). It never deletes one: the office decides.

   A comment is NOT shown in the app when `hide` is 1, `notApproved` is true or `isArchived` is true. */

/* The Daily Manna table. Not in NOAH_TABLES: the content screens already own the name dailyMana (server/content-types.js). */
const MANNA_TABLE = 'tbl:dailyMana';
/* Who reported what: one row per member per comment (memberId, component 3 = a Manna comment or 4 = a Noahgram comment, componentId = the
   comment, created). Kept by the API in the office's own table, so it does not expire (REPORT-A-COMMENT-ERROR.md). */
const REPORTS_TABLE = 'tbl:flaggedComponentStats';
const reportComponent = (commentComponent) => (Number(commentComponent) === 1 ? 3 : 4);
const MANNA = 1;
const POST = 2;
const hiddenNow = (c) => Number(c.hide) === 1 || asBool(c.notApproved);
const whoWrote = (map, c) => {
  const own = [text(c.firstName), text(c.lastName)].filter(Boolean).join(' ');
  return authorOf(map, c.memberId, own);
};

/** The comments and replies under one Noahgram post, oldest first. Removed ones are not listed; hidden ones are, marked. */
export async function commentsOn(postId) {
  const [rows, map] = await Promise.all([io.getRows(T.comments), nameMap()]);
  return rows
    .filter((c) => Number(c.component) === POST && String(c.componentId) === String(postId) && !asBool(c.isArchived))
    .map((c) => ({
      id: String(c.ROWID),
      parentId: text(c.parentId) && text(c.parentId) !== '0' ? String(c.parentId) : null,
      author: whoWrote(map, c),
      text: text(c.content),
      hidden: hiddenNow(c),
      reports: Number(c.flagged) || 0,
      at: asDate(c.CREATEDTIME),
    }))
    .sort((a, b) => (+(a.at ?? 0)) - (+(b.at ?? 0)));
}

/** UTC, the way the API writes a time. */
const nowUtc = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/**
 * Decide one comment.
 *   remove  take it off for good (isArchived, archivedOn) and lower the parent's comment count by one, never below 0
 *   hide    hide it from members without removing it (hide = 1)
 *   show    show a hidden one again (hide = 0, notApproved off)
 *   keep    it was reported unfairly: clear the reports and any hiding (flagged = 0, hide = 0)
 * `components` says which kinds of comment the caller may touch: the Noahgram screen only its own.
 */
export async function moderateComment(commentId, action, { components = [POST] } = {}) {
  const c = await io.getRow(T.comments, commentId);
  if (!c || !components.includes(Number(c.component))) return { error: 'No such comment.', status: 404, code: 'not_found' };
  if (asBool(c.isArchived)) return { error: 'That comment has already been removed.', status: 409, code: 'already_removed' };
  const row = { ROWID: String(c.ROWID) };

  if (action === 'hide') {
    if (hiddenNow(c)) return { error: 'That comment is already hidden.', status: 409, code: 'already_hidden' };
    row.hide = 1;
  } else if (action === 'show') {
    if (!hiddenNow(c)) return { error: 'That comment is not hidden.', status: 409, code: 'not_hidden' };
    row.hide = 0; row.notApproved = false;
  } else if (action === 'keep') {
    row.flagged = 0; row.hide = 0;
    /* Those members can report it again if it earns it. */
    const mine = (await io.getRows(REPORTS_TABLE)).filter((r) => Number(r.component) === reportComponent(c.component) && String(r.componentId) === String(c.ROWID));
    if (mine.length) await io.remove(REPORTS_TABLE, mine.map((r) => String(r.ROWID)));
  } else if (action === 'remove') {
    row.isArchived = true; row.archivedOn = nowUtc();
  } else {
    return { error: 'Choose keep, hide, show or remove.', status: 400, code: 'bad_action' };
  }
  await io.update(T.comments, row);

  if (action === 'remove') {
    /* The count on the parent is kept by the API; take this one off it so the app does not show a number that is too high. */
    const parentTable = Number(c.component) === MANNA ? MANNA_TABLE : T.noahGram;
    const parent = await io.getRow(parentTable, c.componentId);
    if (parent) await io.update(parentTable, { ROWID: String(parent.ROWID), comments: Math.max(0, (Number(parent.comments) || 0) - 1) });
  }
  forgetNoahgram();
  return { ok: true, postId: String(c.componentId), component: Number(c.component), text: text(c.content).slice(0, 200) };
}

/* ---------- reported comments ---------- */

/**
 * Comments members have reported (flagged above 0) and the office has not removed, most reported first. Manna and Noahgram together,
 * each with where it is, who wrote it, and its replies (hiding a first-level comment does not hide its replies in the table).
 */
export async function reportedComments() {
  const [rows, map, stats] = await Promise.all([io.getRows(T.comments), nameMap(), io.getRows(REPORTS_TABLE).catch(() => [])]);
  const live = rows.filter((c) => !asBool(c.isArchived));
  const reported = live.filter((c) => Number(c.flagged) > 0 && [MANNA, POST].includes(Number(c.component)));

  /* Where each one is: one read per distinct Manna or post. */
  const titles = new Map();
  for (const c of reported) {
    const key = c.component + ':' + c.componentId;
    if (titles.has(key)) continue;
    const parent = await io.getRow(Number(c.component) === MANNA ? MANNA_TABLE : T.noahGram, c.componentId).catch(() => null);
    titles.set(key, parent ? (Number(c.component) === MANNA ? text(parent.title) : text(parent.caption)).slice(0, 120) : '');
  }

  return reported
    .map((c) => {
      const replies = live
        .filter((r) => text(r.parentId) && String(r.parentId) === String(c.ROWID))
        .map((r) => ({ id: String(r.ROWID), author: whoWrote(map, r), text: text(r.content), hidden: hiddenNow(r), at: asUtc(r.createdOn) || asDate(r.CREATEDTIME) }))
        .sort((a, b) => (+(a.at ?? 0)) - (+(b.at ?? 0)));
      return {
        id: String(c.ROWID),
        kind: Number(c.component) === MANNA ? 'manna' : 'noahgram',
        where: { id: String(c.componentId), title: titles.get(c.component + ':' + c.componentId) || '' },
        author: whoWrote(map, c),
        text: text(c.content),
        reports: Number(c.flagged) || 0,
        hidden: hiddenNow(c),
        isReply: !!text(c.parentId) && text(c.parentId) !== '0',
        replies,
        /* Who reported it, in the order they did. */
        reporters: stats
          .filter((r) => Number(r.component) === reportComponent(c.component) && String(r.componentId) === String(c.ROWID))
          .map((r) => ({ id: String(r.memberId), name: authorOf(map, r.memberId, 'A member').name, at: asUtc(r.created) || asDate(r.CREATEDTIME) }))
          .sort((a, b) => (+(a.at ?? 0)) - (+(b.at ?? 0))),
        at: asUtc(c.createdOn) || asDate(c.CREATEDTIME),
      };
    })
    .sort((a, b) => b.reports - a.reports || (+(b.at ?? 0)) - (+(a.at ?? 0)));
}

/* The badge asks on every page load: how many, and the oldest, from a short cache. A decision clears it. */
let reportedCount = null;
let reportedAt = 0;
export async function cachedReported() {
  if (reportedCount && Date.now() - reportedAt < 30_000) return reportedCount;
  const rows = await reportedComments();
  reportedCount = rows.map((r) => ({ at: r.at }));
  reportedAt = Date.now();
  return reportedCount;
}
