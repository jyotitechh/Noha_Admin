/* The carousel on the app's home screen, and the notices above it.

   These are the first thing a member sees when they open the app, so the
   dates matter: a banner whose window has passed is simply gone. */

import { useMemo } from 'react';
import { collection } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { Table } from '@/components/Table';
import { Card, Chip, Kpi, Kpis, Note, Status, Failed, Loading, Empty } from '@/components/ui';
import { fd, num, until } from '@/lib/format';

interface Banner {
  id: string; kicker: string; title: string; sub: string; to: string;
  grad: string; from: Date; until: Date; order: number; status: string; taps: number;
}
interface Announcement { id: string; text: string; place: string; until: Date; status: string }

export default function Announce() {
  const banners = useQuery(() => collection<Banner>('BANNERS', { limit: 100, sort: 'order' }), []);
  const notices = useQuery(() => collection<Announcement>('ANNOUNCEMENTS', { limit: 100 }), []);

  const live = useMemo(() => (banners.data?.rows ?? []).filter((b) => b.status === 'Live'), [banners.data]);

  if (banners.error) return <Failed error={banners.error} onRetry={banners.reload} />;
  if (!banners.data) return <div className="card"><Loading what="banners" /></div>;

  return (
    <div className="stack">
      <Note tone="mute" icon="mobile">
        The banners below are the carousel at the top of the app’s home screen,
        in this order. A banner shows only inside its own window of dates.
      </Note>

      <Kpis>
        <Kpi label="Live in the app" value={live.length} icon="image" detail="in the home carousel" />
        <Kpi label="Taps" value={num(live.reduce((n, b) => n + b.taps, 0))} icon="pointer" detail="across live banners" />
        <Kpi label="Notices showing" value={(notices.data?.rows ?? []).filter((a) => a.status === 'Live').length} icon="bell" />
        <Kpi label="Ending within a week" value={live.filter((b) => (+b.until - Date.now()) < 7 * 864e5).length} icon="clock" />
      </Kpis>

      {/* The carousel, drawn as the app draws it. */}
      <Card title="Home carousel" sub="In the order members swipe through them">
        <div className="row wrap gap14" style={{ alignItems: 'stretch' }}>
          {live.map((b) => (
            <div
              key={b.id}
              style={{
                background: b.grad, color: '#fff', borderRadius: 14, padding: '16px 18px',
                width: 250, minHeight: 128, display: 'flex', flexDirection: 'column', gap: 4,
                boxShadow: 'var(--sh-2)',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', opacity: 0.85 }}>
                {b.kicker}
              </span>
              <b style={{ fontSize: 15, lineHeight: 1.3 }}>{b.title}</b>
              <span style={{ fontSize: 12.5, opacity: 0.9, lineHeight: 1.4 }}>{b.sub}</span>
              <span style={{ marginTop: 'auto', fontSize: 11.5, opacity: 0.85 }}>
                Opens {b.to} · {num(b.taps)} taps
              </span>
            </div>
          ))}
          {!live.length && <Empty icon="image" title="Nothing in the carousel">No banner is live today.</Empty>}
        </div>
      </Card>

      <Table
        title="Every banner"
        rows={banners.data.rows}
        rowKey={(b) => b.id}
        pageSize={10}
        columns={[
          { key: 'order', label: '#', num: true, width: 50 },
          { key: 'title', label: 'Banner', cell: (b) => <>{b.title}<span className="sub">{b.kicker} · opens {b.to}</span></> },
          { key: 'from', label: 'Showing', cell: (b) => <>{fd(b.from)} to {fd(b.until)}<span className="sub">{b.status === 'Live' ? `ends ${until(b.until)}` : ''}</span></> },
          { key: 'taps', label: 'Taps', num: true, cell: (b) => (b.taps ? num(b.taps) : <span className="muted">—</span>) },
          { key: 'status', label: 'Status', cell: (b) => <Status>{b.status}</Status> },
        ]}
      />

      <Table
        title="Notices"
        rows={notices.data?.rows ?? []}
        rowKey={(a) => a.id}
        pageSize={10}
        columns={[
          { key: 'text', label: 'Notice' },
          { key: 'place', label: 'Where', cell: (a) => <Chip tone="plain">{a.place}</Chip> },
          { key: 'until', label: 'Until', cell: (a) => fd(a.until) },
          { key: 'status', label: 'Status', cell: (a) => <Status>{a.status}</Status> },
        ]}
        empty={<Empty icon="bell" title="No notices">Nothing is being announced.</Empty>}
      />
    </div>
  );
}
