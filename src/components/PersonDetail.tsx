/* One person, everything about them, in one place.

   Opened from "Approved and history" and from the member register. It replaces
   five separate screens (Video checks, Families, Groups, Pastoral hierarchy,
   Partnership), each of which showed one slice of a person. The office works
   from the person.

   Top to bottom: who they are; the registration they made, with the photograph,
   ID and KYC video already open; who looks after them; partnership; family;
   groups.

   Two things are said plainly rather than shown as empty. Family and groups are
   not stored in Catalyst yet — their tables exist but have no columns — and
   "this person has no family" is very different from "families are not recorded
   yet". And a role that may not see registrations is told there is one it cannot
   open, rather than being shown nothing. */

import { useState } from 'react';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/auth';
import { useToast } from '@/components/layers';
import { Btn, Chip, Failed, Kv, Loading, Note, Status } from '@/components/ui';
import { fd, fdt } from '@/lib/format';
import { Steps } from '@/modules/members/Registrations';
import type { Registration } from '@/lib/types';

interface Link { rowId: string; name: string; mobile?: string }

interface Profile {
  member: {
    id: string; rowId: string; name: string; status: string; approved?: boolean; blocked?: boolean;
    g?: string; age?: number; kid?: boolean; lang?: string; mobile?: string; email?: string;
    address?: string; loc?: string; joined?: Date | null; partner?: boolean; masked?: boolean;
  };
  registration: Registration | null;
  registrationHidden?: boolean;
  earlier: { id: string; state: string; at: Date | null; remark: string }[];
  pastoral: { pastor: Link | null; cellLeader: Link | null; cell: string | null };
  partnership: { isPartner: boolean; expiresOn: Date | null };
  family: { recorded: boolean; why?: string; rows: { rowId: string; name: string; rel?: string; age?: number; kid?: boolean }[] };
  groups: { recorded: boolean; why?: string; rows: { rowId: string; name: string }[] };
}

const STATE_CHIP: Record<string, { tone: 'ok' | 'bad' | 'warn' | 'mute'; label: string }> = {
  approved: { tone: 'ok', label: 'Approved' },
  rejected: { tone: 'bad', label: 'Rejected' },
  videoReturned: { tone: 'bad', label: 'Video returned' },
  pending: { tone: 'warn', label: 'Waiting for a decision' },
  draft: { tone: 'mute', label: 'Not submitted' },
};

const Missing = ({ why }: { why?: string }) => (
  <Note tone="mute" icon="info">
    <b>Not recorded yet.</b> {why}
  </Note>
);

