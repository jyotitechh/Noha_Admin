/* Member registrations arriving from the Noah app.

   This screen did not exist in the HTML prototype. The Flutter app fakes the
   decision with its own "Simulate: admin approves" and "Simulate: admin
   returns the video" buttons; this is the real thing, and once the app points
   at this API those buttons come out (see docs/BACKEND_HANDOFF.md § 3).

   The office sees the six steps the member filled in, in the order the app
   asked for them, with the checks it must satisfy itself about beside them.
   Approving creates the member record, which is what unlocks the app. */

import { useMemo, useState } from 'react';
import { api, collection } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useQueues } from '@/state/queues';
import { useToast, Drawer, Confirm } from '@/components/layers';
import { Table, type Column } from '@/components/Table';
import { Btn, Chip, Field, Icon, Kpi, Kpis, Note, Who, Age, Failed, Loading, Empty, Kv } from '@/components/ui';
import { fd, fdt, REG_STATE, since } from '@/lib/format';
import type { Registration } from '@/lib/types';
import { Upload } from '@/components/Upload';

const LANG = { en: 'English', hi: 'हिन्दी Hindi', mr: 'मराठी Marathi' } as const;

/* The six steps, in the app's order, as the member worked through them. */
function Steps({ r }: { r: Registration }) {
  return (
    <div>
      <div className="step">
        <span className="n">1</span>
        <div className="body">
          <h4>Details</h4>
          <Kv rows={[
            ['Name', <b key="n">{r.salutation} {r.fullName}</b>],
            ['Mobile', <span key="m" className="mono">{r.mobile}</span>],
            ['Email', r.email],
            ['Gender', r.gender],
            /* A member the office added may have no date of birth. +null is 0,
               which would read as a 56-year-old. */
            ['Date of birth', r.dob
              ? <>{fd(r.dob)} <span className="muted">· {Math.floor((Date.now() - +r.dob) / 31557600000)} years</span></>
              : <span className="muted">Not given</span>],
            ['Marital status', r.marital],
            ['How they heard', r.reference || <span className="muted">Not given (optional)</span>],
          ]} />
        </div>
      </div>

      <div className="step">
        <span className="n">2</span>
        <div className="body">
          <h4>Address</h4>
          <Kv rows={[
            ['Address', <>{r.line1}{r.line2 ? <><br />{r.line2}</> : null}</>],
            ['City', r.city],
            ['State or province', r.region || <span className="muted">Not given</span>],
            ['Country', r.country],
            ['Postal code', <span className="mono">{r.pin}</span>],
          ]} />
        </div>
      </div>

      <div className="step">
        <span className="n">3</span>
        <div className="body">
          <h4>ID proof</h4>
          <Kv rows={[
            ['Type', r.idType],
            ['Number', <span key="num" className="mono">{r.idNumber}</span>],
          ]} />
          <div className="mt12">
            <Upload registrationId={r.id} kind="id" filename={r.idFile} sizeKb={Math.round(r.idSizeKb)} />
          </div>
        </div>
      </div>

      <div className="step">
        <span className="n">4</span>
        <div className="body">
          <h4>Photograph</h4>
          <Upload registrationId={r.id} kind="photo" filename={r.photoFile} sizeKb={Math.round(r.photoSizeKb)} />
          <p className="small muted mt8 mb0">Check it against the face on the ID document.</p>
        </div>
      </div>

      <div className="step">
        <span className="n">5</span>
        <div className="body">
          <h4>Declaration and signature</h4>
          <Kv rows={[
            ['Accepted', r.agreed
              ? <Chip tone="ok" icon="check">Tick box accepted</Chip>
              : <Chip tone="bad" icon="alert">Not accepted</Chip>],
            ['Read in', LANG[r.declarationLang as keyof typeof LANG] ?? r.declarationLang],
            ['Version', <span key="v" className="mono">{r.declarationVersion}</span>],
            ['Signed', fdt(r.signedOn)],
            ['Typed signature', <b key="s" style={{ fontFamily: 'cursive', fontSize: 17 }}>{r.signature}</b>],
          ]} />
          <Note tone="mute" icon="check">
            The signature must match the full name given in step 1, and the
            tick box must be accepted. The server checks both on submission,
            so a registration that reaches this screen has passed them.
          </Note>
        </div>
      </div>

      <div className="step">
        <span className="n">6</span>
        <div className="body">
          <h4>
            Video KYC
            {r.videoAttempt > 1 && <Chip tone="warn">Attempt {r.videoAttempt}</Chip>}
          </h4>
          <Upload registrationId={r.id} kind="video" filename={r.videoFile} seconds={r.videoSecs} />
          <p className="small muted mt12 mb0">What the member was asked to read:</p>
          <div className="script mt8">“{r.script}”</div>
        </div>
      </div>
    </div>
  );
}

