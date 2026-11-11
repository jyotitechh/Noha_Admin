/* The door scanner (EVENTS-QR-CONTRACT.md): pick the event, point the camera at a member's QR pass (or type its reference), see
   who it is, then Confirm admission. Only for roles with events.scan; the server checks it on every call too.

   The camera is read with the browser's own BarcodeDetector where there is one (Chrome on Android, most tablets) and with jsQR
   everywhere else. The same code read twice in a row is ignored for a few seconds, so holding a phone still does not scan it
   again and again. Many staff can scan the same event at once: the Noah API makes sure one booking is admitted only once. */

import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { api } from '@/lib/api';
import { Btn, Chip, Empty, Icon, Loading } from '@/components/ui';
import { dayLong, time12, type EventRow } from './shared';

interface ScanAnswer {
  result: string; ok: boolean; message: string;
  event?: { id: string; name: string; start?: string };
  pass?: { id: string; reference?: string; bookedAt?: string; attendedAt?: string | null };
  member?: { id: string; name: string; number?: string };
  other?: { name?: string };
}
interface Counts { registered: number; confirmed: number; checkedIn: number; notYetArrived: number; attendancePercent: number; event?: { scanningOpen?: boolean } }

const TONE: Record<string, 'ok' | 'warn' | 'bad'> = { valid: 'ok', admitted: 'ok', already_scanned: 'warn', busy: 'warn' };
const COLOUR = { ok: 'var(--ok, #1f8a4c)', warn: 'var(--warn, #b7791f)', bad: 'var(--bad, #be2f27)' };

/* A name for this device, kept on it, so the audit trail says which door it was. */
const deviceRef = (() => {
  try {
    let v = localStorage.getItem('ks-scanner-device');
    if (!v) { v = 'scanner-' + Math.random().toString(36).slice(2, 7); localStorage.setItem('ks-scanner-device', v); }
    return v;
  } catch { return 'scanner'; }
})();

declare global { interface Window { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } } }

