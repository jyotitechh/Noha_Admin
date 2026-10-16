/* Who blocked whom, and the messages members reported.

   The hand-off doc lists the patterns worth watching for: asking for money,
   and pushing contact details into chat. Both show up here. */

import { useMemo } from 'react';
import { collection } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { Table } from '@/components/Table';
import { Chip, Kpi, Kpis, Note, Status, Failed, Loading, Empty } from '@/components/ui';
import { fdt, since } from '@/lib/format';

interface Block { id: string; by: string; byName: string; who: string; whoName: string; reason: string; at: Date; review: string }
interface Report { id: string; from: string; about: string; text: string; auto: string; at: Date; state: string }

export default function Blocked() {
  const blocks = useQuery(() => collection<Block>('JBLOCKS', { limit: 200, sort: 'at', dir: 'desc' }), []);
  const reports = useQuery(() => collection<Report>('JREPORTS', { limit: 200, sort: 'at', dir: 'desc' }), []);

  const stats = useMemo(() => {
    const b = blocks.data?.rows ?? [];
    const r = reports.data?.rows ?? [];
    return {
      openBlocks: b.filter((x) => x.review === 'Open').length,
      openReports: r.filter((x) => x.state === 'Open').length,
      money: b.filter((x) => /money/i.test(x.reason)).length + r.filter((x) => /money|visa/i.test(x.text)).length,
      contact: r.filter((x) => x.auto).length,
    };
  }, [blocks.data, reports.data]);

  if (blocks.error) return <Failed error={blocks.error} onRetry={blocks.reload} />;
  if (!blocks.data || !reports.data) return <div className="card"><Loading what="safety reports" /></div>;

  return (
    <div className="stack">
      <Note tone="warn" icon="shield">
        <b>Treat requests for money as serious.</b> Asking another member for
        money, or pushing a phone number into chat, are the two patterns worth
        acting on quickly. The chat filter catches the second automatically.
      </Note>

      <Kpis>
        <Kpi label="Blocks to review" value={stats.openBlocks} icon="ban" tone={stats.openBlocks ? 'warn' : undefined} />
        <Kpi label="Reported messages" value={stats.openReports} icon="flag" tone={stats.openReports ? 'warn' : undefined} />
        <Kpi label="Mentioning money" value={stats.money} icon="alert" tone={stats.money ? 'bad' : undefined}
          detail="look at these first" />
        <Kpi label="Caught by the filter" value={stats.contact} icon="zap" detail="contact details in chat" />
      </Kpis>

      <Table
        title="Blocks"
        rows={blocks.data.rows}
        rowKey={(b) => b.id}
        pageSize={10}
        columns={[
          { key: 'byName', label: 'Blocked by', cell: (b) => <>{b.byName}<span className="sub mono">{b.by}</span></> },
          { key: 'whoName', label: 'Blocked', cell: (b) => <>{b.whoName}<span className="sub mono">{b.who}</span></> },
          {
            key: 'reason', label: 'Reason',
            cell: (b) => <Chip tone={/money/i.test(b.reason) ? 'bad' : 'plain'}>{b.reason}</Chip>,
          },
          { key: 'at', label: 'When', num: true, cell: (b) => <span className="muted">{since(b.at)}</span> },
          { key: 'review', label: 'Reviewed', cell: (b) => <Status>{b.review}</Status> },
        ]}
        empty={<Empty icon="shield-check" title="No blocks">Nobody has blocked anybody.</Empty>}
      />

      <Table
        title="Reported messages"
        rows={reports.data.rows}
        rowKey={(r) => r.id}
        pageSize={10}
        columns={[
          { key: 'from', label: 'Reported by' },
          { key: 'about', label: 'About' },
          {
            key: 'text', label: 'The message',
            cell: (r) => (
              <>
                <span style={{ display: 'block', maxWidth: '44ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  “{r.text}”
                </span>
                {r.auto && <span className="sub" style={{ color: 'var(--warn)' }}>Caught: {r.auto}</span>}
              </>
            ),
          },
          { key: 'at', label: 'When', num: true, cell: (r) => <span className="muted">{fdt(r.at)}</span> },
          { key: 'state', label: 'Status', cell: (r) => <Status>{r.state}</Status> },
        ]}
        empty={<Empty icon="shield-check" title="Nothing reported">No messages have been reported.</Empty>}
      />
    </div>
  );
}
