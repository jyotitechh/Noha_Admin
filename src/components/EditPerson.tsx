/* Correct a member's details.

   What is saved here is written to the same Catalyst columns the Noah app reads,
   so a misspelt name or a wrong pincode fixed here is fixed for the member too.

   The form is described by the server (GET /api/people/:id returns `edit`), so a
   field cannot exist here and be missing there. Contact details (email,
   addresses) are not in the person's reply at all; they are fetched by the same
   audited "reveal" that unmasks them on the page, and only then can they be
   edited. Only what was changed is sent. */

import { useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { Drawer, useToast } from '@/components/layers';
import { Btn, Field, Note } from '@/components/ui';

export interface EditSpec {
  fields: { key: string; label: string; group: string; kind: 'text' | 'email' | 'date' | 'gender'; max?: number; required: boolean; contact: boolean; locked: boolean }[];
  values: Record<string, string>;
}

export function EditPerson({ memberRowId, name, edit, open, onClose, onSaved }: {
  memberRowId: string;
  name: string;
  edit: EditSpec;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can } = useAuth();
  const { toast } = useToast();
  /* What the form started from, and what it holds now. */
  const [start, setStart] = useState<Record<string, string>>(edit.values);
  const [now, setNow] = useState<Record<string, string>>(edit.values);
  const [revealed, setRevealed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const canContact = can('members.pii');
  const shown = useMemo(
    () => edit.fields.filter((f) => !f.contact || (revealed && !f.locked)),
    [edit.fields, revealed],
  );
  const groups = useMemo(() => {
    const out: { name: string; fields: typeof shown }[] = [];
    for (const f of shown) {
      let g = out.find((x) => x.name === f.group);
      if (!g) { g = { name: f.group, fields: [] }; out.push(g); }
      g.fields.push(f);
    }
    return out;
  }, [shown]);

  const changes = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of shown) if ((now[f.key] ?? '') !== (start[f.key] ?? '')) out[f.key] = now[f.key] ?? '';
    return out;
  }, [shown, now, start]);
  const dirty = Object.keys(changes).length;

  async function reveal() {
    setBusy(true);
    try {
      const r = await api.get<{ values?: Record<string, string> }>(`/people/${memberRowId}/contact`);
      const values = r.values ?? {};
      setStart((s) => ({ ...s, ...values }));
      setNow((n) => ({ ...n, ...values }));
      setRevealed(true);
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      const r = await api.patch<{ changed: string[] }>(`/people/${memberRowId}`, { changes });
      toast(r.changed.length ? `Saved: ${r.changed.join(', ')}. The app shows it now.` : 'Nothing was different.');
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErrors(e.errors);
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const set = (key: string, v: string) => { setNow((n) => ({ ...n, [key]: v })); setErrors((e) => ({ ...e, [key]: '' })); };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Edit ${name}`}
      sub="Saved straight to Catalyst, where the Noah app reads it."
      width="wide"
      footer={
        <>
          <span className="sp" style={{ flex: 1 }} />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="pri" disabled={busy || !dirty} onClick={save}>
            {busy ? 'Saving…' : dirty ? `Save ${dirty} change${dirty > 1 ? 's' : ''}` : 'Save'}
          </Btn>
        </>
      }
    >
      <div className="stack">
        <Note tone="mute" icon="info">
          The mobile number is the member's login, and ID numbers are identity records, so neither can be changed here.
        </Note>

        {groups.map((g) => (
          <section key={g.name}>
            <div className="sect-title">{g.name}</div>
            <div className="stack gap8">
              {g.fields.map((f) => (
                <Field key={`${g.name}${f.key}`} label={f.label} error={errors[f.key]}>
                  {f.kind === 'gender' ? (
                    <select className="sel" value={now[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">Not given</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  ) : (
                    <input
                      className={'inp' + (errors[f.key] ? ' err' : '')}
                      type={f.kind === 'date' ? 'date' : f.kind === 'email' ? 'email' : 'text'}
                      maxLength={f.max}
                      value={now[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  )}
                </Field>
              ))}
            </div>
          </section>
        ))}

        {!revealed && edit.fields.some((f) => f.contact) && (
          canContact ? (
            <section>
              <div className="sect-title">Contact details</div>
              <p className="small muted mt0">Email and addresses are hidden. Showing them to edit is recorded in the audit log.</p>
              <Btn icon="lock" disabled={busy} onClick={reveal}>Show contact details to edit</Btn>
            </section>
          ) : (
            <Note tone="mute" icon="lock">Changing contact details needs the permission to see them.</Note>
          )
        )}
      </div>
    </Drawer>
  );
}
