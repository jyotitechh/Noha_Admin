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

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/auth';
import { useToast } from '@/components/layers';
import { Btn, Chip, Failed, Kv, Loading, Note, Status } from '@/components/ui';
import { fd, fdt } from '@/lib/format';
import { Steps } from '@/modules/members/Registrations';
import { EditPerson, type EditSpec } from '@/components/EditPerson';
import type { Registration } from '@/lib/types';

interface Link { rowId: string; name: string; mobile?: string }
/* A cell leader as offered to the office: how far, how many members, and how many more they can take. */
interface Leader extends Link { where?: string; distanceKm?: number; members?: number; capacity?: number; roomLeft?: number }

interface Profile {
  member: {
    id: string; rowId: string; name: string; status: string; approved?: boolean; blocked?: boolean;
    g?: string; age?: number; kid?: boolean; lang?: string; mobile?: string; email?: string;
    address?: string; loc?: string; joined?: Date | null; partner?: boolean; masked?: boolean;
  };
  /* Present only for someone who may edit members. */
  edit?: EditSpec;
  registration: Registration | null;
  registrationHidden?: boolean;
  earlier: { id: string; state: string; at: Date | null; remark: string }[];
  pastoral: { pastor: Link | null; cellLeader: Link | null; cell: string | null };
  /* Who may be picked, for someone who may edit members. */
  pastoralChoices?: { pastors: Link[]; leaders: Leader[]; here?: { where: string; shared: boolean } };
  partnership: { isPartner: boolean; expiresOn: Date | null };
  family: { recorded: boolean; why?: string; rows: { rowId: string; name: string; rel?: string; age?: number; kid?: boolean; member?: boolean }[] };
  /* The relations the office can pick, for someone who may edit members. */
  relationOptions?: { code: number; label: string; extra?: boolean }[];
  groups: { recorded: boolean; why?: string; rows: { rowId: string; name: string }[] };
}

const STATE_CHIP: Record<string, { tone: 'ok' | 'bad' | 'warn' | 'mute'; label: string }> = {
  approved: { tone: 'ok', label: 'Approved' },
  rejected: { tone: 'bad', label: 'Rejected' },
  videoReturned: { tone: 'bad', label: 'Video returned' },
  pending: { tone: 'warn', label: 'Waiting for a decision' },
  draft: { tone: 'mute', label: 'Not submitted' },
};

/* How a cell leader reads in the list: "Ruth Mathew · Andheri · 3 km · 12 members, room for 8". */
const optionText = (o: Leader) => [
  o.name,
  o.where,
  o.distanceKm !== undefined ? `${o.distanceKm} km` : undefined,
  o.members !== undefined
    ? `${o.members} member${o.members === 1 ? '' : 's'}${o.roomLeft !== undefined ? (o.roomLeft > 0 ? `, room for ${o.roomLeft}` : ', full') : ''}`
    : undefined,
].filter(Boolean).join(' · ');

const Missing = ({ why }: { why?: string }) => (
  <Note tone="mute" icon="info">
    <b>Not recorded yet.</b> {why}
  </Note>
);

/* `onChanged` is called after the office edits the person, so the list this is
   open from can read again and not show the old name behind the drawer. */
