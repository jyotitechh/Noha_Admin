/* Noahgram moderation: the posts and reels members have uploaded, and the comments under them.

   Every new post and reel WAITS for the office. Nobody sees it (not on the feed, not on its share link) until it is approved
   here, and the author is not told anything until then. Approving makes it live and tells the author; turning one down archives
   it (nothing is deleted) and tells the author. The same turn-down takes a post that is already live off the feed.

   The decision is made by the Noah API, never by writing the table, because only the API tells the author. Comments have no
   API call: removing one, or hiding it, is written to the table (server/noahgram.js says how).

   A picture or video is fetched through this console's own server (the permission check runs, and no public address is
   involved), so it is read as a blob with the staff token, not given to an <img> by address. */

import { useEffect, useState } from 'react';
import { api, apiUrl, getToken } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useQueues } from '@/state/queues';
import { Drawer, useToast } from '@/components/layers';
import { Age, Btn, Chip, Empty, Failed, Field, Icon, Kpi, Kpis, Loading, Note, Seg, Who } from '@/components/ui';
import { fdt, since } from '@/lib/format';

interface MediaRef { url: string; external: boolean }
interface Post {
  id: string; state: 'pending' | 'live';
  author: { id: string; name: string };
  caption: string; reel: boolean;
  media: { src: MediaRef | null; still: MediaRef | null };
  at: Date | null; likes: number; comments: number; views: number; pinned: boolean;
}
interface Comment { id: string; parentId: string | null; author: { id: string; name: string }; text: string; hidden: boolean; reports?: number; at: Date | null }
type Show = 'pending' | 'live';

const REASONS = [
  'It is not suitable for this community.',
  'It shows a phone number, or advertises something.',
  'The picture or video is not appropriate.',
  'It is unkind to another member.',
];

/* ---------- a picture or a video, read through our own server ---------- */

interface Loaded { url: string; type: string }

