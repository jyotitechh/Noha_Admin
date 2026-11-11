/* Adding, changing or copying an event: the same steps as the old admin app, one page at a time.

   1 Details  2 About  3 Banner  4 Terms  5 Formatted terms  6 Translations  7 Hall and expenses  8 Who it is for
   9 Pass booking. The first page holds everything required, so Next checks it before moving on; the server checks
   it all again on Save and, if it refuses a field, the form opens the page that field is on. */

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Drawer, useToast } from '@/components/layers';
import { Btn, Field, Note, Switch } from '@/components/ui';
import { RichText } from '@/modules/content/RichText';
import { PictureInput } from '@/modules/content/PictureInput';
import { LocationPicker } from './LocationPicker';
import { FieldBox, MemberPicker, TIMEZONES, afterSave, announceTone, dayLong, time12, useChoices, type Announce, type EventForm as Form, type EventRow } from './shared';

const STEPS = [
  { id: 'details', label: 'Details' },
  { id: 'about', label: 'About' },
  { id: 'banner', label: 'Banner' },
  { id: 'terms', label: 'Terms and conditions' },
  { id: 'termsFormatted', label: 'Formatted terms' },
  { id: 'translation', label: 'Translations' },
  { id: 'hall', label: 'Hall and expenses' },
  { id: 'filters', label: 'Who it is for' },
  { id: 'blocked', label: 'Pass booking' },
] as const;

/** Which page a field the server refused is on. */
const stepOf = (field: string) => {
  if (field.startsWith('expenses') || field === 'hallId') return 6;
  const at: Record<string, number> = { preacherId: 0, about: 1, photo: 2, terms: 3, termsFormatted: 4, translation: 5, filters: 7, blockedEventIds: 8 };
  return at[field] ?? 0;
};

const pad = (n: number) => String(n).padStart(2, '0');
const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export const blankEvent = (): Form => ({
  name: '', description: '', showOnDashboard: false, hideFromPublic: false, hideFromLeaders: false,
  groupId: '', tallyLedgerTitle: '', messageTitle: '', preacherId: '',
  date: '', publishAt: nowLocal(),
  locationId: '', locationName: '', locationAddress: '', locationLat: '', locationLon: '', locationParts: null,
  startTime: '', endTime: '', timezone: 'Asia/Kolkata', hideFromDonation: false, visible: true,
  maxAge: null, meetingLink: '', zoomId: '', zoomPassword: '',
  about: '', photo: '', terms: '', termsFormatted: '', translation: '', hallId: '',
  expenses: {}, filters: { pastor: false, leader: false, vip: false, prayerWarrior: false, memberGroups: [] },
  blockedEventIds: [],
});

/** The fields of a full event the form edits (drops the names the server adds for showing it). */
export function formOf(e: Form): Form {
  const b = blankEvent();
  return Object.fromEntries(Object.keys(b).map((k) => [k, (e as unknown as Record<string, unknown>)[k] ?? (b as unknown as Record<string, unknown>)[k]])) as unknown as Form;
}

