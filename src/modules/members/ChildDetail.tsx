/* A child's own record, opened from the Children list (GET /api/children/:kidId).

   What the parents gave when they added the child (photo, name, date of birth, gender, Aadhaar), who the parents are, and how
   far the child is on the way to becoming a member: the notice at 15, Make member (Family requests) and the consent (App
   registrations). A parent's record, or the child's own member record once they have one, opens from here on request.

   The office can correct the child's details here (Edit): name, gender, date of birth, blood group and, for staff who may see
   contact details, the Aadhaar number. A child who is a member has the name, gender and date of birth changed on their member
   record too. The photo and the Aadhaar picture are the parents' uploads and stay as they are. */

import { useState } from 'react';
import { api, type ApiError } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/auth';
import { useToast } from '@/components/layers';
import { Btn, Chip, Failed, Field, Kv, Loading, Note, Who } from '@/components/ui';
import { AuthImage } from '@/components/AuthImage';
import { fd, fdt } from '@/lib/format';

export interface ChildRecord {
  kidId: string; name: string; firstName: string; middleName: string; lastName: string; genderKey: 'male' | 'female' | 'other' | null;
  salutation: string | null; gender: string | null; dob: string | null; age: number | null;
  bloodGroup: string | null; kidPhoto: boolean; aadhaarNo: string; aadhaarPicture: boolean; masked: boolean;
  parents: { rowId: string; name: string; mobile: string; rel: string }[];
  state: string; memberRowId: string | null; fifteen: boolean; noticeAt: string | null; noticesRead: boolean; addedAt: string | null;
  makeMember: { id: string; state: string; at: string | null; mobile: string; remark: string; requesterName: string }[];
  consent: { id: string; status: string; sentAt: string | null; decidedAt: string | null; note: string; videoSeconds: number | null } | null;
}

export const CHILD_STATE: Record<string, { tone: 'ok' | 'bad' | 'warn' | 'mute' | 'brand'; label: string }> = {
  young: { tone: 'mute', label: 'Under 15' },
  none: { tone: 'brand', label: 'Not a member yet' },
  requested: { tone: 'warn', label: 'Make member asked for' },
  login: { tone: 'brand', label: 'Made a member · consent not sent yet' },
  waiting: { tone: 'warn', label: 'Consent waiting for a decision' },
  member: { tone: 'ok', label: 'Member' },
  consentBack: { tone: 'bad', label: 'Consent sent back' },
};

const REQUEST_TONE: Record<string, 'warn' | 'ok' | 'bad' | 'mute'> = { Pending: 'warn', Approved: 'ok', Rejected: 'bad', Cancelled: 'mute' };
const REQUEST_WORD: Record<string, string> = { Pending: 'Waiting for the office', Approved: 'Approved', Rejected: 'Rejected', Cancelled: 'Withdrawn by the parent' };
const CONSENT_WORD: Record<string, { tone: 'warn' | 'ok' | 'bad' | 'mute' | 'brand'; label: string }> = {
  draft: { tone: 'brand', label: 'Not sent yet' },
  pending: { tone: 'warn', label: 'Waiting for the office' },
  approved: { tone: 'ok', label: 'Approved' },
  rejected: { tone: 'bad', label: 'Sent back' },
  videoReturned: { tone: 'bad', label: 'Video sent back' },
};

const born = (d: string | null) => (d ? fd(new Date(d + 'T00:00:00')) : '—');
const at = (d: string | null) => (d ? fdt(new Date(d)) : '');

interface Form { salutation: string; firstName: string; middleName: string; lastName: string; gender: string; dateOfBirth: string; bloodGroup: string; aadhaarNo: string }

const formOf = (c: ChildRecord): Form => ({
  salutation: c.salutation ?? '', firstName: c.firstName, middleName: c.middleName, lastName: c.lastName,
  gender: c.genderKey ?? '', dateOfBirth: c.dob ?? '', bloodGroup: c.bloodGroup ?? '', aadhaarNo: c.aadhaarNo,
});

