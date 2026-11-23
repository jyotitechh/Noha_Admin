/* Family requests from the Noah app (Me > Family).

   A member asks the office to add a spouse, child, parent, brother, sister or anyone else to their family. The office
   checks and decides here. The Noah API does the rest and tells both people, so nothing is written to the tables from
   this screen.

   Three kinds of request, and the screen says which it is because approving them does different things:
     - a grown-up has their own Noah account, found by the mobile number the member typed. If they have not joined yet,
       the request is still approved and the two are linked the moment they join. If the typed number is not the one they
       joined with, the office can pick the right member by hand.
     - a child under 18 added by an older version of the app ('child'). Approving adds the child to the family.
     - "Make member" ('member', FOR-CONSOLE-CHILDREN.md): at 15 the parents give the child's own mobile number and the
       Aadhaar. Approving makes the child a member with that number; the child then signs in and sends the consent and
       video, which come to App registrations. The office checks the Aadhaar picture against the number, name and age. */

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useQueues } from '@/state/queues';
import { useToast, Drawer } from '@/components/layers';
import { Table, type Column } from '@/components/Table';
import { Btn, Chip, Field, Kpi, Kpis, Note, Age, Failed, Loading, Empty, Who } from '@/components/ui';
import { fdt, since } from '@/lib/format';
import { MemberPhoto } from '@/components/MemberPhoto';
import { AuthImage } from '@/components/AuthImage';

type State = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

interface FamilyRequest {
  id: string; state: State;
  relation: string; relationLabel: string; kid: boolean;
  kind: 'relative' | 'child' | 'member'; kidId: string | null;
  /* "Make member": the child's own number and the Aadhaar (masked for a role that may not see contact details). */
  childMobile: string; aadhaarNo: string; aadhaarFileId: string | null; memberId: string | null; masked?: boolean;
  name: string; gender: string | null; dob: string | null; age: number | null;
  mobile: string; note: string;
  requesterId: string; requesterName: string; requesterMobile: string;
  existingMemberId: string | null; existingMemberName: string | null;
  at: Date | null; decidedBy: string; remark: string;
}

interface Candidate { rowId: string; name: string; where: string }

const TONE: Record<State, 'warn' | 'ok' | 'bad' | 'mute'> = { Pending: 'warn', Approved: 'ok', Rejected: 'bad', Cancelled: 'mute' };

const MEMBER_REASONS = [
  'The Aadhaar picture is not clear. Please send it again.',
  "The Aadhaar does not match the child's name or date of birth. Please check it and send it again.",
  "This number does not look like the child's own. Please give the child's own mobile number.",
];

const REASONS = [
  'We could not find a member with that number. Please check it and ask again.',
  'This is not the right person to add. Please check the name and send it again.',
  'Please ask the family member to join the app first, then send it again.',
];

/** A "Make member" whose number already belongs to someone: the Noah API refuses it (phone_in_use), so it can only be rejected. */
const numberTaken = (r: FamilyRequest) => r.kind === 'member' && !!r.existingMemberName;

/** What approving will do, in words the office can check before pressing the button. */
function effect(r: FamilyRequest): string {
  if (r.kind === 'member') {
    return `${r.name || 'The child'} becomes a member with the number ${r.childMobile || 'given'}. Both parents are told. The child then signs in with that number and sends their consent and video, which come to App registrations for you to approve.`;
  }
  if (r.kid) {
    return `Adds ${r.name || 'the child'} as a child record and links them to ${r.requesterName || 'the member'}, and to their spouse if one is already linked.`;
  }
  if (r.existingMemberName) {
    return `Links ${r.requesterName || 'the member'} and ${r.existingMemberName}: each sees the other in Family, and both get a notification.`;
  }
  return `${r.name || 'They'} have not joined the app yet. This is still approved, and the two are linked automatically the moment they join.`;
}

