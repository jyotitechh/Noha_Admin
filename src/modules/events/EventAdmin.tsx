/* Events: find them by name and date, open one, add, change, copy or archive it. Stored in Catalyst's `events`
   table (server/events.js). */

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { Confirm, Drawer, useToast } from '@/components/layers';
import { Btn, Chip, Empty, Failed, Icon, Kv, Loading } from '@/components/ui';
import { EventFormDrawer, blankEvent, formOf } from './EventForm';
import { dayLong, forgetChoices, time12, whenLong, type EventDetail, type EventForm, type EventRow } from './shared';

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysFromToday = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); };
const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

export default function EventAdmin() {
  const { can } = useAuth();
  const manage = can('events.manage');
  const { toast } = useToast();

  const [q, setQ] = useState('');
  const [from, setFrom] = useState(daysFromToday(-7));
  const [to, setTo] = useState(daysFromToday(7));
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [form, setForm] = useState<{ mode: 'add' | 'edit' | 'copy'; id?: string; start: EventForm } | null>(null);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    const p = new URLSearchParams({ q: q.trim(), from, to });
    api.get<{ rows: EventRow[] }>(`/event-admin/events?${p}`).then((r) => setRows(r.rows)).catch((e) => setError(e));
  }, [q, from, to]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    setDetail(null);
    api.get<EventDetail>(`/event-admin/events/${openId}`).then(setDetail).catch((e) => { toast((e as Error).message, 'bad'); setOpenId(null); });
  }, [openId, toast]);

  async function startFrom(mode: 'edit' | 'copy', id: string) {
    try {
      const e = detail?.id === id ? detail : await api.get<EventDetail>(`/event-admin/events/${id}`);
      setForm({ mode, id: mode === 'edit' ? id : undefined, start: formOf(e) });
    } catch (err) {
      toast((err as Error).message, 'bad');
    }
  }

  async function archive() {
    if (!detail) return;
    try {
      await api.del(`/event-admin/events/${detail.id}`);
      toast(`“${detail.name}” is archived.`, 'ok');
      setArchiving(false); setOpenId(null); load();
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  }

  return (
    <div className="stack">
      <form className="row wrap gap8" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input className="inp" style={{ maxWidth: 260 }} value={q} placeholder="Event name" aria-label="Event name" onChange={(e) => setQ(e.target.value)} />
        <label className="row gap6 small muted">From <input className="inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="row gap6 small muted">To <input className="inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <Btn variant="pri" icon="search">Go</Btn>
        <span className="sp" style={{ flex: 1 }} />
        {manage && <Btn type="button" variant="ok" icon="plus" onClick={() => setForm({ mode: 'add', start: blankEvent() })}>Add event</Btn>}
      </form>

      {error ? <Failed error={error} onRetry={load} /> : !rows ? <div className="card"><Loading what="events" /></div> : !rows.length ? (
        <div className="card">
          <Empty icon="cal" title="No events in these dates">Change the dates or the name, then press Go.</Empty>
        </div>
      ) : (
        <div className="g2">
          {rows.map((e) => (
            <div key={e.id} className="card pad row top" style={{ gap: 14 }}>
              {e.photo
                ? <img src={e.photo} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, flex: 'none' }} />
                : <div style={{ width: 96, height: 96, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--bg-2, #f1f1f4)' }}><Icon name="cal" /></div>}
              <div className="grow stack" style={{ gap: 4 }}>
                <b style={{ fontSize: 17 }}>{e.name}</b>
                <span>{dayLong(e.date)}</span>
                <span className="muted">{time12(e.startTime)} to {time12(e.endTime)}{e.locationName ? ` · ${e.locationName}` : ''}</span>
                {!e.visible && <span><Chip tone="mute" icon="eye-off">Not visible in the app</Chip></span>}
                <div className="row gap6 mt8">
                  <Btn sm icon="eye" onClick={() => setOpenId(e.id)}>View</Btn>
                  {manage && <Btn sm icon="edit" onClick={() => startFrom('edit', e.id)}>Edit</Btn>}
                  {manage && <Btn sm icon="copy" onClick={() => startFrom('copy', e.id)}>Copy</Btn>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Drawer
        open={!!openId}
        onClose={() => setOpenId(null)}
        width="wide"
        title={detail?.name ?? 'Event'}
        sub={detail ? `${dayLong(detail.date)} · ${time12(detail.startTime)} to ${time12(detail.endTime)}` : ''}
        footer={manage && detail ? (
          <>
            <Btn variant="danger" icon="archive" onClick={() => setArchiving(true)}>Archive</Btn>
            <span className="sp" style={{ flex: 1 }} />
            <Btn icon="copy" onClick={() => startFrom('copy', detail.id)}>Copy</Btn>
            <Btn variant="pri" icon="edit" onClick={() => startFrom('edit', detail.id)}>Edit</Btn>
          </>
        ) : undefined}
      >
        {!detail ? <Loading what="the event" /> : <EventView e={detail} />}
      </Drawer>

      {form && (
        <EventFormDrawer
          open
          mode={form.mode}
          eventId={form.id}
          start={form.start}
          onClose={() => setForm(null)}
          onSaved={(id) => { setForm(null); forgetChoices(); load(); setOpenId(null); setTimeout(() => setOpenId(id), 0); }}
        />
      )}

      <Confirm open={archiving} onClose={() => setArchiving(false)} onConfirm={archive} title="Archive this event?" confirmLabel="Archive" danger>
        <p className="mt0"><b>{detail?.name}</b> will no longer be listed here or in the app.</p>
      </Confirm>
    </div>
  );
}

const yesNo = (b: boolean) => (b ? 'Yes' : 'No');
const dash = (s: string | number | null | undefined) => (s === null || s === undefined || s === '' ? '—' : s);

function EventView({ e }: { e: EventDetail }) {
  const spent = Object.entries(e.expenses).filter(([, n]) => n !== null && n !== undefined) as [string, number][];
  const labels: Record<string, string> = { hall: 'Hall', sound: 'Sound', lights: 'Lights', musician: 'Musicians', media: 'Media', bus: 'Bus', transport: 'Transport', photography: 'Photography', translator: 'Translator' };

  return (
    <div className="stack">
      {e.photo && <img src={e.photo} alt="" style={{ width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 8, background: 'var(--bg-2, #f1f1f4)' }} />}
      {e.description && <p className="mt0">{e.description}</p>}
      <div className="row wrap gap6">
        {e.visible ? <Chip tone="ok" icon="eye">Visible in the app</Chip> : <Chip tone="mute" icon="eye-off">Not visible in the app</Chip>}
        {e.showOnDashboard && <Chip tone="brand">On the dashboard</Chip>}
        {e.hideFromPublic && <Chip tone="plain">Hidden from public</Chip>}
        {e.hideFromLeaders && <Chip tone="plain">Hidden from leaders</Chip>}
        {e.hideFromDonation && <Chip tone="plain">Hidden from donation</Chip>}
      </div>

      <Kv rows={[
        ['Date', dayLong(e.date)],
        ['Time', `${time12(e.startTime)} to ${time12(e.endTime)}`],
        ['Timezone', e.timezone],
        ['Location', e.locationName || e.locationAddress ? <span key="l">{e.locationName}{e.locationAddress ? <><br /><span className="muted">{e.locationAddress}</span></> : null}</span> : '—'],
        ['Publish date and time', dash(whenLong(e.publishAt))],
        ['Event group', dash(e.groupName)],
        ['Message title', dash(e.messageTitle)],
        ['Preacher', e.preacher ? <span key="p">{e.preacher.name}{e.preacher.mobile ? <span className="muted"> · {e.preacher.mobile}</span> : null}</span> : '—'],
        ['Tally ledger title', dash(e.tallyLedgerTitle)],
        ['Hall', e.hallName ?? 'Not set'],
        ["Attendee's maximum age", dash(e.maxAge)],
        ['Meeting link', e.meetingLink ? <a key="m" href={e.meetingLink} target="_blank" rel="noreferrer">{e.meetingLink}</a> : '—'],
        ['Zoom meeting ID', dash(e.zoomId)],
        ['Translation', dash(e.translation)],
      ]} />

      <div className="sect-title">Expenses</div>
      {spent.length ? <Kv rows={spent.map(([k, n]) => [labels[k] ?? k, inr(n)])} /> : <p className="muted small mt0">None entered.</p>}

      <div className="sect-title">Who it is for</div>
      <Kv rows={[
        ['For pastors', yesNo(e.filters.pastor)],
        ['For leaders', yesNo(e.filters.leader)],
        ['For VIPs', yesNo(e.filters.vip)],
        ['For prayer warriors', yesNo(e.filters.prayerWarrior)],
        ['Member groups', e.memberGroupNames.length ? e.memberGroupNames.join(', ') : '—'],
      ]} />

      {e.about && (
        <details className="card pad">
          <summary><b>About</b></summary>
          <div className="mt8" dangerouslySetInnerHTML={{ __html: e.about }} />
        </details>
      )}
      {(e.terms || e.termsFormatted) && (
        <details className="card pad">
          <summary><b>Terms and conditions</b></summary>
          {e.termsFormatted
            ? <div className="mt8" dangerouslySetInnerHTML={{ __html: e.termsFormatted }} />
            : <p className="mt8" style={{ whiteSpace: 'pre-wrap' }}>{e.terms}</p>}
        </details>
      )}

      <div className="sect-title">Blocked events for pass booking</div>
      {e.blockedEvents.length ? (
        <ul className="list card">
          {e.blockedEvents.map((b) => (
            <li key={b.id}>
              <span className="grow">
                <span className="t1">{b.name}</span>
                <span className="t2">{dayLong(b.date)} · {time12(b.startTime)} to {time12(b.endTime)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="muted small mt0">None.</p>}
    </div>
  );
}
