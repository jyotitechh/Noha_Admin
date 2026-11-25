/* Membership > Duplicate Emails: addresses that more than one member uses (server/duplicate-emails.js).

   Each address shows everyone who uses it, oldest first, with when their address came (their registration, or when they were
   added), so the office sees which came first. "Duplicate" is exactly the same address; "Potential duplicate" is written
   differently but very likely the same mailbox (Gmail ignores dots and anything after +; gmial.com is read as gmail.com). A
   child the parents made a member has the parent's address on purpose, and is labelled so.

   The office calls them (the number is there), corrects the email on the right member here, or marks the address checked when
   the sharing is fine. A checked address comes back on its own when someone new joins with it. */

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/auth';
import { useQueues } from '@/state/queues';
import { Drawer, useToast } from '@/components/layers';
import { PersonDetail } from '@/components/PersonDetail';
import { Btn, Chip, Empty, Failed, Kpi, Kpis, Loading, Note } from '@/components/ui';
import { fd, fdt } from '@/lib/format';

interface Entry {
  memberRowId: string; name: string; mobile: string; email: string; field: 'Email' | 'Second email';
  came: Date | string | null; status: string; archived: boolean; first: boolean; childOf: string | null;
}
export interface SharedEmail {
  key: string; kind: 'duplicate' | 'potential'; email: string; people: number; familyShare: boolean;
  checked: boolean; check: { by: string; at: string | null; note: string } | null;
  latest: Date | string | null; entries: Entry[];
}

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'mute'> = {
  Active: 'ok', Pending: 'warn', 'Video returned': 'warn', Rejected: 'bad', Archived: 'mute', 'Not approved': 'mute',
};

