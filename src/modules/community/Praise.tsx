/* Praise reports: testimonies members send from the Noah app.

   Read from Catalyst's praiseReport table. Publish marks one as checked (isComplete),
   Reject archives it (isArchived), and a published one can be featured (isFeatured)
   to come first on the praise wall. Nothing is deleted. */

import { useEffect, useState, type ReactNode } from 'react';
import { api, apiUrl, getToken } from '@/lib/api';
import { useToast } from '@/components/layers';
import { DecisionQueue, type DecisionRow } from '@/components/DecisionQueue';
import { Btn, Chip, Kpi, Kv, Who } from '@/components/ui';

interface Praise extends DecisionRow {
  member: string; name: string; mobile: string; email: string; text: string;
  videoLink: string; photos: number; photoUrls?: (string | null)[]; location: string; comment: string;
  featured: boolean; likes: number;
}

/** One photo: a link as it is, or a stored file read with the staff sign-in. */
function Photo({ id, n, url }: { id: string; n: number; url: string | null }) {
  const [src, setSrc] = useState(url);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (url) return;
    let made = '';
    let live = true;
    fetch(apiUrl(`/praise/${id}/photo/${n}`), { headers: { authorization: 'Bearer ' + getToken() } })
      .then((res) => (res.ok ? res.blob() : Promise.reject()))
      .then((b) => { made = URL.createObjectURL(b); if (live) setSrc(made); else URL.revokeObjectURL(made); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [id, n, url]);

  const box = { width: 140, height: 104, borderRadius: 8, objectFit: 'cover' as const, background: 'var(--bg-2, #eee)' };
  if (failed) return <div className="filebox" style={{ ...box, justifyContent: 'center' }}><span className="xs muted">Photo {n} could not be loaded</span></div>;
  if (!src) return <div className="filebox" style={{ ...box, justifyContent: 'center' }}><span className="xs muted">Loading…</span></div>;
  return <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={`Photo ${n}`} style={box} onError={() => setFailed(true)} /></a>;
}

/** Feature a published report on the praise wall, or take it off. */
function Feature({ row }: { row: Praise }) {
  const [on, setOn] = useState(row.featured);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  async function flip() {
    setBusy(true);
    try {
      await api.post(`/praise/${row.id}/feature`, { featured: !on });
      setOn(!on);
      toast(!on ? 'Featured on the praise wall.' : 'No longer featured.');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="row gap6 mt16" style={{ alignItems: 'center' }}>
      {on && <Chip tone="brand" icon="star">Featured</Chip>}
      <Btn sm icon="star" disabled={busy} onClick={flip}>{on ? 'Stop featuring' : 'Feature on the praise wall'}</Btn>
    </div>
  );
}

export default function PraiseScreen() {
  return (
    <DecisionQueue<Praise>
      name="PRAISE"
      waiting="Pending"
      states={['Pending', 'Published', 'Rejected']}
      sla={24}
      searchPlaceholder="Words in the testimony, a name or a place"
      approveLabel="Publish"
      rejectLabel="Reject"
      reasonHint="Required. Kept in the audit log."
      emptyTitle="Nothing to publish"
      extraKpis={(rows) => (
        <>
          <Kpi label="Published" value={rows.filter((r) => r.state === 'Published').length} icon="check" />
          <Kpi label="Featured" value={rows.filter((r) => r.featured && r.state === 'Published').length} icon="star" />
        </>
      )}
      columns={[
        { key: 'name', label: 'Member', cell: (r) => <Who name={r.name} sub={<span className="mono">{r.mobile || r.member}</span>} size="sm" /> },
        {
          key: 'text', label: 'Testimony',
          cell: (r) => (
            <>
              <span style={{ display: 'block', maxWidth: '54ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.text}
              </span>
              {(r.photos > 0 || r.videoLink) && (
                <span className="sub">
                  {[r.photos > 0 ? `${r.photos} ${r.photos === 1 ? 'photo' : 'photos'}` : '', r.videoLink ? 'a video' : ''].filter(Boolean).join(' · ')}
                </span>
              )}
            </>
          ),
        },
        { key: 'featured', label: '', cell: (r) => (r.featured && r.state === 'Published' ? <Chip tone="brand" icon="star">Featured</Chip> : null) },
      ]}
      drawerTitle={(r) => `Praise report from ${r.name}`}
      detail={(r) => (
        <>
          <div className="card pad">
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{r.text}</p>
          </div>

          {r.photos > 0 && (
            <div className="mt16">
              <div className="sect-title">Photos</div>
              <div className="row wrap gap6">
                {Array.from({ length: r.photos }).map((_, i) => (
                  <Photo key={i} id={r.id} n={i + 1} url={r.photoUrls?.[i] ?? null} />
                ))}
              </div>
            </div>
          )}

          <div className="mt16">
            <Kv rows={[
              ['From', <Who key="w" name={r.name} sub={<span className="mono">{r.member}</span>} />],
              ['Mobile', <span key="m" className="mono">{r.mobile || '—'}</span>],
              ['Email', r.email || '—'],
              ['Place', r.location || '—'],
              ['Video', r.videoLink ? <a key="v" href={r.videoLink} target="_blank" rel="noreferrer">{r.videoLink}</a> : '—'],
              ...(r.comment ? [['Their note', <span key="c" style={{ whiteSpace: 'pre-line' }}>{r.comment}</span>] as [string, ReactNode]] : []),
            ]} />
          </div>

          {r.state === 'Published' && <Feature row={r} />}
        </>
      )}
      reasons={[
        'It names a doctor or hospital.',
        'It names someone else without their permission.',
        'It is too long for the praise wall.',
      ]}
    />
  );
}