export function PersonDetail({ memberRowId }: { memberRowId: string }) {
  const q = useQuery(() => api.get<Profile>(`/people/${memberRowId}`), [memberRowId]);
  const { can } = useAuth();
  const { toast } = useToast();
  const [contact, setContact] = useState<{ mobile: string; email: string; address: string } | null>(null);
  const [revealing, setRevealing] = useState(false);

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading what="this person" />;

  const { member, registration, pastoral, partnership, family, groups } = q.data;

  /* Every reveal is written to the audit log, so it is a click and not a load. */
  async function reveal() {
    setRevealing(true);
    try {
      setContact(await api.get<{ mobile: string; email: string; address: string }>(`/people/${memberRowId}/contact`));
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setRevealing(false);
    }
  }
  const s = registration ? STATE_CHIP[registration.state] : null;

  return (
    <div className="stack">
      <div className="row wrap gap6">
        <Status>{member.status}</Status>
        {s && <Chip tone={s.tone}>{s.label}</Chip>}
        {partnership.isPartner && <Chip tone="brand" icon="heart">Covenant partner</Chip>}
        {member.kid && <Chip tone="plain">Child</Chip>}
        {member.masked && !contact && <Chip tone="mute" icon="lock">Contact details hidden</Chip>}
      </div>

      {/* ---------- who they are ---------- */}
      <section>
        <div className="sect-title">Who they are</div>
        <Kv rows={[
          ['Name', <b key="n">{member.name}</b>],
          ['Member number', <span key="i" className="mono">{member.id}</span>],
          ['Mobile', <span key="m" className="mono">{(contact?.mobile ?? member.mobile) || '—'}</span>],
          ['Email', (contact?.email ?? member.email) || '—'],
          ['Age and gender', member.age ? `${member.age} · ${member.g === 'F' ? 'Female' : 'Male'}` : '—'],
          ['Language', member.lang || '—'],
          ['Congregation', member.loc || '—'],
          ['Address', (contact?.address ?? member.address) || '—'],
          ['Member since', member.joined ? fd(member.joined) : '—'],
        ]} />
        {member.masked && !contact && can('members.pii') && (
          <div className="mt8">
            <Btn icon="lock" disabled={revealing} onClick={reveal}>
              {revealing ? 'Revealing…' : 'Reveal contact details'}
            </Btn>
            <span className="xs muted" style={{ marginLeft: 8 }}>Recorded in the audit log.</span>
          </div>
        )}
        {contact && (
          <p className="xs muted mt8">Revealed just now. This was recorded in the audit log.</p>
        )}
      </section>

      {/* ---------- the registration, with photo, ID and video open ---------- */}
      <section>
        <div className="sect-title">Registration</div>
        {registration ? (
          <>
            {registration.remark && (
              <Note tone={registration.state === 'approved' ? 'mute' : 'warn'} icon="chats">
                <b>
                  {registration.state === 'approved' ? 'Note' : 'What the member was told'}
                  {registration.decidedAt ? ` · ${fdt(registration.decidedAt)}` : ''}
                  {registration.decidedBy ? ` · ${registration.decidedBy}` : ''}
                </b>
                <br />“{registration.remark}”
              </Note>
            )}
            <div className="card pad mt8">
              <Steps r={registration} auto />
            </div>
          </>
        ) : q.data.registrationHidden ? (
          <Note tone="mute" icon="lock">
            This person registered through the app. Reading the registration, with the ID and video,
            needs the permission to edit members.
          </Note>
        ) : (
          <Note tone="mute" icon="info">
            No app registration on record. They were added by the office.
          </Note>
        )}

        {q.data.earlier.length > 0 && (
          <>
            <div className="sect-title mt16">Earlier attempts</div>
            <ul className="list">
              {q.data.earlier.map((e) => (
                <li key={e.id}>
                  <span className="grow">
                    <span className="t1">{STATE_CHIP[e.state]?.label ?? e.state}</span>
                    <span className="t2">{e.at ? fdt(e.at) : ''}{e.remark ? ` · “${e.remark}”` : ''}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ---------- pastoral care ---------- */}
      <section>
        <div className="sect-title">Pastoral care</div>
        <Kv rows={[
          ['Pastor', pastoral.pastor ? <b key="p">{pastoral.pastor.name}</b> : <span className="muted">Not assigned</span>],
          ['Cell leader', pastoral.cellLeader ? <b key="l">{pastoral.cellLeader.name}</b> : <span className="muted">Not assigned</span>],
          ...(pastoral.cell ? [['Cell', pastoral.cell] as [string, string]] : []),
        ]} />
      </section>

      {/* ---------- partnership ---------- */}
      <section>
        <div className="sect-title">Partnership</div>
        <Kv rows={[
          ['Covenant partner', partnership.isPartner ? 'Yes' : 'No'],
          ...(partnership.isPartner
            ? [['Partnership runs to', partnership.expiresOn ? fd(partnership.expiresOn) : '—'] as [string, string]]
            : []),
        ]} />
      </section>

      {/* ---------- family ---------- */}
      <section>
        <div className="sect-title">Family</div>
        {!family.recorded ? (
          <Missing why={family.why} />
        ) : family.rows.length === 0 ? (
          <p className="muted small">No one else is on their household record.</p>
        ) : (
          <ul className="list">
            {family.rows.map((f) => (
              <li key={f.rowId}>
                <span className="grow">
                  <span className="t1">{f.name}</span>
                  <span className="t2">{[f.rel, f.age ? `${f.age} years` : '', f.kid ? 'child' : ''].filter(Boolean).join(' · ')}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- groups ---------- */}
      <section>
        <div className="sect-title">Groups</div>
        {!groups.recorded ? (
          <Missing why={groups.why} />
        ) : groups.rows.length === 0 ? (
          <p className="muted small">Not in any group.</p>
        ) : (
          <ul className="list">
            {groups.rows.map((g) => <li key={g.rowId}><span className="grow"><span className="t1">{g.name}</span></span></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
