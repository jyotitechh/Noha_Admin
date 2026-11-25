/* A child's own record, opened from the Children list (GET /api/children/:kidId).

   What the parents gave when they added the child (photo, name, date of birth, gender, Aadhaar), who the parents are, and how
   far the child is on the way to becoming a member: the notice at 15, Make member (Family requests) and the consent (App
   registrations). A parent's record, or the child's own member record once they have one, opens from here on request. */

import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { Btn, Chip, Failed, Kv, Loading, Note, Who } from '@/components/ui';
import { AuthImage } from '@/components/AuthImage';
import { fd, fdt } from '@/lib/format';

export interface ChildRecord {
  kidId: string; name: string; salutation: string | null; gender: string | null; dob: string | null; age: number | null;
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

export function ChildDetail({ kidId, onOpenMember }: {
  kidId: string;
  /** Open a member's own record: a parent's, or the child's once they are a member. */
  onOpenMember: (who: { rowId: string; name: string }) => void;
}) {
  const q = useQuery(() => api.get<ChildRecord>(`/children/${kidId}`), [kidId]);
  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading what="the child" />;
  const c = q.data;
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
        <div className="sect-title">About the child</div>
        <Kv rows={[
          ['Name', <b key="n">{c.name}</b>],
          ['Gender', c.gender || '—'],
          ['Date of birth', born(c.dob)],
          ['Age', c.age != null ? `${c.age} years` : '—'],
          ['Blood group', c.bloodGroup || '—'],
          ['Added by the parents', c.addedAt ? fd(new Date(c.addedAt)) : '—'],
        ]} />
      </section>

      <section>
        <div className="sect-title">Aadhaar</div>
        <Kv rows={[['Aadhaar number', c.aadhaarNo ? <span key="a" className="mono">{c.aadhaarNo}</span> : 'Not given']]} />
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