export default function DuplicateEmails() {
  const { can } = useAuth();
  const { toast } = useToast();
  const queues = useQueues();
  const [show, setShow] = useState<'open' | 'checked' | 'all'>('open');
  const [kind, setKind] = useState<'' | 'duplicate' | 'potential' | 'family'>('');
  const [search, setSearch] = useState('');
  const [fixing, setFixing] = useState<{ key: string; memberRowId: string; field: Entry['field']; value: string } | null>(null);
  const [checking, setChecking] = useState<{ key: string; note: string } | null>(null);
  const [person, setPerson] = useState<{ rowId: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery(() => api.get<{ rows: SharedEmail[]; pii: boolean }>('/duplicate-emails'), []);
  const all = q.data?.rows ?? [];
  const pii = !!q.data?.pii && can('members.pii');
  const open = all.filter((g) => !g.checked);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all
      .filter((g) => (show === 'all' ? true : show === 'checked' ? g.checked : !g.checked))
      .filter((g) => !kind || (kind === 'family' ? g.familyShare : g.kind === kind))
      .filter((g) => !s || g.email.toLowerCase().includes(s) || g.entries.some((e) => e.name.toLowerCase().includes(s) || e.email.toLowerCase().includes(s) || e.mobile.includes(s)));
  }, [all, show, kind, search]);

  const refresh = () => { q.reload(); queues.refresh(); };

  async function saveEmail() {
    if (!fixing) return;
    setBusy(true);
    try {
      const key = fixing.field === 'Email' ? 'email' : 'email2';
      await api.patch(`/people/${fixing.memberRowId}`, { changes: { [key]: fixing.value.trim() } });
      setFixing(null);
      refresh();
      toast('Saved. The email is corrected on that member.', 'ok');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function markChecked() {
    if (!checking) return;
    setBusy(true);
    try {
      await api.post('/duplicate-emails/check', { key: checking.key, note: checking.note });
      setChecking(null);
      refresh();
      toast('Marked as checked. It comes back if someone new joins with this email.', 'ok');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function reopen(key: string) {
    setBusy(true);
    try {
      await api.post('/duplicate-emails/reopen', { key });
      refresh();
      toast('Open again.', 'ok');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;
  if (!q.data) return <div className="card"><Loading what="the shared emails" /></div>;

  return (
    <div className="stack">
      <Kpis>
        <Kpi label="To check" value={open.length} icon="merge" tone={open.length ? 'warn' : undefined} detail="emails more than one member uses" />
        <Kpi label="Duplicates" value={open.filter((g) => g.kind === 'duplicate').length} icon="copy" detail="exactly the same email" />
        <Kpi label="Potential duplicates" value={open.filter((g) => g.kind === 'potential').length} icon="alert" detail="written differently, likely the same" />
        <Kpi label="With a child" value={open.filter((g) => g.familyShare).length} icon="users" detail="a child given the parent's email" />
      </Kpis>

      {!pii && <Note tone="mute" icon="lock">Emails and mobile numbers are partly hidden for your role, and only staff who may see contact details can correct them.</Note>}

      <div className="card">
        <div className="row wrap gap8" style={{ padding: '12px 16px', alignItems: 'center' }}>
          <select className="sel" style={{ width: 'auto' }} value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Which emails">
            <option value="open">To check ({open.length})</option>
            <option value="checked">Checked</option>
            <option value="all">All</option>
          </select>
          <select className="sel" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Kind">
            <option value="">Every kind</option>
            <option value="duplicate">Duplicate</option>
            <option value="potential">Potential duplicate</option>
            <option value="family">With a child</option>
          </select>
          <input className="inp" style={{ maxWidth: 280 }} placeholder="An email, a name or a number" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
          <span className="sp" style={{ flex: 1 }} />
          <span className="small muted">Newest first</span>
        </div>

        {rows.length === 0 ? (
          <Empty icon="check" title={show === 'open' ? 'Nothing to check' : 'None here'}>
            {show === 'open' ? 'No email is used by more than one member, or every one has been checked.' : search ? 'Nothing matches the search.' : 'No emails with this status.'}
          </Empty>
        ) : (
          <ul className="list">
            {rows.map((g) => (
              <li key={g.key} style={{ display: 'block', padding: '14px 16px' }}>
                <div className="row wrap gap6" style={{ alignItems: 'center' }}>
                  {g.kind === 'duplicate'
                    ? <Chip tone="bad" icon="copy">Duplicate</Chip>
                    : <Chip tone="warn" icon="alert">Potential duplicate</Chip>}
                  <b className="mono" style={{ fontSize: 15 }}>{g.email}</b>
                  <Chip tone="plain" icon="users">{g.people} people</Chip>
                  {g.familyShare && <Chip tone="info" icon="user">With a child</Chip>}
                  {g.checked && g.check && <Chip tone="ok" icon="check">Checked{g.check.by ? ` by ${g.check.by}` : ''}{g.check.at ? ` on ${fd(g.check.at)}` : ''}</Chip>}
                  <span className="sp" style={{ flex: 1 }} />
                  {g.checked
                    ? <Btn sm onClick={() => reopen(g.key)} disabled={busy}>Open again</Btn>
                    : <Btn sm icon="check" onClick={() => setChecking({ key: g.key, note: '' })} disabled={busy}>Mark as checked</Btn>}
                </div>
                {g.kind === 'potential' && <div className="small muted mt4">Written differently, but probably the same mailbox.</div>}
                {g.checked && g.check?.note && <div className="small muted mt4">“{g.check.note}”</div>}

                {checking?.key === g.key && (
                  <div className="row wrap gap8 mt8" style={{ alignItems: 'center' }}>
                    <input className="inp" style={{ flex: 1, minWidth: 220 }} autoFocus placeholder="Note (optional), e.g. Called both: husband and wife share it" value={checking.note}
                      onChange={(e) => setChecking({ key: g.key, note: e.target.value })} />
                    <Btn sm onClick={() => setChecking(null)} disabled={busy}>Cancel</Btn>
                    <Btn sm variant="ok" icon="check" onClick={markChecked} disabled={busy}>Mark as checked</Btn>
                  </div>
                )}

                <ul className="list mt8" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
                  {g.entries.map((e) => {
                    const editing = fixing?.key === g.key && fixing.memberRowId === e.memberRowId && fixing.field === e.field;
                    return (
                      <li key={e.memberRowId + e.field} style={{ alignItems: 'flex-start' }}>
                        <span className="grow" style={{ minWidth: 0 }}>
                          <span className="row wrap gap6" style={{ alignItems: 'center' }}>
                            <button className="btn sm" style={{ fontWeight: 600 }} onClick={() => setPerson({ rowId: e.memberRowId, name: e.name })}>{e.name}</button>
                            <Chip tone={STATUS_TONE[e.status] ?? 'mute'}>{e.status}</Chip>
                            {e.first ? <Chip tone="plain">Came first</Chip> : <Chip tone="plain">Came later</Chip>}
                            {e.childOf && <Chip tone="info" icon="user">Child of {e.childOf}</Chip>}
                          </span>
                          <span className="t2" style={{ display: 'block', marginTop: 4 }}>
                            {e.mobile
                              ? (pii ? <a className="mono" href={`tel:${e.mobile.replace(/[^\d+]/g, '')}`}>{e.mobile}</a> : <span className="mono">{e.mobile}</span>)
                              : 'No mobile number'}
                            {' · '}<span className="mono">{e.email}</span>{e.field === 'Second email' && <span className="muted"> (second email)</span>}
                            {' · '}came {e.came ? fdt(e.came) : 'on an unknown date'}
                          </span>
                          {editing && (
                            <span className="row wrap gap8 mt8" style={{ alignItems: 'center' }}>
                              <input className="inp mono" style={{ flex: 1, minWidth: 240 }} autoFocus type="email" value={fixing!.value}
                                onChange={(ev) => setFixing({ ...fixing!, value: ev.target.value })} aria-label={`The correct email for ${e.name}`} />
                              <Btn sm onClick={() => setFixing(null)} disabled={busy}>Cancel</Btn>
                              <Btn sm variant="ok" icon="check" onClick={saveEmail} disabled={busy || !fixing!.value.trim()}>Save email</Btn>
                            </span>
                          )}
                        </span>
                        {pii && !editing && (
                          <Btn sm icon="edit" onClick={() => setFixing({ key: g.key, memberRowId: e.memberRowId, field: e.field, value: e.email })} disabled={busy}>Correct email</Btn>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Drawer open={!!person} onClose={() => setPerson(null)} width="wide" title={person?.name ?? ''}>
        {person && <PersonDetail memberRowId={person.rowId} onChanged={refresh} onGone={() => setPerson(null)} />}
      </Drawer>
    </div>
  );
}