export default function FamilyRequests() {
  const [state, setState] = useState<State>('Pending');
  const [kindShown, setKindShown] = useState<'' | 'member' | 'other'>('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<FamilyRequest | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);

  /* Linking a different member than the number matched. */
  const [relQ, setRelQ] = useState('');
  const [relPick, setRelPick] = useState<Candidate | null>(null);
  const [relResults, setRelResults] = useState<Candidate[]>([]);
  const [picking, setPicking] = useState(false);

  const { toast } = useToast();
  const queues = useQueues();

  const q = useQuery(
    () => api.get<{ rows: FamilyRequest[]; needsAdminKey?: boolean }>(`/family-requests?state=${state}`),
    [state],
  );
  const waiting = useQuery(() => api.get<{ rows: FamilyRequest[] }>('/family-requests?state=Pending'), []);

  const tally = useMemo(() => {
    const rows = waiting.data?.rows ?? [];
    return {
      pending: rows.length,
      members: rows.filter((r) => r.kind === 'member').length,
      kids: rows.filter((r) => r.kid && r.kind !== 'member').length,
      adults: rows.filter((r) => !r.kid).length,
      oldest: rows.map((r) => r.at).filter(Boolean).sort((a, b) => +a! - +b!)[0] ?? null,
    };
  }, [waiting.data]);

  const rows = useMemo(() => {
    const all = (q.data?.rows ?? []).filter((r) => !kindShown || (kindShown === 'member') === (r.kind === 'member'));
    const s = search.trim().toLowerCase();
    return s
      ? all.filter((r) => [r.name, r.requesterName, r.relationLabel, r.existingMemberName ?? ''].some((v) => v.toLowerCase().includes(s)))
      : all;
  }, [q.data, search, kindShown]);

  const reset = () => {
    setOpen(null); setRejecting(false); setRemark('');
    setPicking(false); setRelQ(''); setRelPick(null); setRelResults([]);
  };

  /* Matches by name only, and only once two letters are typed. */
  useEffect(() => {
    if (!open || !picking || relPick || relQ.trim().length < 2) { setRelResults([]); return; }
    const t = setTimeout(() => {
      api.get<{ rows: Candidate[] }>(`/people/${open.requesterId}/relation-candidates?q=${encodeURIComponent(relQ.trim())}`)
        .then((r) => setRelResults(r.rows)).catch(() => setRelResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [relQ, relPick, picking, open]);

  async function decide(r: FamilyRequest, decision: 'Approved' | 'Rejected') {
    setBusy(true);
    try {
      await api.post(`/family-requests/${r.id}/decide`, {
        decision,
        remark: decision === 'Rejected' ? remark.trim() : undefined,
        memberId: decision === 'Approved' && relPick ? relPick.rowId : undefined,
      });
      reset();
      q.reload(); waiting.reload(); queues.refresh();
      toast(
        decision === 'Approved'
          ? r.kind === 'member' ? `Approved. ${r.name} is now a member and can sign in with their own number to send the consent and video.`
            : r.kid ? `Approved. ${r.name} is added to ${r.requesterName}'s family.` : 'Approved. Both accounts now show each other.'
          : r.kind === 'member' ? 'Rejected. Both parents see your reason and can send it again.' : 'Rejected. The member sees your reason.',
        decision === 'Approved' ? 'ok' : 'warn',
      );
    } catch (e) {
      toast((e as Error).message, 'bad');
      /* Someone else may have decided it: show the list as it is now. */
      q.reload(); waiting.reload();
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<FamilyRequest>[] = [
    {
      key: 'name', label: 'Wants to add',
      cell: (r) => (
        <>
          <b>{r.name || 'No name given'}</b>
          <span className="sub">{r.relationLabel}{r.kid && r.age != null ? ` · ${r.age} yr` : ''}</span>
        </>
      ),
      sortBy: (r) => r.name,
    },
    {
      key: 'requester', label: 'Asked by',
      cell: (r) => <Who name={r.requesterName || 'A member'} sub={<span className="mono">{r.requesterMobile}</span>} size="sm" photoId={r.requesterId} />,
      sortBy: (r) => r.requesterName,
    },
    {
      key: 'kind', label: 'Kind',
      cell: (r) => r.kind === 'member'
        ? <Chip tone="brand" icon="user-plus">Child to member</Chip>
        : r.kid
        ? <Chip tone="info" icon="user">Child under 18</Chip>
        : r.existingMemberName
          ? <Chip tone="ok" icon="check">Member: {r.existingMemberName}</Chip>
          : <Chip tone="mute" icon="clock">Not joined yet</Chip>,
    },
    {
      key: 'at', label: 'Waiting', num: true,
      cell: (r) => (r.state === 'Pending' ? <Age at={r.at} warn={48} bad={96} /> : <span className="muted">{since(r.at)}</span>),
      sortBy: (r) => r.at ?? 0,
    },
    { key: 'state', label: 'Status', cell: (r) => <Chip tone={TONE[r.state]}>{r.state}</Chip> },
  ];

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;

  if (q.data?.needsAdminKey) {
    return (
      <Note tone="warn" icon="alert">Family requests cannot be shown right now. Ask the administrator who looks after the console.</Note>
    );
  }

  return (
    <div className="stack">
      <Kpis>
        <Kpi label="Waiting" value={tally.pending} icon="users" tone={tally.pending > 4 ? 'warn' : undefined}
          detail={tally.oldest ? <>oldest <Age at={tally.oldest} warn={48} bad={96} /></> : 'nothing waiting'} />
        <Kpi label="Child to member" value={tally.members} icon="user-plus" detail="aged 15 or more, their own number" />
        <Kpi label="Grown-ups" value={tally.adults} icon="user" detail="linked to their own account" />
        <Kpi label="Children" value={tally.kids} icon="user" detail="under 18, added to a family" />
      </Kpis>

      {q.loading && !q.data ? (
        <div className="card"><Loading what="family requests" /></div>
      ) : (
        <Table
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="A name, a relation or who asked"
          onRowClick={setOpen}
          pageSize={20}
          toolbar={
            <>
              <select className="sel" value={state} onChange={(e) => setState(e.target.value as State)} aria-label="Filter by status">
                <option value="Pending">Waiting ({tally.pending})</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="Cancelled">Withdrawn by the member</option>
              </select>
              <select className="sel" value={kindShown} onChange={(e) => setKindShown(e.target.value as typeof kindShown)} aria-label="Filter by kind">
                <option value="">Every kind</option>
                <option value="member">Child to member ({tally.members})</option>
                <option value="other">Relatives and children</option>
              </select>
              <span className="sp" style={{ flex: 1 }} />
              <span className="small muted">Oldest first</span>
            </>
          }
          empty={<Empty icon="check" title={state === 'Pending' ? 'Nothing waiting' : 'None here'}>
            {state === 'Pending' ? 'Every family request from the app has been decided.' : 'No requests with this status.'}
          </Empty>}
          footNote="From Me > Family in the Noah app"
        />
      )}

      <Drawer
        open={!!open}
        onClose={reset}
        title="Family request"
        sub={open ? <><span className="mono">{open.id}</span> · {fdt(open.at)}</> : ''}
        footer={
          open && open.state === 'Pending' ? (
            rejecting ? (
              <>
                <span className="sp" style={{ flex: 1 }} />
                <Btn onClick={() => { setRejecting(false); setRemark(''); }}>Cancel</Btn>
                <Btn variant="danger" disabled={!remark.trim() || busy} onClick={() => decide(open, 'Rejected')}>
                  Reject and tell them
                </Btn>
              </>
            ) : (
              <>
                <span className="sp" style={{ flex: 1 }} />
                <Btn variant="danger" icon="x" onClick={() => setRejecting(true)} disabled={busy}>Reject</Btn>
                <Btn variant="ok" icon="check" onClick={() => decide(open, 'Approved')} disabled={busy || numberTaken(open)}>
                  {relPick ? `Approve and link ${relPick.name}` : 'Approve'}
                </Btn>
              </>
            )
          ) : open ? (
            <span className="muted small">{open.state}{open.decidedBy && <> by {open.decidedBy}</>}.{open.remark && <> “{open.remark}”</>}</span>
          ) : null
        }
      >
        {open && (
          <>
            <div className="row wrap gap6 mb12">
              <Chip icon="users">{open.relationLabel}</Chip>
              <Chip tone={TONE[open.state]}>{open.state}</Chip>
              {open.kind === 'member' ? <Chip tone="brand" icon="user-plus">Child to member</Chip>
                : open.kid ? <Chip tone="info" icon="user">Child under 18</Chip> : <Chip tone="plain" icon="user">Grown-up</Chip>}
            </div>

            <div className="sect-title">{open.kind === 'member' ? 'The child to make a member' : 'Who they want to add'}</div>
            <div className="card pad">
              <b style={{ fontSize: 16 }}>{open.name || 'No name given'}</b>
              <div className="muted small mt4">
                {open.relationLabel}
                {open.gender && <> · {open.gender}</>}
                {open.dob && <> · born {open.dob}{open.age != null && <> ({open.age} yr)</>}</>}
                {open.mobile && open.kind !== 'member' && <> · <span className="mono">{open.mobile}</span></>}
              </div>
              {open.note && <p style={{ margin: '10px 0 0' }}>“{open.note}”</p>}
            </div>

            {open.kind === 'member' && (
              <div className="mt16">
                <div className="sect-title">Their own number and Aadhaar</div>
                <div className="card pad stack" style={{ gap: 10 }}>
                  <div><span className="muted small">Mobile number</span><br /><b className="mono">{open.childMobile || 'Not given'}</b></div>
                  {open.existingMemberName && (
                    <Note tone="bad" icon="alert">This number already belongs to {open.existingMemberName}, so it cannot be approved. Reject it and ask the parents for the child's own number.</Note>
                  )}
                  <div><span className="muted small">Aadhaar number</span><br /><b className="mono">{open.aadhaarNo || 'Not given'}</b></div>
                  {open.aadhaarFileId
                    ? <AuthImage path={`/family-requests/${open.id}/aadhaar`} alt="Aadhaar" width={320} open />
                    : <span className="muted small">No Aadhaar picture.</span>}
                  {open.masked && <span className="xs muted">The number and Aadhaar are partly hidden for your role.</span>}
                </div>
                {open.state === 'Pending' && (
                  <p className="small muted mt8 mb0">Check that the Aadhaar picture matches its number and the child's name and date of birth, and that the mobile number is the child's own.</p>
                )}
              </div>
            )}

            <div className="mt16">
              <div className="sect-title">Asked by</div>
              <Who name={open.requesterName || 'A member'} sub={<span className="mono">{open.requesterMobile}</span>} photoId={open.requesterId} />
            </div>

            {!open.kid && open.kind !== 'member' && (
              <div className="mt16">
                <div className="sect-title">Their account</div>
                {open.existingMemberName ? (
                  <>
                    <Who name={open.existingMemberName} sub="Existing member" photoId={open.existingMemberId} />
                  </>
                ) : (
                  <Note tone="mute" icon="clock">Not joined yet. They are linked when they join.</Note>
                )}

                {open.state === 'Pending' && !rejecting && (
                  <div className="mt12">
                    {relPick ? (
                      <Note tone="brand" icon="link">
                        Will be linked to <b>{relPick.name}</b> ({relPick.where}) instead.{' '}
                        <button className="btn sm" onClick={() => { setRelPick(null); setRelQ(''); }}>Undo</button>
                      </Note>
                    ) : picking ? (
                      <Field label="Link a different member">
                        <input className="inp" autoFocus placeholder="Type at least two letters of their name" value={relQ}
                          onChange={(e) => setRelQ(e.target.value)} />
                        {relResults.length > 0 && (
                          <div className="card mt8">
                            {relResults.map((c) => (
                              <button key={c.rowId} className="btn sm row gap8" style={{ display: 'flex', width: '100%', textAlign: 'left', alignItems: 'center' }}
                                onClick={() => { setRelPick(c); setRelResults([]); }}>
                                <MemberPhoto id={c.rowId} name={c.name} size="sm" />
                                <span>{c.name} <span className="muted">· {c.where}</span></span>
                              </button>
                            ))}
                          </div>
                        )}
                      </Field>
                    ) : (
                      <Btn sm icon="search" onClick={() => setPicking(true)}>The number is not theirs: link a different member</Btn>
                    )}
                  </div>
                )}
              </div>
            )}

            {open.state === 'Pending' && !rejecting && !numberTaken(open) && (
              <div className="mt16">
                <Note tone="info" icon="info"><b>If you approve:</b> {effect(open)}</Note>
              </div>
            )}

            {rejecting && (
              <div className="mt20">
                <div>
                  <Field label="Reason" hint={`${open.kind === 'member' ? 'Both parents see this.' : 'The member sees this.'} ${remark.length}/500`}>
                    <textarea className="ta" rows={3} value={remark} autoFocus maxLength={500} placeholder={(open.kind === 'member' ? MEMBER_REASONS : REASONS)[0]}
                      onChange={(e) => setRemark(e.target.value)} />
                  </Field>
                </div>
                <div className="row wrap gap6 mt12">
                  {(open.kind === 'member' ? MEMBER_REASONS : REASONS).map((t) => (
                    <button key={t} className="btn sm" onClick={() => setRemark(t)}>{t.slice(0, 34)}…</button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
