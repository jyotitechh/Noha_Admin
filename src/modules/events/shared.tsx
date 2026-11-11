/* What the event screens share: the shapes the server sends, the choices the forms offer, and a member picker. */

import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui';

export interface Option { id: string; name: string }

/** What happened when members were told about an event. 'already' and 'hidden' need no words after a save. */
export interface Announce { status: 'sent' | 'none' | 'already' | 'scheduled' | 'hidden' | 'off' | 'failed'; text: string; members?: number; notified?: number }

/** The sentence to add to "saved": nothing when there is nothing worth saying. */
export const afterSave = (a?: Announce) => (!a || a.status === 'already' || a.status === 'hidden' ? '' : ' ' + a.text);
export const announceTone = (a?: Announce): 'ok' | 'warn' => (a?.status === 'failed' || a?.status === 'off' ? 'warn' : 'ok');

/** A place from the map search, or one saved from an earlier event. */
export interface Place {
  id: string; name: string; area: string; city: string; state: string; country: string; address: string; lat: string; lon: string;
}

export interface Choices {
  languageGroups: Option[];
  eventGroups: (Option & { languageGroupName: string | null })[];
  halls: (Option & { seats: number | null })[];
  memberGroups: Option[];
  pastors: Option[];
  savedLocations: Place[];
  /** Which map the place picker shows: Mappls when the API has a key, else OpenStreetMap. */
  map?: { provider: 'mappls' | 'osm'; key?: string };
  expenses: { key: string; label: string }[];
  source: 'catalyst' | 'sample';
}

export interface Person { id: string; name: string; mobile: string }

export interface EventForm {
  name: string; description: string;
  showOnDashboard: boolean; hideFromPublic: boolean; hideFromLeaders: boolean;
  groupId: string; tallyLedgerTitle: string; messageTitle: string; preacherId: string;
  date: string; publishAt: string;
  locationId: string; locationName: string; locationAddress: string; locationLat: string; locationLon: string;
  /** Only sent when saving: the parts of a place picked on the map, so it can be kept in the saved places. */
  locationParts: { area: string; city: string; state: string; country: string } | null;
  startTime: string; endTime: string; timezone: string;
  hideFromDonation: boolean; visible: boolean;
  maxAge: number | null; meetingLink: string; zoomId: string; zoomPassword: string;
  about: string; photo: string; terms: string; termsFormatted: string; translation: string;
  hallId: string;
  /** A member books a pass to attend; seats is the number of passes (null = no limit). */
  passRequired: boolean; seats: number | null;
  expenses: Record<string, number | null>;
  filters: { pastor: boolean; leader: boolean; vip: boolean; prayerWarrior: boolean; memberGroups: string[] };
  blockedEventIds: string[];
}

export interface EventDetail extends EventForm {
  id: string;
  /** Passes taken so far, kept by the Noah API. */
  passUsed: number;
  groupName: string | null; hallName: string | null; preacher: Person | null;
  memberGroupNames: string[];
  archived: boolean;
  blockedEvents: { id: string; name: string; date: string; startTime: string; endTime: string }[];
}

export interface EventRow {
  id: string; name: string; date: string; startTime: string; endTime: string;
  photo: string; locationName: string; visible: boolean; groupId: string;
}

let choicesOnce: Promise<Choices> | null = null;
/** The lists the forms choose from. Fetched again after something is added to them. */
export function useChoices(bump = 0) {
  const [c, setC] = useState<Choices | null>(null);
  useEffect(() => {
    if (bump) choicesOnce = null;
    choicesOnce ||= api.get<Choices>('/event-admin/choices');
    choicesOnce.then(setC).catch(() => { choicesOnce = null; });
  }, [bump]);
  return c;
}
export const forgetChoices = () => { choicesOnce = null; };

/** Who an event is for, in words: "Everyone", or "Only: pastors, leaders". Any role picked means those roles only (the Noah API's rule). */
export const audienceText = (f: EventForm['filters'], groupNames: string[] = []) => {
  const roles = [f.pastor && 'pastors', f.leader && 'leaders', f.vip && 'VIPs', f.prayerWarrior && 'prayer warriors'].filter(Boolean) as string[];
  const groups = groupNames.length ? ` in ${groupNames.join(', ')}` : f.memberGroups.length ? ` in ${f.memberGroups.length} member group${f.memberGroups.length === 1 ? '' : 's'}` : '';
  if (!roles.length) return groups ? `Members${groups}` : 'Everyone';
  return `Only: ${roles.join(', ')}${groups}`;
};