export function PersonDetail({ memberRowId, onChanged }: { memberRowId: string; onChanged?: () => void }) {
  const q = useQuery(() => api.get<Profile>(`/people/${memberRowId}`), [memberRowId]);
  const { can } = useAuth();
  const { toast } = useToast();
  const [contact, setContact] = useState<{ mobile: string; email: string; address: string } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [telling, setTelling] = useState(false);
  const [savingCare, setSavingCare] = useState(false);
  /* Adding a relative: the search box, what it found, who was picked, and the relation. */
  const [relQ, setRelQ] = useState('');
  const [relResults, setRelResults] = useState<{ rowId: string; name: string; where: string }[]>([]);
  const [relPick, setRelPick] = useState<{ rowId: string; name: string } | null>(null);
  /* What the search is doing, so the office is never left looking at a box that seems to do nothing. */
  const [relSearch, setRelSearch] = useState<'idle' | 'searching' | 'done' | 'error'>('idle');
  const [relError, setRelError] = useState('');
  const relBox = useRef<HTMLDivElement>(null);
  const [relCode, setRelCode] = useState('');
  const [savingRel, setSavingRel] = useState(false);

  /* Look members up as the office types (after a short pause), unless one has already been picked. */
  useEffect(() => {
    if (relPick || relQ.trim().length < 2) { setRelResults([]); setRelSearch('idle'); return; }
    let live = true;
    setRelSearch('searching');
    const t = setTimeout(() => {
      api.get<{ rows: { rowId: string; name: string; where: string }[] }>(`/people/${memberRowId}/relation-candidates?q=${encodeURIComponent(relQ.trim())}`)
        .then((r) => { if (live) { setRelResults(r.rows); setRelSearch('done'); setRelError(''); } })
        .catch((e) => { if (live) { setRelResults([]); setRelSearch('error'); setRelError((e as Error).message); } });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [relQ, relPick, memberRowId]);

  useEffect(() => { if (relSearch === 'done' || relSearch === 'error') relBox.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [relSearch, relResults]);

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading what="this person" />;

  const { member, registration, pastoral, partnership, family, groups, relationOptions } = q.data;

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

  /* The decision is stored; this makes sure the member has been told (push, or email if no
     phone could be reached). The Noah API tells each member once, so repeating is harmless. */
  async function tell() {
    if (!registration) return;
    setTelling(true);
    try {
      const r = await api.post<{ message: string; delivered: boolean }>(`/registrations/${registration.id}/notify`, {});
      toast(r.message, r.delivered ? 'ok' : 'warn');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setTelling(false);
    }
  }

  async function addRelative() {
    if (!relPick || !relCode) return;
    setSavingRel(true);
    try {
      await api.post(`/people/${memberRowId}/relations`, { otherRowId: relPick.rowId, relation: Number(relCode) });
      toast(`${relPick.name} was added to the family. They see this person on their side too.`);
      setRelQ(''); setRelPick(null); setRelCode(''); setRelResults([]);
      q.reload();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setSavingRel(false);
    }
  }

  async function removeRelative(otherRowId: string, name: string) {
    setSavingRel(true);
    try {
      await api.del(`/people/${memberRowId}/relations/${otherRowId}`);
      toast(`${name} was taken off the family, on both sides.`);
      q.reload();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setSavingRel(false);
    }
  }

  /* Pastor and cell leader: written to the columns the Noah app reads, so the member's
     Messages and Me tab change within about 20 seconds. */
  async function assign(who: 'pastor' | 'leader', rowId: string) {
    setSavingCare(true);
    try {
      await api.patch(`/people/${memberRowId}/pastoral`, { [who]: rowId || null });
      toast(who === 'pastor' ? 'Pastor saved. The app shows it within a minute.' : 'Cell leader saved. The app shows it within a minute.');
      q.reload();
      onChanged?.();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setSavingCare(false);
    }
  }

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
        <div className="row">
          <div className="sect-title grow">Who they are</div>
          {q.data.edit && <Btn sm icon="edit" onClick={() => setEditing(true)}>Edit details</Btn>}
        </div>
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

      {editing && q.data.edit && (
        <EditPerson
          memberRowId={memberRowId}
          name={member.name}
          edit={q.data.edit}
          open
          onClose={() => setEditing(false)}
          onSaved={() => { q.reload(); onChanged?.(); }}
        />
      )}

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
            {registration.state !== 'pending' && registration.state !== 'draft' && can('members.edit') && (
              <div className="mt8">
                <Btn icon="bell" disabled={telling} onClick={tell}>{telling ? 'Telling them…' : 'Tell the member'}</Btn>
                <span className="xs muted" style={{ marginLeft: 8 }}>
                  Sends the push notification for this decision (an email if no phone can be reached). Each member is told once.
                </span>
              </div>
            )}
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
        {q.data.pastoralChoices && (
          <div className="mt8 stack" style={{ gap: 8 }}>
            {([
              ['pastor', 'Change pastor', pastoral.pastor, q.data.pastoralChoices.pastors, 'No one has the pastor role yet. Give it under App roles first.'],
              ['leader', 'Change cell leader', pastoral.cellLeader, q.data.pastoralChoices.leaders, 'No one is a cell leader yet. Give the role under App roles first.'],
            ] as const).map(([who, label, now, options, none]) => (
              <label key={who} className="fld">
                <span className="lbl">{label}</span>
                {options.length === 0 ? (
                  <span className="xs muted">{none}</span>
                ) : (
                  <select
                    className="inp"
                    disabled={savingCare}
                    value={now?.rowId ?? ''}
                    onChange={(e) => assign(who, e.target.value)}
                  >
                    <option value="">Not assigned</option>
                    {options.filter((o) => o.rowId !== memberRowId).map((o) => <option key={o.rowId} value={o.rowId}>{optionText(o as Leader)}</option>)}
                  </select>
                )}
              </label>
            ))}
            {q.data.pastoralChoices.here && (
              <span className="xs muted">
                {q.data.pastoralChoices.here.shared
                  ? `Cell leaders are listed nearest first, from ${q.data.pastoralChoices.here.where || 'this member’s current location'}.`
                  : 'This member has not shared their location in the app, so the leaders are not sorted by distance.'}
                {' '}Distances are shown to staff who can edit members only.
              </span>
            )}
            <span className="xs muted">The Noah app reads this: the pastor is listed first in the member's messages, and the cell leader opens their cell chat.</span>
          </div>
        )}
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
                {relationOptions && f.member && !f.kid && (
                  <Btn sm disabled={savingRel} onClick={() => removeRelative(f.rowId, f.name)}>Remove</Btn>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Relating another member to this one. One row carries both directions, so they see this person too. */}
        {relationOptions && family.recorded && (
          <div className="card pad mt8 stack" style={{ gap: 10 }} ref={relBox}>
            <b className="small">Add a relative</b>

            <label className="fld">
              <span className="lbl">1. Find the member</span>
              {relPick ? (
                <span className="row gap6">
                  <Chip tone="ok" icon="check">{relPick.name}</Chip>
                  <Btn sm onClick={() => { setRelPick(null); setRelCode(''); setRelQ(''); }}>Change</Btn>
                </span>
              ) : (
                <input className="inp" placeholder="Type a name, for example Mehak" value={relQ}
                  onChange={(e) => { setRelQ(e.target.value); setRelPick(null); }} />
              )}
            </label>

            {!relPick && relQ.trim().length === 1 && <span className="xs muted">Type at least two letters.</span>}
            {!relPick && relSearch === 'searching' && <span className="xs muted">Searching…</span>}
            {!relPick && relSearch === 'error' && <Note tone="bad" icon="alert">The search did not work: {relError}</Note>}
            {!relPick && relSearch === 'done' && relResults.length === 0 && (
              <Note tone="mute" icon="info">
                No member found called “{relQ.trim()}”. Only people who are on the member register can be added.
              </Note>
            )}
            {!relPick && relSearch === 'done' && relResults.length > 0 && (
              <ul className="list">
                {relResults.map((c) => {
                  const already = family.rows.some((f) => f.rowId === c.rowId);
                  return (
                    <li key={c.rowId} className={already ? undefined : 'click'}
                      onClick={already ? undefined : () => { setRelPick(c); setRelQ(c.name); setRelResults([]); }}>
                      <span className="grow">
                        <span className="t1">{c.name}</span>
                        <span className="t2">{already ? 'Already in this family' : (c.where || 'No address on record')}</span>
                      </span>
                      {!already && <Btn sm>Choose</Btn>}
                    </li>
                  );
                })}
              </ul>
            )}

            <label className="fld">
              <span className="lbl">2. {relPick ? `${relPick.name} is ${member.name}’s…` : 'What are they to this person?'}</span>
              <select className="inp" value={relCode} disabled={!relPick} onChange={(e) => setRelCode(e.target.value)}>
                <option value="">{relPick ? 'Pick a relation' : 'Choose the member first'}</option>
                {relationOptions.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </select>
              {relationOptions.find((o) => String(o.code) === relCode)?.extra && (
                <span className="xs muted">
                  Uncle, aunt, nephew and niece are kept by the console. Check the Noah app shows them before using them for real members.
                </span>
              )}
            </label>

            <div>
              <span className="lbl" style={{ display: 'block', marginBottom: 6 }}>3. Save</span>
              <Btn icon="plus" variant="pri" disabled={!relPick || !relCode || savingRel} onClick={addRelative}>
                {savingRel ? 'Saving…' : 'Add relation'}
              </Btn>
              <span className="xs muted" style={{ marginLeft: 8 }}>
                {!relPick ? 'Find the member first.' : !relCode ? 'Now pick the relation.' : 'The other person sees this one too, with the reverse relation, automatically.'}
              </span>
            </div>
          </div>
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