export function EventFormDrawer({ open, mode, eventId, start, onClose, onSaved }: {
  open: boolean;
  mode: 'add' | 'edit' | 'copy';
  eventId?: string;
  start: Form;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { toast } = useToast();
  const choices = useChoices();
  const [v, setV] = useState<Form>(start);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [others, setOthers] = useState<EventRow[]>([]);
  const [findEvent, setFindEvent] = useState('');

  useEffect(() => { if (open) { setV(start); setStep(0); setErrors({}); } }, [open, start]);
  useEffect(() => {
    if (!open) return;
    api.get<{ rows: EventRow[] }>('/event-admin/events').then((r) => setOthers(r.rows)).catch(() => setOthers([]));
  }, [open]);

  const set = <K extends keyof Form>(k: K, value: Form[K]) => {
    setV((x) => ({ ...x, [k]: value }));
    setErrors((e) => { const { [k as string]: _gone, ...rest } = e; return rest; });
  };
  const setFilter = (k: keyof Form['filters'], value: boolean | string[]) => setV((x) => ({ ...x, filters: { ...x.filters, [k]: value } }));
  const setExpense = (k: string, raw: string) => setV((x) => ({ ...x, expenses: { ...x.expenses, [k]: raw === '' ? null : Number(raw) } }));

  /** The required details, checked here so Next does not move past a gap. */
  function checkDetails() {
    const e: Record<string, string> = {};
    if (!v.name.trim()) e.name = 'Give the event a name.';
    if (!v.date) e.date = 'Choose the event date.';
    if (!v.publishAt) e.publishAt = 'Choose when it is published.';
    if (!v.startTime) e.startTime = 'Choose the start time.';
    if (!v.endTime) e.endTime = 'Choose the end time.';
    else if (v.startTime && v.endTime <= v.startTime) e.endTime = 'The end time must be after the start time.';
    setErrors(e);
    return !Object.keys(e).length;
  }

  function go(to: number) {
    if (to > 0 && step === 0 && !checkDetails()) return;
    setStep(Math.max(0, Math.min(STEPS.length - 1, to)));
  }

  async function save() {
    if (!checkDetails()) { setStep(0); return; }
    setBusy(true);
    try {
      const r = mode === 'edit' && eventId
        ? await api.put<{ id: string; announce?: Announce }>(`/event-admin/events/${eventId}`, v)
        : await api.post<{ id: string; announce?: Announce }>('/event-admin/events', v);
      toast((mode === 'edit' ? `“${v.name}” is saved.` : `“${v.name}” is added.`) + afterSave(r.announce), announceTone(r.announce));
      onSaved(r.id);
    } catch (e) {
      const err = e as ApiError;
      if (err.errors) {
        setErrors(err.errors);
        setStep(Math.min(...Object.keys(err.errors).map(stepOf)));
      }
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const blockable = useMemo(() => {
    const needle = findEvent.trim().toLowerCase();
    return others.filter((o) => o.id !== eventId && (!needle || o.name.toLowerCase().includes(needle)));
  }, [others, eventId, findEvent]);

  const title = mode === 'edit' ? `Edit ${start.name || 'event'}` : mode === 'copy' ? 'Copy event' : 'Add event';
  const last = step === STEPS.length - 1;
  /* Steps that hold a field the server or the checks refused: shown in red on the progress dots. */
  const badSteps = new Set(Object.keys(errors).map(stepOf));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="wide"
      title={title}
      sub={STEPS[step].label}
      footer={
        <>
          <Btn icon="chev-l" disabled={step === 0 || busy} onClick={() => go(step - 1)}>Back</Btn>
          <span className="sp" style={{ flex: 1 }} />
          <div className="row" style={{ gap: 8 }} role="group" aria-label="Progress">
            {STEPS.map((s, i) => (
              <button key={s.id} type="button" title={`${i + 1}. ${s.label}`} aria-label={`Step ${i + 1} of ${STEPS.length}: ${s.label}`} aria-current={i === step ? 'step' : undefined}
                onClick={() => go(i)}
                style={{
                  width: i === step ? 24 : 10, height: 10, borderRadius: 10, border: 0, padding: 0, cursor: 'pointer', transition: 'width .15s',
                  background: badSteps.has(i) ? 'var(--bad)' : i === step ? 'var(--brand)' : i < step ? 'var(--brand-line, #E7C6F2)' : 'var(--line, #d4d4dc)',
                }} />
            ))}
          </div>
          <span className="sp" style={{ flex: 1 }} />
          {mode === 'edit' && !last && <Btn disabled={busy} onClick={save}>Save</Btn>}
          {last
            ? <Btn variant="ok" icon="check" disabled={busy} onClick={save}>{busy ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add event'}</Btn>
            : <Btn variant="pri" icon="chev-r" disabled={busy} onClick={() => go(step + 1)}>Next</Btn>}
        </>
      }
    >
      {!choices ? <p className="muted">Loading…</p> : (
        <div className="stack">
          {step === 0 && (
            <>
              <Field label="Name *" error={errors.name}>
                <input className={'inp' + (errors.name ? ' err' : '')} value={v.name} maxLength={200} autoFocus onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Description">
                <textarea className="ta" rows={2} value={v.description} maxLength={2000} onChange={(e) => set('description', e.target.value)} />
              </Field>

              <div className="card pad stack" style={{ gap: 10 }}>
                {([['showOnDashboard', 'Show on dashboard'], ['hideFromPublic', 'Hide from public'], ['hideFromLeaders', 'Hide from leaders'], ['hideFromDonation', 'Hide from donation'], ['visible', 'Visible in the app']] as const).map(([k, label]) => (
                  <div key={k} className="row" style={{ alignItems: 'center' }}>
                    <span className="grow">{label}</span>
                    <Switch checked={v[k]} onChange={(on) => set(k, on)} label={label} />
                  </div>
                ))}
              </div>

              <Field label="Event group" error={errors.groupId}
                hint={choices.eventGroups.length ? undefined : 'No event groups yet. Add one on the Event groups tab.'}>
                <select className="sel" value={v.groupId} onChange={(e) => set('groupId', e.target.value)}>
                  <option value="">None</option>
                  {choices.eventGroups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.languageGroupName ? ` · ${g.languageGroupName}` : ''}</option>)}
                </select>
              </Field>
              <div className="g2">
                <Field label="Tally ledger title">
                  <input className="inp" value={v.tallyLedgerTitle} maxLength={200} onChange={(e) => set('tallyLedgerTitle', e.target.value)} />
                </Field>
                <Field label="Message title">
                  <input className="inp" value={v.messageTitle} maxLength={300} onChange={(e) => set('messageTitle', e.target.value)} />
                </Field>
              </div>
              <FieldBox label="Preacher" hint="Only pastors can be chosen." error={errors.preacherId}>
                <MemberPicker single pastorsOnly label="Preacher" placeholder="Type a pastor's name or mobile number"
                  ids={v.preacherId ? [v.preacherId] : []} onChange={(ids) => set('preacherId', ids[0] ?? '')} />
              </FieldBox>

              <div className="g2">
                <Field label="Event date *" error={errors.date}>
                  <input className={'inp' + (errors.date ? ' err' : '')} type="date" value={v.date} onChange={(e) => set('date', e.target.value)} />
                </Field>
                <Field label="Publish date and time *" error={errors.publishAt}>
                  <input className={'inp' + (errors.publishAt ? ' err' : '')} type="datetime-local" value={v.publishAt} onChange={(e) => set('publishAt', e.target.value)} />
                </Field>
                <Field label="Start time *" error={errors.startTime}>
                  <input className={'inp' + (errors.startTime ? ' err' : '')} type="time" value={v.startTime} onChange={(e) => set('startTime', e.target.value)} />
                </Field>
                <Field label="End time *" error={errors.endTime}>
                  <input className={'inp' + (errors.endTime ? ' err' : '')} type="time" value={v.endTime} onChange={(e) => set('endTime', e.target.value)} />
                </Field>
              </div>
              <Field label="Timezone" error={errors.timezone}>
                <select className="sel" value={v.timezone} onChange={(e) => set('timezone', e.target.value)}>
                  {TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
              </Field>

              <FieldBox label="Location" error={errors.locationName}>
                <LocationPicker
                  map={choices.map}
                  saved={choices.savedLocations}
                  value={v.locationName || v.locationAddress
                    ? { id: v.locationId, name: v.locationName, address: v.locationAddress, lat: v.locationLat, lon: v.locationLon }
                    : null}
                  onChange={(c) => setV((x) => ({
                    ...x,
                    locationId: c?.id ?? '', locationName: c?.name ?? '', locationAddress: c?.address ?? '',
                    locationLat: c?.lat ?? '', locationLon: c?.lon ?? '', locationParts: c?.parts ?? null,
                  }))} />
              </FieldBox>

              <div className="g2">
                <Field label="Attendee's maximum age" error={errors.maxAge}>
                  <input className={'inp' + (errors.maxAge ? ' err' : '')} type="number" min={1} max={120} value={v.maxAge ?? ''}
                    onChange={(e) => set('maxAge', e.target.value === '' ? null : Number(e.target.value))} />
                </Field>
                <Field label="Meeting link" error={errors.meetingLink}>
                  <input className={'inp' + (errors.meetingLink ? ' err' : '')} value={v.meetingLink} placeholder="https://" onChange={(e) => set('meetingLink', e.target.value)} />
                </Field>
                <Field label="Zoom meeting ID">
                  <input className="inp" value={v.zoomId} maxLength={60} onChange={(e) => set('zoomId', e.target.value)} />
                </Field>
                <Field label="Zoom meeting password">
                  <input className="inp" value={v.zoomPassword} maxLength={60} onChange={(e) => set('zoomPassword', e.target.value)} />
                </Field>
              </div>
            </>
          )}

          {step === 1 && <RichText label="About the event" value={v.about} onChange={(html) => set('about', html)} />}

          {step === 2 && (
            <FieldBox label="Banner image" error={errors.photo}>
              <PictureInput label="Banner image" value={v.photo} invalid={!!errors.photo} onChange={(url) => set('photo', url)} />
            </FieldBox>
          )}

          {step === 3 && (
            <Field label="Terms and conditions">
              <textarea className="ta" rows={12} value={v.terms} onChange={(e) => set('terms', e.target.value)} />
            </Field>
          )}

          {step === 4 && <RichText label="Terms and conditions, formatted" value={v.termsFormatted} onChange={(html) => set('termsFormatted', html)} />}

          {step === 5 && (
            <Field label="Translations">
              <textarea className="ta" rows={12} value={v.translation} onChange={(e) => set('translation', e.target.value)} />
            </Field>
          )}

          {step === 6 && (
            <>
              <Field label="Hall" error={errors.hallId} hint={choices.halls.length ? undefined : 'No halls have been set up yet.'}>
                <select className="sel" value={v.hallId} onChange={(e) => set('hallId', e.target.value)}>
                  <option value="">Not set</option>
                  {choices.halls.map((h) => <option key={h.id} value={h.id}>{h.name}{h.seats ? ` · ${h.seats} seats` : ''}</option>)}
                </select>
              </Field>
              <div className="sect-title">Expenses (₹)</div>
              <div className="g2">
                {choices.expenses.map((x) => (
                  <Field key={x.key} label={x.label} error={errors[`expenses.${x.key}`]}>
                    <input className="inp" type="number" min={0} step="0.01" value={v.expenses[x.key] ?? ''} onChange={(e) => setExpense(x.key, e.target.value)} />
                  </Field>
                ))}
              </div>
            </>
          )}

          {step === 7 && (
            <>
              <div className="sect-title">Event filters</div>
              <div className="card pad stack" style={{ gap: 10 }}>
                {([['pastor', 'For pastors'], ['leader', 'For leaders'], ['vip', 'For VIPs'], ['prayerWarrior', 'For prayer warriors']] as const).map(([k, label]) => (
                  <div key={k} className="row" style={{ alignItems: 'center' }}>
                    <span className="grow">{label}</span>
                    <Switch checked={v.filters[k]} onChange={(on) => setFilter(k, on)} label={label} />
                  </div>
                ))}
              </div>
              <div className="sect-title">Member groups</div>
              {choices.memberGroups.length ? (
                <div className="card pad stack" style={{ gap: 8 }}>
                  {choices.memberGroups.map((g) => (
                    <label key={g.id} className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={v.filters.memberGroups.includes(g.id)}
                        onChange={(e) => setFilter('memberGroups', e.target.checked ? [...v.filters.memberGroups, g.id] : v.filters.memberGroups.filter((x) => x !== g.id))} />
                      {g.name}
                    </label>
                  ))}
                </div>
              ) : <p className="muted small">No member groups have been set up yet.</p>}
            </>
          )}

          {step === 8 && (
            <>
              <p className="muted mt0">A member who has a pass for one of these events cannot book a pass for this one.</p>
              {errors.blockedEventIds && <Note tone="bad" icon="alert">{errors.blockedEventIds}</Note>}
              <input className="inp" value={findEvent} placeholder="Find an event" aria-label="Find an event" onChange={(e) => setFindEvent(e.target.value)} />
              <div className="card" style={{ maxHeight: 360, overflow: 'auto' }}>
                <ul className="list">
                  {blockable.map((o) => (
                    <li key={o.id}>
                      <label className="row grow" style={{ gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                        <input type="checkbox" checked={v.blockedEventIds.includes(o.id)}
                          onChange={(e) => set('blockedEventIds', e.target.checked ? [...v.blockedEventIds, o.id] : v.blockedEventIds.filter((x) => x !== o.id))} />
                        <span className="grow">
                          <span className="t1">{o.name}</span>
                          <span className="t2">{dayLong(o.date)} · {time12(o.startTime)} to {time12(o.endTime)}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                  {!blockable.length && <li className="muted" style={{ padding: 12 }}>No other events.</li>}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