/** '2026-11-07' -> 'Saturday, 7 Nov 2026'. */
export const dayLong = (d: string) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** '15:00' -> '3:00 pm'. */
export const time12 = (t: string) => {
  if (!/^\d{2}:\d{2}$/.test(t)) return t;
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

/** '2026-11-06T15:30' -> '6 Nov 2026, 3:30 pm'. */
export const whenLong = (v: string) => {
  if (!v) return '';
  const [d, t] = v.split('T');
  return `${new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${time12(t)}`;
};

export const TIMEZONES = (() => {
  const common = ['Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'Australia/Sydney'];
  let all: string[] = [];
  try { all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []; } catch { all = []; }
  return [...common, ...all.filter((z) => !common.includes(z))];
})();

/** A labelled block for a control that holds buttons (the member picker, a picture). <Field> is a <label>, and a
    click inside a label is passed on to the first button in it: choosing a member would press its Remove at once. */
export function FieldBox({ label, hint, error, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode }) {
  return (
    <div className="fld">
      <span className="lbl">{label}</span>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="errmsg">{error}</span>}
    </div>
  );
}

/**
 * Choose members by name or mobile number. `ids` is what is chosen; one when `single`.
 * Names for ids chosen before are fetched once, so an edited form shows who is there.
 */
export function MemberPicker({ ids, onChange, single, placeholder, label, pastorsOnly }: {
  ids: string[]; onChange: (ids: string[]) => void; single?: boolean; placeholder?: string; label: string;
  /** Offer only members marked as pastors. */
  pastorsOnly?: boolean;
}) {
  const [known, setKnown] = useState<Record<string, Person>>({});
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);

  /* Names for ids we have not seen. */
  useEffect(() => {
    const missing = ids.filter((id) => !known[id]);
    if (!missing.length) return;
    api.get<{ rows: Person[] }>(`/event-admin/members?ids=${missing.join(',')}`)
      .then((r) => setKnown((k) => ({ ...k, ...Object.fromEntries(r.rows.map((p) => [p.id, p])) })))
      .catch(() => {});
  }, [ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    setBusy(true);
    const t = setTimeout(() => {
      api.get<{ rows: Person[] }>(`/event-admin/members?q=${encodeURIComponent(term)}${pastorsOnly ? '&pastors=1' : ''}`)
        .then((r) => setHits(r.rows))
        .catch(() => setHits([]))
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, pastorsOnly]);

  const pick = (p: Person) => {
    setKnown((k) => ({ ...k, [p.id]: p }));
    onChange(single ? [p.id] : ids.includes(p.id) ? ids : [...ids, p.id]);
    setQ(''); setHits([]);
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      {ids.length > 0 && (
        <div className="row wrap gap6">
          {ids.map((id) => (
            <span key={id} className="chip plain" style={{ gap: 6 }}>
              <span>
                <b>{known[id]?.name ?? 'Member'}</b>
                {known[id]?.mobile && <span className="muted"> · {known[id].mobile}</span>}
              </span>
              <button type="button" className="icon-btn" style={{ width: 20, height: 20 }} aria-label={`Remove ${known[id]?.name ?? 'member'}`}
                onClick={() => onChange(ids.filter((x) => x !== id))}><Icon name="x" /></button>
            </span>
          ))}
        </div>
      )}
      {(!single || ids.length === 0) && (
        <>
          <input className="inp" value={q} aria-label={label} placeholder={placeholder ?? 'Type a name or mobile number'}
            onChange={(e) => setQ(e.target.value)} />
          {q.trim().length >= 2 && (
            <div className="card" style={{ maxHeight: 220, overflow: 'auto' }}>
              <ul className="list">
                {hits.map((p) => (
                  <li key={p.id} className="click" onClick={() => pick(p)}>
                    <span className="grow">
                      <span className="t1">{p.name}</span>
                      {p.mobile && <span className="t2">{p.mobile}</span>}
                    </span>
                    {ids.includes(p.id) ? <Icon name="check" /> : <Icon name="plus" />}
                  </li>
                ))}
                {!busy && !hits.length && <li className="muted" style={{ padding: 12 }}>{pastorsOnly ? 'No pastor found.' : 'No member found.'}</li>}
                {busy && !hits.length && <li className="muted" style={{ padding: 12 }}>Searching…</li>}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