export default function Scanner() {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [eventId, setEventId] = useState('');
  const [error, setError] = useState('');

  const [camera, setCamera] = useState(false);
  const [camProblem, setCamProblem] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<ScanAnswer | null>(null);
  const [asked, setAsked] = useState<{ token?: string; reference?: string } | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const last = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const working = useRef(false);

  useEffect(() => {
    api.get<{ rows: EventRow[]; today: string }>('/event-admin/scan/events')
      .then((r) => { setEvents(r.rows); setEventId((r.rows.find((e) => e.date === r.today) ?? r.rows[0])?.id ?? ''); })
      .catch((e) => setError((e as Error).message));
  }, []);

  /* The live counter: read every 5 seconds while an event is chosen. */
  useEffect(() => {
    if (!eventId) return;
    let stop = false;
    const read = () => api.get<Counts>(`/event-admin/events/${eventId}/attendance`).then((c) => { if (!stop) setCounts(c); }).catch(() => {});
    read();
    const t = setInterval(read, 5000);
    return () => { stop = true; clearInterval(t); };
  }, [eventId]);

  const send = useCallback(async (what: { token?: string; reference?: string }, confirm = false) => {
    if (!eventId || working.current) return;
    working.current = true; setBusy(true);
    try {
      const r = await api.post<ScanAnswer>(`/event-admin/events/${eventId}/scan`, { ...what, confirm, deviceRef });
      setAnswer(r); setAsked(what);
      if (r.result === 'admitted') {
        api.get<Counts>(`/event-admin/events/${eventId}/attendance`).then(setCounts).catch(() => {});
        setTimeout(() => { setAnswer((a) => (a?.result === 'admitted' ? null : a)); }, 3500);
      }
    } catch (e) {
      setAnswer({ result: 'failed', ok: false, message: (e as Error).message || 'The scan could not be recorded. Scan the code again.' });
      setAsked(what);
    } finally {
      working.current = false; setBusy(false);
    }
  }, [eventId]);

  /* The camera loop. */
  useEffect(() => {
    if (!camera) return;
    let stopped = false;
    let frame = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;

    const tick = async () => {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2 && !working.current) {
        let text = '';
        try {
          if (detector) {
            const found = await detector.detect(v);
            text = found[0]?.rawValue ?? '';
          } else if (ctx) {
            const w = Math.min(640, v.videoWidth); const h = Math.round((v.videoHeight / v.videoWidth) * w);
            canvas.width = w; canvas.height = h;
            ctx.drawImage(v, 0, 0, w, h);
            text = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? '';
          }
        } catch { /* a frame that could not be read */ }
        const now = Date.now();
        if (text && (text !== last.current.text || now - last.current.at > 5000)) {
          last.current = { text, at: now };
          send({ token: text.trim() });
        }
      }
      frame = window.setTimeout(tick, 250);
    };

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); }
        tick();
      })
      .catch(() => { setCamProblem('The camera could not be opened. Allow camera access for this site, or type the reference from the pass.'); setCamera(false); });

    return () => {
      stopped = true; clearTimeout(frame);
      stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null;
    };
  }, [camera, send]);

  if (error) return <div className="card"><Empty icon="alert" title="The scanner cannot start">{error}</Empty></div>;
  if (!events) return <div className="card"><Loading what="today's events" /></div>;

  const tone = answer ? (TONE[answer.result] ?? 'bad') : null;
  const chosen = events.find((e) => e.id === eventId);

  return (
    <div className="stack">
      <div className="row wrap gap8" style={{ alignItems: 'center' }}>
        <select className="sel" style={{ maxWidth: 420 }} value={eventId} aria-label="Event" onChange={(e) => { setEventId(e.target.value); setAnswer(null); setCounts(null); }}>
          {!events.length && <option value="">No events from yesterday to next week</option>}
          {events.map((e) => <option key={e.id} value={e.id}>{e.name} · {dayLong(e.date)} · {time12(e.startTime)}</option>)}
        </select>
        {counts && (
          <span className="row gap6" style={{ alignItems: 'center' }}>
            <Chip tone="ok" icon="users">{counts.checkedIn} of {counts.confirmed} in ({counts.attendancePercent}%)</Chip>
            <span className="small muted">{counts.notYetArrived} not yet arrived</span>
            {counts.event?.scanningOpen === false && <Chip tone="bad">Scanning is closed</Chip>}
          </span>
        )}
      </div>

      {!eventId ? (
        <div className="card"><Empty icon="cal" title="No event to scan for">Events from yesterday to a week ahead are listed here.</Empty></div>
      ) : (
        <div className="g2" style={{ alignItems: 'start' }}>
          <div className="card pad stack">
            <div style={{ position: 'relative', background: '#111', borderRadius: 12, overflow: 'hidden', aspectRatio: '4 / 3', display: 'grid', placeItems: 'center' }}>
              <video ref={video} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: camera ? 'block' : 'none' }} />
              {camera && <div style={{ position: 'absolute', inset: '18%', border: '3px solid rgba(255,255,255,.8)', borderRadius: 16, pointerEvents: 'none' }} />}
              {!camera && (
                <Btn variant="pri" icon="scan" onClick={() => { setCamProblem(''); setCamera(true); }}>Start the camera</Btn>
              )}
            </div>
            {camera && <Btn icon="x" onClick={() => setCamera(false)}>Stop the camera</Btn>}
            {camProblem && <div className="small" style={{ color: 'var(--bad)' }}>{camProblem}</div>}

            <form className="row gap8" onSubmit={(e) => { e.preventDefault(); if (reference.trim()) send({ reference: reference.trim() }); }}>
              <input className="inp grow" value={reference} placeholder="Or type the reference, e.g. KS-0154022-3F9" aria-label="Pass reference"
                autoCapitalize="characters" onChange={(e) => setReference(e.target.value)} />
              <Btn variant="pri" disabled={busy || !reference.trim()}>Check</Btn>
            </form>
          </div>

          <div className="card pad stack" aria-live="polite" style={{ minHeight: 260, borderLeft: tone ? `6px solid ${COLOUR[tone]}` : undefined }}>
            {!answer ? (
              <Empty icon="qr" title={busy ? 'Checking…' : 'Ready to scan'}>
                {chosen ? `${chosen.name}: hold a member's pass in front of the camera, or type its reference.` : ''}
              </Empty>
            ) : (
              <>
                <div className="row gap8" style={{ alignItems: 'center' }}>
                  <Icon name={tone === 'ok' ? 'check' : tone === 'warn' ? 'alert' : 'x'} />
                  <b style={{ fontSize: 18, color: tone ? COLOUR[tone] : undefined }}>{answer.message}</b>
                </div>
                {answer.member && (
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{answer.member.name}</div>
                    {answer.member.number && <div className="muted">Member {answer.member.number}</div>}
                  </div>
                )}
                {answer.pass?.reference && <div className="small muted">Pass {answer.pass.reference}</div>}
                {answer.result === 'already_scanned' && answer.pass?.attendedAt && (
                  <div className="small">Marked present at {new Date(answer.pass.attendedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.</div>
                )}
                {answer.result === 'wrong_event' && answer.other?.name && <div className="small">This pass is for <b>{answer.other.name}</b>.</div>}

                <div className="row gap8 mt8">
                  {answer.result === 'valid' && asked && (
                    <Btn variant="ok" icon="check" disabled={busy} onClick={() => send(asked, true)} style={{ minHeight: 48, fontSize: 16 }}>Confirm admission</Btn>
                  )}
                  <Btn onClick={() => { setAnswer(null); setAsked(null); setReference(''); last.current = { text: '', at: 0 }; }}>
                    {answer.result === 'valid' ? 'Cancel' : 'Scan the next pass'}
                  </Btn>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