/* The office's own checks. Three can be answered only by looking at the
   uploads; three the server already knows. */
function Checks({ r, onToggle }: { r: Registration; onToggle: (k: string, v: boolean) => void }) {
  const manual: [string, string, boolean | null][] = [
    ['idReadable', 'The ID document is readable', r.checks.idReadable],
    ['photoMatchesId', 'The photograph matches the ID', r.checks.photoMatchesId],
    ['videoAudible', 'The video is clear and audible', r.checks.videoAudible],
  ];
  const automatic: [string, boolean][] = [
    ['The signature matches the name', r.checks.nameMatchesSignature],
    ['Aged 18 or over', r.checks.ageOver18],
    ['No other member uses this number', !r.checks.duplicateMobile],
  ];

  return (
    <>
      <div className="sect-title">You must check</div>
      <ul className="checks">
        {manual.map(([key, label, value]) => (
          <li key={key} className={value === true ? 'ok' : value === false ? 'bad' : 'unknown'}>
            <Icon name={value === true ? 'check' : value === false ? 'x' : 'minus'} />
            <span className="grow">{label}</span>
            <span className="acts-inline">
              <button
                className={'btn sm' + (value === true ? ' ok' : '')}
                aria-pressed={value === true}
                onClick={() => onToggle(key, true)}
              >Yes</button>
              <button
                className={'btn sm' + (value === false ? ' danger' : '')}
                aria-pressed={value === false}
                onClick={() => onToggle(key, false)}
              >No</button>
            </span>
          </li>
        ))}
      </ul>

      <div className="sect-title">Already checked</div>
      <ul className="checks">
        {automatic.map(([label, ok]) => (
          <li key={label} className={ok ? 'ok' : 'bad'}>
            <Icon name={ok ? 'check' : 'alert'} />
            <span className="grow">{label}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Registrations() {
  const [state, setState] = useState<'pending' | 'approved' | 'videoReturned' | 'rejected' | ''>('pending');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Registration | null>(null);
  const [returning, setReturning] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [remark, setRemark] = useState('');
  const [loc, setLoc] = useState('');
  const [busy, setBusy] = useState(false);

  const { toast } = useToast();
  const queues = useQueues();

  const q = useQuery(
    () => collection<Registration>('REGISTRATIONS', { state: state || undefined, q: search || undefined, limit: 300, sort: 'at', dir: 'asc' }),
    [state, search],
  );
  const counts = useQuery(() => collection<Registration>('REGISTRATIONS', { limit: 500 }), []);

  /* Whether this is the real Catalyst data or the sample set. On Catalyst the
     office does not choose a congregation here — the Noah API approves, and it
     has nowhere to put one — so the picker would promise something false. */
  const meta = useQuery(() => api.get<{ dataSource?: string }>('/meta'), []);
  const onCatalyst = meta.data?.dataSource === 'catalyst';

  const tally = useMemo(() => {
    const rows = counts.data?.rows ?? [];
    return {
      pending: rows.filter((r) => r.state === 'pending').length,
      returned: rows.filter((r) => r.state === 'videoReturned').length,
      rejected: rows.filter((r) => r.state === 'rejected').length,
      approved: rows.filter((r) => r.state === 'approved').length,
      oldest: rows.filter((r) => r.state === 'pending').map((r) => r.at).sort((a, b) => +a - +b)[0] ?? null,
    };
  }, [counts.data]);

  /* After any decision: close up, refresh the list, the tallies and the
     badges, and say what happened. */
  async function afterDecision(message: string) {
    setOpen(null);
    setRemark('');
    q.reload();
    counts.reload();
    queues.refresh();
    toast(message);
  }

  async function approve(r: Registration) {
    setBusy(true);
    try {
      const res = await api.post<{ member: { id: string; name?: string }; warning?: string }>(
        `/registrations/${r.id}/approve`,
        { loc: onCatalyst ? undefined : loc || undefined },
      );
      /* The reply names the member only in the sample data; on Catalyst it
         carries their id. The name is the one already on screen. */
      await afterDecision(`${r.fullName} is now a member (${res.member.id}). The app opens for them.`);
      /* Approved, but the member was not told: say so, rather than leaving the
         office to assume an email went out. */
      if (res.warning) toast(res.warning, 'warn');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
      setApproving(false);
    }
  }

  async function returnVideo(r: Registration) {
    if (!remark.trim()) return;
    setBusy(true);
    try {
      const res = await api.post<{ warning?: string }>(`/registrations/${r.id}/return-video`, { remark: remark.trim() });
      await afterDecision(`The video went back to ${r.fullName}. They can re-record it in the app.`);
      if (res.warning) toast(res.warning, 'warn');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
      setReturning(false);
    }
  }

  async function reject(r: Registration) {
    if (!remark.trim()) return;
    setBusy(true);
    try {
      const res = await api.post<{ warning?: string }>(`/registrations/${r.id}/reject`, { remark: remark.trim() });
      await afterDecision(`${r.fullName}'s registration was rejected.`);
      if (res.warning) toast(res.warning, 'warn');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
      setRejecting(false);
    }
  }

  async function toggleCheck(r: Registration, key: string, value: boolean) {
    try {
      const res = await api.patch<{ checks: Registration['checks'] }>(`/registrations/${r.id}/checks`, { [key]: value });
      setOpen({ ...r, checks: res.checks });
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  }

  const columns: Column<Registration>[] = [
    {
      key: 'fullName', label: 'Member',
      cell: (r) => <Who name={r.fullName} sub={<span className="mono">{r.mobile}</span>} />,
    },
    { key: 'city', label: 'From', cell: (r) => <>{r.city}<span className="sub">{r.country}</span></> },
    { key: 'idType', label: 'ID proof', cell: (r) => <>{r.idType}<span className="sub mono">{r.idNumber}</span></> },
    {
      key: 'videoSecs', label: 'Video', num: true,
      cell: (r) => (
        <>
          {r.videoSecs}s
          {r.videoAttempt > 1 && <span className="sub">attempt {r.videoAttempt}</span>}
        </>
      ),
    },
    {
      key: 'at', label: 'Waiting', num: true,
      cell: (r) => (r.state === 'pending' ? <Age at={r.at} warn={24} bad={48} /> : <span className="muted">{since(r.at)}</span>),
      sortBy: (r) => r.at,
    },
    {
      key: 'state', label: 'Status',
      cell: (r) => (
        <Chip tone={r.state === 'approved' ? 'ok' : r.state === 'videoReturned' || r.state === 'rejected' ? 'bad' : r.state === 'draft' ? 'mute' : 'warn'}>
          {REG_STATE[r.state]}
        </Chip>
      ),
    },
  ];

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;

  return (
    <div className="stack">
      <Note tone="brand" icon="mobile">
        <b>These people are locked out until you decide.</b> Each one finished the
        six-step registration in the Noah app and is on its waiting screen.
        Approving creates their member record and opens the app; returning the
        video sends them back to step six to record it again.
      </Note>

      <Kpis>
        <Kpi label="Waiting" value={tally.pending} icon="user-plus" tone={tally.pending > 6 ? 'warn' : undefined}
          detail={tally.oldest ? <>oldest <Age at={tally.oldest} warn={24} bad={48} /></> : 'nothing waiting'} />
        <Kpi label="Video returned" value={tally.returned} icon="video"
          detail="re-recording in the app" />
        <Kpi label="Approved" value={tally.approved} icon="user-check"
          detail="now on the member register" />
        <Kpi label="Target" value="24 h" icon="clock"
          detail="how long a registration should wait" />
      </Kpis>

      {q.loading && !q.data ? (
        <div className="card"><Loading what="registrations" /></div>
      ) : (
        <Table
          rows={q.data?.rows ?? []}
          columns={columns}
          rowKey={(r) => r.id}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Name, number, email or city"
          onRowClick={(r) => { setOpen(r); setLoc(r.city); }}
          pageSize={20}
          toolbar={
            <>
              <select className="sel" value={state} onChange={(e) => setState(e.target.value as typeof state)} aria-label="Filter by status">
                <option value="pending">Waiting ({tally.pending})</option>
                <option value="videoReturned">Video returned ({tally.returned})</option>
                <option value="rejected">Rejected ({tally.rejected})</option>
                <option value="approved">Approved ({tally.approved})</option>
                <option value="">Everything</option>
              </select>
              <span className="sp" style={{ flex: 1 }} />
              <span className="small muted">Oldest first</span>
            </>
          }
          empty={
            <Empty icon="user-check" title="Nothing waiting">
              Every registration from the app has been decided.
            </Empty>
          }
          footNote="From the Noah app"
        />
      )}

      {/* ---------- the review drawer ---------- */}
      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        width="xwide"
        title={open ? `${open.salutation} ${open.fullName}` : ''}
        sub={
          open && (
            <>
              <span className="mono">{open.id}</span> · submitted {fdt(open.at)} ·{' '}
              {open.state === 'pending'
                ? <>waiting <Age at={open.at} warn={24} bad={48} /></>
                : open.decidedBy
                  ? <>{REG_STATE[open.state]} by {open.decidedBy}</>
                  : <>{REG_STATE[open.state]}</>}
            </>
          )
        }
        footer={
          /* Only a registration waiting for a decision can be decided. The
             server refuses anything else, so offering the buttons would only
             lead to an error. */
          open && open.state === 'pending' ? (
            <>
              <span className="muted small">
                {onCatalyst
                  ? 'Approving opens the app for them, and the Noah API emails them.'
                  : 'Approving creates the member record. The app opens for them straight away.'}
              </span>
              <span className="sp" style={{ flex: 1 }} />
              <Btn variant="danger" icon="video" onClick={() => setReturning(true)} disabled={busy}>
                Return the video
              </Btn>
              <Btn variant="danger" icon="x" onClick={() => setRejecting(true)} disabled={busy}>
                Reject
              </Btn>
              <Btn variant="ok" icon="user-check" onClick={() => setApproving(true)} disabled={busy}>
                {onCatalyst ? 'Approve' : 'Approve and create the member'}
              </Btn>
            </>
          ) : open?.state === 'approved' ? (
            <>
              <Icon name="check" />
              <span className="muted small">
                Approved {open.decidedAt ? fdt(open.decidedAt) : ''}{open.decidedBy ? ` by ${open.decidedBy}` : ''}.
                {open.memberId && <> Member <b className="mono">{open.memberId}</b>.</>}
              </span>
            </>
          ) : open ? (
            <span className="muted small">
              {open.state === 'draft' && 'They have not submitted yet, so there is nothing to decide.'}
              {open.state === 'rejected' && `Rejected ${open.decidedAt ? fdt(open.decidedAt) : ''}. A decision can only be made once.`}
              {open.state === 'videoReturned' && 'Waiting for them to record the video again. It comes back here when they do.'}
            </span>
          ) : null
        }
      >
        {open && (
          <>
            {open.state === 'rejected' && (
              <div className="mb12">
                <Note tone="bad" icon="x">
                  <b>Rejected{open.decidedAt ? ` on ${fd(open.decidedAt)}` : ''}.</b>
                  <br />“{open.remark}”
                  <br />
                  <span className="small">The member was shown this reason.</span>
                </Note>
              </div>
            )}

            {open.state === 'videoReturned' && (
              <div className="mb12">
                <Note tone="warn" icon="video">
                  <b>The video went back to them on {open.decidedAt ? fd(open.decidedAt) : ''}.</b>
                  <br />“{open.remark}”
                  <br />
                  <span className="small">They are re-recording step six in the app. It will come back here when they submit.</span>
                </Note>
              </div>
            )}

            <div className="reg-grid">
              <div className="card pad">
                <Steps r={open} />
              </div>

              <div className="card pad">
                <Checks r={open} onToggle={(k, v) => toggleCheck(open, k, v)} />

                {open.state === 'pending' && !onCatalyst && (
                  <>
                    <hr className="div" />
                    <Field
                      label="Congregation to put them in"
                      hint="Taken from the city they gave. Change it if they belong elsewhere."
                    >
                      <select className="sel" value={loc} onChange={(e) => setLoc(e.target.value)}>
                        {[open.city, 'Andheri', 'Borivali', 'Thane', 'Vashi', 'Pune', 'Hyderabad', 'Bengaluru', 'Chennai', 'Kochi']
                          .filter((v, i, a) => a.indexOf(v) === i)
                          .map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </Field>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </Drawer>

      {/* ---------- approve ---------- */}
      <Confirm
        open={approving}
        onClose={() => setApproving(false)}
        onConfirm={() => open && approve(open)}
        title="Approve this registration?"
        confirmLabel={onCatalyst ? 'Approve' : 'Approve and create the member'}
      >
        {open && (
          <>
            <p className="mt0">
              {onCatalyst ? (
                <>
                  <b>{open.fullName}</b> is approved and the Noah app opens for them
                  immediately. The Noah API emails them to say so.
                </>
              ) : (
                <>
                  <b>{open.fullName}</b> becomes a member of the <b>{loc}</b> congregation.
                  The Noah app opens for them immediately.
                </>
              )}
            </p>
            <Note tone="mute" icon="info">
              Their ID, photograph, signed declaration and KYC video stay on the
              record. You cannot undo this from here — a member is archived
              rather than deleted.
            </Note>
          </>
        )}
      </Confirm>

      {/* ---------- reject ---------- */}
      <Drawer
        open={rejecting}
        onClose={() => { setRejecting(false); setRemark(''); }}
        title="Reject this registration"
        sub={open ? `${open.fullName} will be told why` : ''}
        footer={
          <>
            <span className="sp" style={{ flex: 1 }} />
            <Btn onClick={() => { setRejecting(false); setRemark(''); }}>Cancel</Btn>
            <Btn variant="danger" disabled={!remark.trim() || busy} onClick={() => open && reject(open)}>
              {busy ? 'Sending…' : 'Reject'}
            </Btn>
          </>
        }
      >
        <Note tone="warn" icon="alert">
          A registration can be decided once. After this the member cannot be
          approved from here, so if the problem is only the video, return the
          video instead.
        </Note>
        <div className="mt16">
          <Field label="Why is it being rejected?" hint="Required. The member sees these words, in the email and in the app.">
            <textarea
              className="ta"
              rows={4}
              value={remark}
              autoFocus
              placeholder="The ID you gave does not match the name on your registration."
              onChange={(e) => setRemark(e.target.value)}
            />
          </Field>
        </div>
      </Drawer>

      {/* ---------- return the video ---------- */}
      <Drawer
        open={returning}
        onClose={() => { setReturning(false); setRemark(''); }}
        title="Return the video"
        sub={open ? `${open.fullName} will record step six again` : ''}
        footer={
          <>
            <span className="sp" style={{ flex: 1 }} />
            <Btn onClick={() => { setReturning(false); setRemark(''); }}>Cancel</Btn>
            <Btn variant="danger" disabled={!remark.trim() || busy} onClick={() => open && returnVideo(open)}>
              {busy ? 'Sending…' : 'Send it back'}
            </Btn>
          </>
        }
      >
        <Note tone="warn" icon="alert">
          The member reads this on their waiting screen, so write it to them,
          plainly, and say what to do differently.
        </Note>
        <div className="mt16">
          <Field label="Why is it going back?" hint="Required. They see these words.">
            <textarea
              className="ta"
              rows={4}
              value={remark}
              autoFocus
              placeholder="The video is too dark to match your photograph. Please record it again in daylight, facing the window."
              onChange={(e) => setRemark(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt16">
          <div className="sect-title">Common reasons</div>
          <div className="row wrap gap6">
            {[
              'The video is too dark to match your photograph. Please record it again in daylight.',
              'The reading stopped halfway. Please read the whole line.',
              'Your face is not visible for the whole recording.',
              'There is too much background noise to hear you.',
            ].map((t) => (
              <button key={t} className="btn sm" onClick={() => setRemark(t)}>{t.slice(0, 38)}…</button>
            ))}
          </div>
        </div>
      </Drawer>
    </div>
  );
}
