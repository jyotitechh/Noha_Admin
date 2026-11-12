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
export const forgetNoahgram = () => { names = null; pending = null; };

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

/* ---------- comments ---------- */

/** The comments and replies under one post, oldest first. Removed ones are not listed; hidden ones are, marked. */
export async function commentsOn(postId) {
  const [rows, map] = await Promise.all([io.getRows(T.comments), nameMap()]);
  return rows
    .filter((c) => Number(c.component) === 2 && String(c.componentId) === String(postId) && !asBool(c.isArchived))
    .map((c) => ({
      id: String(c.ROWID),
      parentId: text(c.parentId) && text(c.parentId) !== '0' ? String(c.parentId) : null,
      author: authorOf(map, c.memberId),
      text: text(c.content),
      hidden: asBool(c.notApproved),
      at: asDate(c.CREATEDTIME),
    }))
    .sort((a, b) => (+(a.at ?? 0)) - (+(b.at ?? 0)));
}

/**
 * Take a comment off the post (`remove`, which also lowers the post's count by one) or hide it (`hide`) or show a hidden one
 * again (`show`). Hidden and removed comments are not shown in the app.
 */
export async function moderateComment(commentId, action) {
  const c = await io.getRow(T.comments, commentId);
  if (!c || Number(c.component) !== 2) return { error: 'No such comment.', status: 404, code: 'not_found' };
  if (asBool(c.isArchived)) return { error: 'That comment has already been removed.', status: 409, code: 'already_removed' };

  if (action === 'hide') {
    if (asBool(c.notApproved)) return { error: 'That comment is already hidden.', status: 409, code: 'already_hidden' };
    await io.update(T.comments, { ROWID: String(c.ROWID), notApproved: true });
  } else if (action === 'show') {
    if (!asBool(c.notApproved)) return { error: 'That comment is not hidden.', status: 409, code: 'not_hidden' };
    await io.update(T.comments, { ROWID: String(c.ROWID), notApproved: false });
  } else if (action === 'remove') {
    await io.update(T.comments, { ROWID: String(c.ROWID), isArchived: true });
    /* The count on the post is kept by the API; take this one off it so the app does not show a number that is too high. */
    const post = await io.getRow(T.noahGram, c.componentId);
    if (post) await io.update(T.noahGram, { ROWID: String(post.ROWID), comments: Math.max(0, (Number(post.comments) || 0) - 1) });
  } else {
    return { error: 'Choose remove, hide or show.', status: 400, code: 'bad_action' };
  }
  forgetNoahgram();
  return { ok: true, postId: String(c.componentId), text: text(c.content).slice(0, 200) };
}
