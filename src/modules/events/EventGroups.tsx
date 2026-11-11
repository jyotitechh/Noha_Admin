/* Archiving a group takes it out of the choices when adding an event; it moves to the Archived view, where it can be
   restored or deleted for good. A group that events still use cannot be archived, and one that archived events
   still use cannot be deleted.

   Event groups: an event belongs to one. A group has an event language group ("Mumbai - English"), its pastors,
   and the teams that collect donations and scan passes. Stored in Catalyst's `eventGroup` and
   `eventLanguageGroups` tables (server/events.js). */

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { Confirm, Drawer, Modal, useToast } from '@/components/layers';
import { Btn, Empty, Failed, Field, Loading, Seg } from '@/components/ui';
import { FieldBox, MemberPicker, forgetChoices, useChoices } from './shared';

interface Group {
  id: string; name: string; description: string;
  languageGroupId: string; languageGroupName: string | null;
  donationTeam: string[]; scanningTeam: string[]; pastors: string[];
  events: number;
}

type GroupForm = Omit<Group, 'id' | 'languageGroupName' | 'events'>;
const blank = (): GroupForm => ({ name: '', description: '', languageGroupId: '', donationTeam: [], scanningTeam: [], pastors: [] });

export default function EventGroups() {
  const { can } = useAuth();
  const manage = can('events.manage');
  const { toast } = useToast();
  const [bump, setBump] = useState(0);
  const choices = useChoices(bump);

  const [show, setShow] = useState<'active' | 'archived'>('active');
  const [rows, setRows] = useState<Group[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [editing, setEditing] = useState<{ id?: string; v: GroupForm } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [findPastor, setFindPastor] = useState('');
  const [confirming, setConfirming] = useState<{ kind: 'archive' | 'delete'; group: Group } | null>(null);
  const [addingLang, setAddingLang] = useState(false);
  const [langName, setLangName] = useState('');
  const [langError, setLangError] = useState('');

  const load = (which: 'active' | 'archived' = show) => {
    setError(null);
    api.get<{ rows: Group[] }>(`/event-admin/groups${which === 'archived' ? '?archived=1' : ''}`).then((r) => setRows(r.rows)).catch((e) => setError(e));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function switchTo(which: 'active' | 'archived') {
    setShow(which); setRows(null); load(which);
  }

  const set = <K extends keyof GroupForm>(k: K, value: GroupForm[K]) => {
    setEditing((e) => (e ? { ...e, v: { ...e.v, [k]: value } } : e));
    setErrors((x) => { const { [k as string]: _gone, ...rest } = x; return rest; });
  };

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      if (editing.id) await api.put(`/event-admin/groups/${editing.id}`, editing.v);
      else await api.post('/event-admin/groups', editing.v);
      toast(`“${editing.v.name}” is saved.`, 'ok');
      setEditing(null); forgetChoices(); setBump((n) => n + 1); load();
    } catch (e) {
      const err = e as ApiError;
      if (err.errors) setErrors(err.errors);
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function confirmed() {
    if (!confirming) return;
    const { kind, group } = confirming;
    try {
      if (kind === 'archive') await api.del(`/event-admin/groups/${group.id}`);
      else await api.del(`/event-admin/groups/${group.id}/permanently`);
      toast(kind === 'archive' ? `“${group.name}” is archived.` : `“${group.name}” is deleted.`, 'ok');
      setConfirming(null); forgetChoices(); setBump((n) => n + 1); load();
    } catch (e) {
      toast((e as Error).message, 'bad');
      setConfirming(null);
    }
  }

  async function restore(g: Group) {
    try {
      await api.post(`/event-admin/groups/${g.id}/restore`);
      toast(`“${g.name}” is back in Event groups.`, 'ok');
      forgetChoices(); setBump((n) => n + 1); load();
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  }

  async function addLanguageGroup() {
    setLangError('');
    try {
      const made = await api.post<{ id: string; name: string }>('/event-admin/language-groups', { name: langName });
      toast(`“${made.name}” is added.`, 'ok');
      forgetChoices(); setBump((n) => n + 1);
      if (editing) set('languageGroupId', made.id);
      setAddingLang(false); setLangName('');
    } catch (e) {
      const err = e as ApiError;
      setLangError(err.errors?.name || err.message);
    }
  }

  const pastorsShown = useMemo(() => {
    const needle = findPastor.trim().toLowerCase();
    return (choices?.pastors ?? []).filter((p) => !needle || p.name.toLowerCase().includes(needle));
  }, [choices, findPastor]);

  return (
    <div className="stack">
      <div className="row wrap gap8">
        <Seg<'active' | 'archived'> value={show} onChange={switchTo} options={[{ id: 'active', label: 'Event groups' }, { id: 'archived', label: 'Archived' }]} />
        <span className="sp" style={{ flex: 1 }} />
        {manage && show === 'active' && <Btn icon="globe" onClick={() => setAddingLang(true)}>Add a language group</Btn>}
        {manage && show === 'active' && <Btn variant="ok" icon="plus" onClick={() => { setErrors({}); setEditing({ v: blank() }); }}>Add event group</Btn>}
      </div>
      {show === 'archived' && <p className="muted small mt0">Archived groups are not offered when adding an event. Restore one to bring it back, or delete it for good.</p>}

      {error ? <Failed error={error} onRetry={() => load()} /> : !rows ? <div className="card"><Loading what="event groups" /></div> : !rows.length ? (
        <div className="card">
          {show === 'archived'
            ? <Empty icon="archive" title="Nothing archived">Event groups you archive are kept here.</Empty>
            : <Empty icon="layers" title="No event groups yet">Add one, then choose it when you add an event.</Empty>}
        </div>
      ) : (
        <div className="card">
          <ul className="list">
            {rows.map((g) => (
              <li key={g.id} className={manage && show === 'active' ? 'click' : undefined}
                onClick={manage && show === 'active' ? () => { setErrors({}); setEditing({ id: g.id, v: { name: g.name, description: g.description, languageGroupId: g.languageGroupId, donationTeam: g.donationTeam, scanningTeam: g.scanningTeam, pastors: g.pastors } }); } : undefined}>
                <span className="grow">
                  <span className="t1">{g.name}</span>
                  <span className="t2">
                    {g.languageGroupName ?? 'No language group'} · {g.pastors.length} {g.pastors.length === 1 ? 'pastor' : 'pastors'} · {g.events} {g.events === 1 ? 'event' : 'events'}
                  </span>
                </span>
                {manage && show === 'active' && <Btn sm variant="ghost" icon="archive" aria-label={`Archive ${g.name}`} onClick={(e) => { e.stopPropagation(); setConfirming({ kind: 'archive', group: g }); }}>Archive</Btn>}
                {manage && show === 'archived' && (
                  <span className="row gap6">
                    <Btn sm icon="restore" aria-label={`Restore ${g.name}`} onClick={() => restore(g)}>Restore</Btn>
                    <Btn sm variant="danger" icon="trash" aria-label={`Delete ${g.name}`} onClick={() => setConfirming({ kind: 'delete', group: g })}>Delete</Btn>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        width="wide"
        title={editing?.id ? `Edit ${editing.v.name || 'event group'}` : 'Add event group'}
        footer={<><span className="sp" style={{ flex: 1 }} /><Btn onClick={() => setEditing(null)}>Cancel</Btn><Btn variant="ok" icon="check" disabled={busy} onClick={save}>{busy ? 'Saving…' : editing?.id ? 'Save changes' : 'Add'}</Btn></>}
      >
        {editing && choices && (
          <div className="stack">
            <Field label="Event group name *" error={errors.name}>
              <input className={'inp' + (errors.name ? ' err' : '')} value={editing.v.name} maxLength={200} autoFocus onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Event group description">
              <textarea className="ta" rows={2} value={editing.v.description} maxLength={2000} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <FieldBox label="Event language group *" error={errors.languageGroupId}
              hint={choices.languageGroups.length ? undefined : 'None yet. Add one with the button below.'}>
              <div className="row gap8">
                <select className={'sel grow' + (errors.languageGroupId ? ' err' : '')} value={editing.v.languageGroupId} onChange={(e) => set('languageGroupId', e.target.value)}>
                  <option value="">Select the event language group</option>
                  {choices.languageGroups.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <Btn type="button" icon="plus" onClick={() => setAddingLang(true)}>New</Btn>
              </div>
            </FieldBox>
            <FieldBox label="Donation collection team">
              <MemberPicker label="Donation collection team" ids={editing.v.donationTeam} onChange={(ids) => set('donationTeam', ids)} />
            </FieldBox>
            <FieldBox label="Scanning team">
              <MemberPicker label="Scanning team" ids={editing.v.scanningTeam} onChange={(ids) => set('scanningTeam', ids)} />
            </FieldBox>

            <div className="sect-title">Pastors</div>
            {choices.pastors.length ? (
              <>
                <input className="inp" value={findPastor} placeholder="Find a pastor" aria-label="Find a pastor" onChange={(e) => setFindPastor(e.target.value)} />
                <div className="card pad stack" style={{ gap: 8, maxHeight: 280, overflow: 'auto' }}>
                  {pastorsShown.map((p) => (
                    <label key={p.id} className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={editing.v.pastors.includes(p.id)}
                        onChange={(e) => set('pastors', e.target.checked ? [...editing.v.pastors, p.id] : editing.v.pastors.filter((x) => x !== p.id))} />
                      {p.name}
                    </label>
                  ))}
                  {!pastorsShown.length && <span className="muted small">No pastor matches.</span>}
                </div>
              </>
            ) : <p className="muted small mt0">No members are marked as pastors yet.</p>}
          </div>
        )}
      </Drawer>

      <Modal open={addingLang} onClose={() => { setAddingLang(false); setLangError(''); }} title="Add a language group"
        footer={<><span className="sp" style={{ flex: 1 }} /><Btn onClick={() => setAddingLang(false)}>Cancel</Btn><Btn variant="ok" icon="check" disabled={!langName.trim()} onClick={addLanguageGroup}>Add</Btn></>}>
        <Field label="Name" hint="A place and a language, such as Mumbai - English." error={langError}>
          <input className={'inp' + (langError ? ' err' : '')} value={langName} maxLength={120} autoFocus onChange={(e) => { setLangName(e.target.value); setLangError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && langName.trim()) addLanguageGroup(); }} />
        </Field>
        {!!choices?.languageGroups.length && (
          <p className="small muted">Already there: {choices.languageGroups.map((l) => l.name).join(', ')}.</p>
        )}
      </Modal>

      <Confirm
        open={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={confirmed}
        title={confirming?.kind === 'delete' ? 'Delete this event group for good?' : 'Archive this event group?'}
        confirmLabel={confirming?.kind === 'delete' ? 'Delete for good' : 'Archive'}
        danger
      >
        {confirming?.kind === 'delete'
          ? <p className="mt0"><b>{confirming.group.name}</b> will be removed completely. This cannot be undone.</p>
          : <p className="mt0"><b>{confirming?.group.name}</b> will no longer be offered when adding an event. You can find it in Archived, restore it, or delete it there.</p>}
      </Confirm>
    </div>
  );
}