function useMedia(ref: MediaRef | null): { media: Loaded | null; error: string; loading: boolean } {
  const [media, setMedia] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!ref);
  const key = ref?.url ?? '';

  useEffect(() => {
    setMedia(null); setError('');
    if (!ref) { setLoading(false); return; }
    /* A link the office wrote is shown as it stands. */
    if (ref.external) { setMedia({ url: ref.url, type: '' }); setLoading(false); return; }
    let live = true;
    let made = '';
    setLoading(true);
    fetch(apiUrl(ref.url), { headers: { authorization: 'Bearer ' + getToken() } })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Could not load it (${res.status}).`);
        return res.blob();
      })
      .then((b) => {
        made = URL.createObjectURL(b);
        if (live) setMedia({ url: made, type: b.type }); else URL.revokeObjectURL(made);
      })
      .catch((e) => { if (live) setError((e as Error).message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { media, error, loading };
}

/** A small square in a list: the picture, or a reel's still (a reel with none shows a play mark). */
function Thumb({ post }: { post: Post }) {
  const { media, loading } = useMedia(post.reel ? post.media.still : post.media.src);
  const [broken, setBroken] = useState(false);
  const box = { width: 72, height: 72, borderRadius: 10, border: '1px solid var(--line)', flex: 'none', objectFit: 'cover' as const, background: 'var(--bg2, #eee)' };
  if (media && !broken && (media.type === '' || media.type.startsWith('image/'))) return <img src={media.url} alt="" style={box} onError={() => setBroken(true)} />;
  /* No picture to show (a reel with no still, a file that would not load): a mark saying what it is, not a broken image. */
  return <div style={{ ...box, display: 'grid', placeItems: 'center' }} className="muted">{loading ? '…' : <Icon name={post.reel ? 'play' : 'image'} />}</div>;
}

/** The whole picture, or the reel to play. The kind comes from what the file is, not from what the list guessed. */
function Full({ post }: { post: Post }) {
  const { media, error, loading } = useMedia(post.media.src);
  const still = useMedia(post.reel ? post.media.still : null).media;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [post.id]);
  if (loading) return <div className="muted small" style={{ padding: 24 }}>Loading the {post.reel ? 'reel' : 'picture'}…</div>;
  if (error || !media || broken) return <Note tone="warn" icon="alert">{error || (broken ? 'The picture or video could not be shown.' : 'This post has no picture or video to show.')}</Note>;
  const isVideo = media.type.startsWith('video/') || (post.reel && !media.type.startsWith('image/'));
  return isVideo
    ? <video src={media.url} poster={still?.url} controls playsInline onError={() => setBroken(true)} style={{ width: '100%', maxHeight: 420, borderRadius: 10, background: '#000' }} />
    : <img src={media.url} alt="" onError={() => setBroken(true)} style={{ width: '100%', maxHeight: 420, objectFit: 'contain', borderRadius: 10, background: 'var(--bg2, #eee)' }} />;
}

export default function Noahgram() {
  const [show, setShow] = useState<Show>('pending');
  const [open, setOpen] = useState<Post | null>(null);
  const [turning, setTurning] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const { toast } = useToast();
  const queues = useQueues();

  const pending = useQuery(() => api.get<{ rows: Post[]; needsAdminKey?: boolean }>('/noahgram/posts?state=pending'), []);
  /* The live list reads a table, so it is only read when someone looks at it. */
  const live = useQuery(
    () => (show === 'live' ? api.get<{ rows: Post[] }>('/noahgram/posts?state=live') : Promise.resolve({ rows: [] as Post[] })),
    [show],
  );
  const comments = useQuery(
    () => (open?.state === 'live' ? api.get<{ rows: Comment[] }>(`/noahgram/posts/${open.id}/comments`) : Promise.resolve({ rows: [] as Comment[] })),
    [open?.id, open?.state],
  );

  const waiting = pending.data?.rows ?? [];
  const reels = waiting.filter((p) => p.reel).length;
  const oldest = waiting.map((p) => p.at).filter(Boolean).sort((a, b) => +a! - +b!)[0] ?? null;

  const close = () => { setOpen(null); setTurning(false); setReason(''); };
  const reloadAll = () => { pending.reload(); live.reload(); queues.refresh(); };

  async function decide(p: Post, decision: 'approve' | 'reject') {
    setBusy(p.id);
    try {
      await api.post(`/noahgram/posts/${p.id}/decide`, { decision, note: decision === 'reject' ? reason.trim() : undefined });
      toast(
        decision === 'approve'
          ? `Approved. The ${p.reel ? 'reel' : 'post'} is live and ${p.author.name} has been told.`
          : p.state === 'live' ? 'Taken down. It is off the feed, and the member has been told.' : 'Turned down. The member has been told.',
        decision === 'approve' ? 'ok' : 'warn',
      );
      close();
      reloadAll();
    } catch (e) {
      toast((e as Error).message, 'bad');
      /* Someone else may have decided it: show the list as it is now. */
      reloadAll();
    } finally {
      setBusy('');
    }
  }

  async function moderate(c: Comment, action: 'remove' | 'hide' | 'show') {
    setBusy(c.id);
    try {
      await api.post(`/noahgram/comments/${c.id}/moderate`, { action });
      toast(action === 'remove' ? 'Comment removed.' : action === 'hide' ? 'Comment hidden from members.' : 'Comment shown again.', action === 'show' ? 'ok' : 'warn');
      comments.reload();
      if (action === 'remove') live.reload();
    } catch (e) {
      toast((e as Error).message, 'bad');
      comments.reload();
    } finally {
      setBusy('');
    }
  }

  if (pending.error) return <Failed error={pending.error} onRetry={pending.reload} />;
  if (pending.data?.needsAdminKey) {
    return <Note tone="warn" icon="alert">Noahgram posts cannot be shown right now. Ask the administrator who looks after the console.</Note>;
  }
  if (!pending.data) return <div className="card"><Loading what="Noahgram" /></div>;

  const list = show === 'pending' ? waiting : (live.data?.rows ?? []);
  const loadingList = show === 'live' && live.loading && !live.data;

  return (
    <div className="stack">
      <Kpis>
        <Kpi label="Waiting" value={waiting.length} icon="chats" tone={waiting.length > 5 ? 'warn' : undefined}
          detail={oldest ? <>oldest <Age at={oldest} warn={12} bad={24} /></> : 'nothing waiting'} />
        <Kpi label="Pictures" value={waiting.length - reels} icon="image" />
        <Kpi label="Reels" value={reels} icon="play" />
      </Kpis>

      <div className="row wrap gap8">
        <Seg<Show> value={show} onChange={setShow}
          options={[{ id: 'pending', label: 'Waiting', count: waiting.length }, { id: 'live', label: 'Live on the feed' }]} />
        <span className="sp" style={{ flex: 1 }} />
        <Btn icon="refresh" onClick={reloadAll}>Refresh</Btn>
      </div>

      {show === 'live' && live.error ? (
        <Failed error={live.error} onRetry={live.reload} />
      ) : loadingList ? (
        <div className="card"><Loading what="the live posts" /></div>
      ) : list.length === 0 ? (
        <div className="card">
          <Empty icon={show === 'pending' ? 'check' : 'image'} title={show === 'pending' ? 'Nothing waiting' : 'Nothing is live'}>
            {show === 'pending' ? 'Every post and reel members uploaded has been decided.' : 'No approved post is on the feed.'}
          </Empty>
        </div>
      ) : (
        <ul className="list card">
          {list.map((p) => (
            <li key={p.id} style={{ alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(p)}>
              <Thumb post={p} />
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="t1" style={{ display: 'block' }}>
                  {p.author.name} {p.reel ? <Chip icon="play" tone="info">Reel</Chip> : <Chip icon="image" tone="plain">Picture</Chip>}
                </span>
                <span className="t2 ellip" style={{ display: 'block', maxWidth: '60ch' }}>{p.caption || 'No caption'}</span>
                <span className="t2" style={{ display: 'block' }}>
                  {p.state === 'pending'
                    ? <>Waiting <Age at={p.at} warn={12} bad={24} /> · uploaded {fdt(p.at)}</>
                    : <>{p.likes} likes · {p.comments} comments · {p.views} views · {since(p.at)}</>}
                </span>
              </span>
              {p.state === 'pending' ? (
                <span className="row gap6" onClick={(e) => e.stopPropagation()}>
                  <Btn sm variant="ok" icon="check" disabled={busy === p.id} onClick={() => decide(p, 'approve')}>Approve</Btn>
                  <Btn sm icon="x" disabled={busy === p.id} onClick={() => { setOpen(p); setTurning(true); }}>Turn down</Btn>
                </span>
              ) : (
                <Btn sm onClick={() => setOpen(p)}>Open</Btn>
              )}
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={!!open}
        onClose={close}
        title={open ? (open.reel ? 'Reel' : 'Post') + ` from ${open.author.name}` : ''}
        sub={open ? <><span className="mono">{open.id}</span> · {fdt(open.at)}</> : ''}
        footer={
          open ? (
            turning ? (
              <>
                <span className="sp" style={{ flex: 1 }} />
                <Btn onClick={() => { setTurning(false); setReason(''); }}>Cancel</Btn>
                <Btn variant="danger" disabled={!reason.trim() || busy === open.id} onClick={() => decide(open, 'reject')}>
                  {open.state === 'live' ? 'Take it down' : 'Turn it down'}
                </Btn>
              </>
            ) : open.state === 'pending' ? (
              <>
                <span className="sp" style={{ flex: 1 }} />
                <Btn variant="danger" icon="x" disabled={busy === open.id} onClick={() => setTurning(true)}>Turn down</Btn>
                <Btn variant="ok" icon="check" disabled={busy === open.id} onClick={() => decide(open, 'approve')}>Approve</Btn>
              </>
            ) : (
              <>
                <span className="sp" style={{ flex: 1 }} />
                <Btn variant="danger" icon="ban" disabled={busy === open.id} onClick={() => setTurning(true)}>Take the post down</Btn>
              </>
            )
          ) : null
        }
      >
        {open && (
          <>
            <div className="row wrap gap6 mb12">
              {open.reel ? <Chip icon="play" tone="info">Reel</Chip> : <Chip icon="image" tone="plain">Picture</Chip>}
              <Chip tone={open.state === 'pending' ? 'warn' : 'ok'}>{open.state === 'pending' ? 'Waiting' : 'Live'}</Chip>
              {open.pinned && <Chip icon="flag" tone="brand">Pinned</Chip>}
            </div>

            <Full post={open} />

            <div className="card pad mt16">
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{open.caption || 'No caption.'}</p>
            </div>

            <div className="mt16">
              <div className="sect-title">Who posted it</div>
              <Who name={open.author.name} sub={open.author.id ? <span className="mono">{open.author.id}</span> : 'The office'} />
            </div>

            {open.state === 'live' && (
              <div className="row wrap gap6 mt16">
                <Chip icon="heart">{open.likes} likes</Chip>
                <Chip icon="msg">{open.comments} comments</Chip>
                <Chip icon="eye">{open.views} views</Chip>
              </div>
            )}

            {turning && (
              <div className="mt20">
                <div>
                  <Field label="Reason">
                    <textarea className="ta" rows={3} value={reason} autoFocus placeholder={REASONS[0]} maxLength={500}
                      onChange={(e) => setReason(e.target.value)} />
                  </Field>
                </div>
                <div className="row wrap gap6 mt12">
                  {REASONS.map((t) => <button key={t} className="btn sm" onClick={() => setReason(t)}>{t.slice(0, 34)}…</button>)}
                </div>
              </div>
            )}

            {open.state === 'live' && !turning && (
              <div className="mt20">
                <div className="sect-title">Comments</div>
                {comments.error ? (
                  <Failed error={comments.error} onRetry={comments.reload} />
                ) : comments.loading && !comments.data ? (
                  <Loading what="the comments" />
                ) : (comments.data?.rows.length ?? 0) === 0 ? (
                  <p className="muted small">No comments on this post.</p>
                ) : (
                  <ul className="list card">
                    {comments.data!.rows.map((c) => (
                      <li key={c.id} style={{ alignItems: 'flex-start', paddingLeft: c.parentId ? 28 : undefined }}>
                        <span className="grow" style={{ minWidth: 0 }}>
                          <span className="t1" style={{ display: 'block' }}>
                            {c.author.name} {c.parentId && <Chip tone="plain">Reply</Chip>} {c.hidden && <Chip tone="mute" icon="eye-off">Hidden</Chip>} {(c.reports ?? 0) > 0 && <Chip tone="warn" icon="flag">Reported {c.reports}×</Chip>}
                          </span>
                          <span className="t2" style={{ display: 'block', whiteSpace: 'pre-wrap' }}>{c.text}</span>
                          <span className="t2" style={{ display: 'block' }}>{since(c.at)}</span>
                        </span>
                        <span className="row gap6">
                          {c.hidden
                            ? <Btn sm disabled={busy === c.id} onClick={() => moderate(c, 'show')}>Show</Btn>
                            : <Btn sm disabled={busy === c.id} onClick={() => moderate(c, 'hide')}>Hide</Btn>}
                          <Btn sm variant="danger" disabled={busy === c.id} onClick={() => moderate(c, 'remove')}>Remove</Btn>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