export function ChildDetail({ kidId, onOpenMember, onChanged }: {
  kidId: string;
  /** Open a member's own record: a parent's, or the child's once they are a member. */
  onOpenMember: (who: { rowId: string; name: string }) => void;
  /** Called after the office corrected the child, so the list around it reads its rows again. */
  onChanged?: () => void;
}) {
  const { can } = useAuth();
  const { toast } = useToast();
  const q = useQuery(() => api.get<ChildRecord>(`/children/${kidId}`), [kidId]);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading what="the child" />;
  const c = q.data;
  const editing = form !== null;
  const set = (k: keyof Form, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  /* Send only what changed. The Aadhaar number is left out unless it was changed: it may be partly hidden for this role. */
  async function save() {
    if (!form) return;
    const was = formOf(c);
    const changes: Record<string, string> = {};
    for (const k of Object.keys(form) as (keyof Form)[]) {
      if (k === 'aadhaarNo' && c.masked) continue;
      if (form[k].trim() !== was[k].trim()) changes[k] = form[k].trim();
    }
    if (!Object.keys(changes).length) { setForm(null); setErrors({}); return; }
    setBusy(true);
    setErrors({});
    try {
      const out = await api.patch<{ changed: string[]; alsoMember: boolean }>(`/children/${kidId}`, { changes });
      setForm(null);
      q.reload();
      onChanged?.();
      toast(out.alsoMember ? 'Saved. Their member record is changed too.' : 'Saved. The details are corrected.', 'ok');
    } catch (e) {
      const err = e as ApiError;
      setErrors(err.errors ?? {});
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const st = CHILD_STATE[c.state] ?? { tone: 'mute' as const, label: c.state };
  const asked = c.makeMember[0] ?? null;

  return (
    <div className="stack">
      <div className="row gap12" style={{ alignItems: 'center' }}>
        {c.kidPhoto
          ? <AuthImage path={`/children/${c.kidId}/photo`} alt={c.name} width={96} height={96} fit="cover" open />
          : <div className="muted small" style={{ width: 96, height: 96, display: 'grid', placeItems: 'center', border: '1px solid var(--line)', borderRadius: 10 }}>No photo</div>}
        <div className="grow">
          <b style={{ fontSize: 18 }}>{c.salutation ? `${c.salutation} ` : ''}{c.name}</b>
          <div className="row wrap gap6 mt8">
            <Chip tone={st.tone}>{st.label}</Chip>
            {c.age != null && <Chip>{c.age} yr</Chip>}
          </div>
        </div>
      </div>

      <section>
        <div className="row">
          <div className="sect-title grow">About the child</div>
          {can('members.edit') && !editing && <Btn sm icon="edit" onClick={() => { setForm(formOf(c)); setErrors({}); }}>Edit</Btn>}
        </div>
        {editing && form ? (
          <div className="card pad stack" style={{ gap: 12 }}>
            <Field label="Title" error={errors.salutation}>
              <input className="inp" value={form.salutation} maxLength={50} onChange={(e) => set('salutation', e.target.value)} />
            </Field>
            <Field label={<>First name <span style={{ color: 'var(--bad)' }}>*</span></>} error={errors.firstName}>
              <input className="inp" value={form.firstName} maxLength={100} autoFocus onChange={(e) => set('firstName', e.target.value)} />
            </Field>
            <Field label="Middle name" error={errors.middleName}>
              <input className="inp" value={form.middleName} maxLength={100} onChange={(e) => set('middleName', e.target.value)} />
            </Field>
            <Field label="Last name" error={errors.lastName}>
              <input className="inp" value={form.lastName} maxLength={100} onChange={(e) => set('lastName', e.target.value)} />
            </Field>
            <Field label="Gender" error={errors.gender}>
              <select className="sel" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">Choose…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Date of birth" error={errors.dateOfBirth}>
              <input className="inp" type="date" value={form.dateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set('dateOfBirth', e.target.value)} />
            </Field>
            <Field label="Blood group" error={errors.bloodGroup}>
              <input className="inp" value={form.bloodGroup} maxLength={100} onChange={(e) => set('bloodGroup', e.target.value)} />
            </Field>
            {!c.masked && (
              <Field label="Aadhaar number" hint="12 digits. Leave empty to remove it." error={errors.aadhaarNo}>
                <input className="inp mono" inputMode="numeric" value={form.aadhaarNo} maxLength={14} onChange={(e) => set('aadhaarNo', e.target.value)} />
              </Field>
            )}
            {c.memberRowId && <Note tone="info" icon="info">{c.firstName || 'The child'} is a member now. The name, gender and date of birth are changed on their member record too.</Note>}
            <div className="row gap8">
              <span className="sp" style={{ flex: 1 }} />
              <Btn onClick={() => { setForm(null); setErrors({}); }} disabled={busy}>Cancel</Btn>
              <Btn variant="ok" icon="check" onClick={save} disabled={busy || !form.firstName.trim()}>Save changes</Btn>
            </div>
          </div>
        ) : (
          <Kv rows={[
            ['Name', <b key="n">{c.name}</b>],
            ['Gender', c.gender || '—'],
            ['Date of birth', born(c.dob)],
            ['Age', c.age != null ? `${c.age} years` : '—'],
            ['Blood group', c.bloodGroup || '—'],
            ['Added by the parents', c.addedAt ? fd(new Date(c.addedAt)) : '—'],
          ]} />
        )}
      </section>

      <section>
        <div className="sect-title">Aadhaar</div>
        {!editing && <Kv rows={[['Aadhaar number', c.aadhaarNo ? <span key="a" className="mono">{c.aadhaarNo}</span> : 'Not given']]} />}
        {c.aadhaarPicture && (
          <div className="mt8"><AuthImage path={`/children/${c.kidId}/aadhaar`} alt="Aadhaar" width={320} open /></div>
        )}
        {c.masked && c.aadhaarNo && <div className="xs muted mt4">Partly hidden for your role.</div>}
      </section>

      <section>
        <div className="sect-title">Parents</div>
        {c.parents.length ? (
          <div className="stack" style={{ gap: 8 }}>
            {c.parents.map((p) => (
              <div key={p.rowId} className="row gap8" style={{ alignItems: 'center' }}>
                <div className="grow"><Who name={p.name} sub={<>{p.rel} · <span className="mono">{p.mobile || '—'}</span></>} photoId={p.rowId} /></div>
                <Btn sm onClick={() => onOpenMember({ rowId: p.rowId, name: p.name })}>Open {p.rel.toLowerCase()}'s record</Btn>
              </div>
            ))}
          </div>
        ) : <span className="muted">Not linked to a parent.</span>}
      </section>

      <section>
        <div className="sect-title">Becoming a member</div>
        <Kv rows={[
          ['Notice at 15', !c.fifteen ? 'Under 15, not due yet'
            : c.noticeAt ? <Chip key="t" tone="ok" icon="check">Told {fd(new Date(c.noticeAt))}</Chip>
              : c.state !== 'none' && c.state !== 'young' ? 'Not needed'
                : c.noticesRead ? <Chip key="t" tone="warn">Not told yet</Chip> : '—'],
          ['Make member', asked
            ? <span key="m"><Chip tone={REQUEST_TONE[asked.state] ?? 'mute'}>{REQUEST_WORD[asked.state] ?? asked.state}</Chip>
                <span className="muted small"> {at(asked.at)}{asked.requesterName ? ` · asked by ${asked.requesterName}` : ''}</span></span>
            : c.memberRowId ? 'Approved' : 'Not asked yet'],
          ...(asked?.mobile ? [["Child's own number", <span key="n" className="mono">{asked.mobile}</span>] as [string, React.ReactNode]] : []),
          ...(asked?.state === 'Rejected' && asked.remark ? [['Reason given', `“${asked.remark}”`] as [string, React.ReactNode]] : []),
          ['Consent and video', c.consent
            ? <span key="c"><Chip tone={(CONSENT_WORD[c.consent.status] ?? CONSENT_WORD.draft).tone}>{(CONSENT_WORD[c.consent.status] ?? CONSENT_WORD.draft).label}</Chip>
                <span className="muted small"> {c.consent.decidedAt ? `decided ${at(c.consent.decidedAt)}` : c.consent.sentAt ? `sent ${at(c.consent.sentAt)}` : ''}</span></span>
            : 'Not started'],
          ...(c.consent?.note && c.consent.status !== 'approved' ? [['Note to the child', `“${c.consent.note}”`] as [string, React.ReactNode]] : []),
        ]} />
        {c.makeMember.length > 1 && (
          <div className="small muted mt8">Asked {c.makeMember.length} times. Earlier: {c.makeMember.slice(1).map((r) => `${REQUEST_WORD[r.state] ?? r.state} ${at(r.at)}`).join('; ')}.</div>
        )}
        {c.memberRowId ? (
          <div className="mt12">
            <Btn icon="user" onClick={() => onOpenMember({ rowId: c.memberRowId!, name: c.name })}>Open {c.name.split(' ')[0]}'s member record</Btn>
          </div>
        ) : c.state === 'requested' ? (
          <div className="mt12"><Note tone="warn" icon="clock">The parents asked to make {c.name.split(' ')[0]} a member. Decide it in New Child Requests, at the top of the Children screen.</Note></div>
        ) : null}
      </section>
    </div>
  );
}
