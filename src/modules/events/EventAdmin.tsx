/* Events: find them by name and date, open one, add, change, copy or archive it. Stored in Catalyst's `events`
   table (server/events.js).

   Archiving hides an event from everyone in the app and from this list; it moves to the Archived view, where the
   office can bring it back (Restore) or delete it for good. Only an archived event can be deleted. */

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { Confirm, Drawer, useToast } from '@/components/layers';
import { Btn, Chip, Empty, Failed, Icon, Kv, Loading, Seg } from '@/components/ui';
import { EventFormDrawer, blankEvent, formOf } from './EventForm';
import { mapLink } from './LocationPicker';
import { dayLong, forgetChoices, time12, whenLong, type EventDetail, type EventForm, type EventRow } from './shared';

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysFromToday = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); };
const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

type Show = 'active' | 'archived';

export default function EventAdmin() {
  const { can } = useAuth();
  const manage = can('events.manage');
  const { toast } = useToast();

  const [show, setShow] = useState<Show>('active');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(daysFromToday(-7));
  const [to, setTo] = useState(daysFromToday(7));
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [form, setForm] = useState<{ mode: 'add' | 'edit' | 'copy'; id?: string; start: EventForm } | null>(null);
  const [confirming, setConfirming] = useState<{ kind: 'archive' | 'delete'; id: string; name: string } | null>(null);

  const load = useCallback((which: Show = show) => {
    setError(null);
    const p = new URLSearchParams({ q: q.trim() });
    if (which === 'archived') p.set('archived', '1');
    else { p.set('from', from); p.set('to', to); }
    api.get<{ rows: EventRow[] }>(`/event-admin/events?${p}`).then((r) => setRows(r.rows)).catch((e) => setError(e));
  }, [q, from, to, show]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function switchTo(which: Show) {
    setShow(which); setRows(null); load(which);
  }

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

  async function restore(id: string, name: string) {
    try {
      await api.post(`/event-admin/events/${id}/restore`);
      toast(`“${name}” is back in Events.`, 'ok');
      setOpenId(null); load();
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  }

  async function confirmed() {
    if (!confirming) return;
    const { kind, id, name } = confirming;
    try {
      if (kind === 'archive') await api.del(`/event-admin/events/${id}`);
      else await api.del(`/event-admin/events/${id}/permanently`);
      toast(kind === 'archive' ? `“${name}” is archived. It is hidden from the app.` : `“${name}” is deleted.`, 'ok');
      setConfirming(null); setOpenId(null); load();
    } catch (e) {
      toast((e as Error).message, 'bad');
      setConfirming(null);
    }
  }

  const archivedView = show === 'archived';

  return (
    <div className="stack">
      <form className="row wrap gap8" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <Seg<Show> value={show} onChange={switchTo} options={[{ id: 'active', label: 'Events' }, { id: 'archived', label: 'Archived' }]} />
        <input className="inp" style={{ maxWidth: 260 }} value={q} placeholder="Event name" aria-label="Event name" onChange={(e) => setQ(e.target.value)} />
        {!archivedView && (
          <>
            <label className="row gap6 small muted">From <input className="inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="row gap6 small muted">To <input className="inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </>
        )}
        <Btn variant="pri" icon="search">Go</Btn>
        <span className="sp" style={{ flex: 1 }} />
        {manage && !archivedView && <Btn type="button" variant="ok" icon="plus" onClick={() => setForm({ mode: 'add', start: blankEvent() })}>Add event</Btn>}
      </form>

      {archivedView && <p className="muted small mt0">Archived events are hidden from the app and only the office sees them here. Restore one to bring it back, or delete it for good.</p>}

      {error ? <Failed error={error} onRetry={() => load()} /> : !rows ? <div className="card"><Loading what="events" /></div> : !rows.length ? (
        <div className="card">
          {archivedView
            ? <Empty icon="archive" title="Nothing archived">Events you archive are kept here.</Empty>
            : <Empty icon="cal" title="No events in these dates">Change the dates or the name, then press Go.</Empty>}
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
                {!archivedView && !e.visible && <span><Chip tone="mute" icon="eye-off">Not visible in the app</Chip></span>}
                <div className="row wrap gap6 mt8">
                  <Btn sm icon="eye" type="button" onClick={() => setOpenId(e.id)}>View</Btn>
                  {manage && !archivedView && <Btn sm icon="edit" type="button" onClick={() => startFrom('edit', e.id)}>Edit</Btn>}
                  {manage && !archivedView && <Btn sm icon="copy" type="button" onClick={() => startFrom('copy', e.id)}>Copy</Btn>}
                  {manage && archivedView && <Btn sm icon="restore" type="button" onClick={() => restore(e.id, e.name)}>Restore</Btn>}
                  {manage && archivedView && <Btn sm variant="danger" icon="trash" type="button" onClick={() => setConfirming({ kind: 'delete', id: e.id, name: e.name })}>Delete</Btn>}
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
        sub={detail ? `${dayLong(detail.date)} · ${time12(detail.startTime)} to ${time12(detail.endTime)}${detail.archived ? ' · Archived' : ''}` : ''}
        footer={manage && detail ? (
          detail.archived ? (
            <>
              <Btn variant="danger" icon="trash" onClick={() => setConfirming({ kind: 'delete', id: detail.id, name: detail.name })}>Delete for good</Btn>
              <span className="sp" style={{ flex: 1 }} />
              <Btn variant="pri" icon="restore" onClick={() => restore(detail.id, detail.name)}>Restore</Btn>
            </>
          ) : (
            <>
              <Btn variant="danger" icon="archive" onClick={() => setConfirming({ kind: 'archive', id: detail.id, name: detail.name })}>Archive</Btn>
              <span className="sp" style={{ flex: 1 }} />
              <Btn icon="copy" onClick={() => startFrom('copy', detail.id)}>Copy</Btn>
              <Btn variant="pri" icon="edit" onClick={() => startFrom('edit', detail.id)}>Edit</Btn>
            </>
          )
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

      <Confirm
        open={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={confirmed}
        title={confirming?.kind === 'delete' ? 'Delete this event for good?' : 'Archive this event?'}
        confirmLabel={confirming?.kind === 'delete' ? 'Delete for good' : 'Archive'}
        danger
      >
        {confirming?.kind === 'delete'
          ? <p className="mt0"><b>{confirming?.name}</b> will be removed completely. This cannot be undone.</p>
          : <p className="mt0"><b>{confirming?.name}</b> will be hidden from everyone in the app. You can find it in Archived, restore it, or delete it there.</p>}
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
        {e.archived && <Chip tone="warn" icon="archive">Archived: hidden from the app</Chip>}
        {!e.archived && (e.visible ? <Chip tone="ok" icon="eye">Visible in the app</Chip> : <Chip tone="mute" icon="eye-off">Not visible in the app</Chip>)}
        {e.showOnDashboard && <Chip tone="brand">On the dashboard</Chip>}
        {e.hideFromPublic && <Chip tone="plain">Hidden from public</Chip>}
        {e.hideFromLeaders && <Chip tone="plain">Hidden from leaders</Chip>}
        {e.hideFromDonation && <Chip tone="plain">Hidden from donation</Chip>}
      </div>

      <Kv rows={[
        ['Date', dayLong(e.date)],
        ['Time', `${time12(e.startTime)} to ${time12(e.endTime)}`],
        ['Timezone', e.timezone],
        ['Location', e.locationName || e.locationAddress
          ? <span key="l">{e.locationName}{e.locationAddress && e.locationAddress !== e.locationName ? <><br /><span className="muted">{e.locationAddress}</span></> : null}
            {e.locationLat && e.locationLon ? <><br /><a href={mapLink(e.locationLat, e.locationLon)} target="_blank" rel="noreferrer">Open on the map</a></> : null}</span>
          : '—'],
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
