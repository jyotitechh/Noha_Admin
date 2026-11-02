/* A picture field: drag one in from the computer, choose a file, or paste a link.

   Either way the form ends up holding a web link, which is all the Noah app reads. A dropped file
   goes to the server (POST /api/uploads/picture), which stores it in a Catalyst Stratus bucket and
   answers with that file's public link; that link is then put in the field exactly as a pasted one
   would be. The server checks what the file really is, so the checks here (picture, 5 MB) only
   spare a round trip. */

import { useRef, useState } from 'react';
import { apiUrl, getToken } from '@/lib/api';

const MAX_MB = 5;
const IS_PICTURE_LINK = /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i;

export function PictureInput({ value, onChange, invalid, label }: {
  value: string; onChange: (v: string) => void; invalid?: boolean; label: string;
}) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const pick = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setProblem('');
    if (!file.type.startsWith('image/')) { setProblem('That is not a picture. Drop a JPEG, PNG, WebP or GIF.'); return; }
    if (file.size > MAX_MB * 1048576) { setProblem(`That picture is ${(file.size / 1048576).toFixed(1)} MB. The most allowed is ${MAX_MB} MB.`); return; }

    setBusy(true);
    try {
      const res = await fetch(apiUrl('/uploads/picture'), {
        method: 'POST',
        headers: { authorization: 'Bearer ' + getToken(), 'Content-Type': file.type },
        body: file,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `The upload failed (${res.status}).`);
      onChange(body.url);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div
        className={'dropzone' + (over ? ' over' : '') + (invalid ? ' err' : '')}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files?.[0]); }}
      >
        {IS_PICTURE_LINK.test(value) || /zohostratus\./i.test(value) ? (
          <img src={value} alt={label} className="dropzone-img" />
        ) : null}
        <div className="dropzone-msg">
          {busy ? 'Uploading…' : (
            <>
              Drag a picture here, or{' '}
              <button type="button" className="linkish" onClick={() => pick.current?.click()}>choose a file</button>
              <span className="xs muted"> · JPEG, PNG, WebP or GIF, up to {MAX_MB} MB</span>
            </>
          )}
        </div>
        {value && !busy && (
          <button type="button" className="btn sm" onClick={() => { onChange(''); setProblem(''); }}>Remove picture</button>
        )}
        <input
          ref={pick} type="file" accept="image/*" hidden aria-label={`Choose a file for ${label}`}
          onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>

      <input
        className={'inp' + (invalid ? ' err' : '')} type="url" value={value} placeholder="…or paste a link: https://"
        aria-label={`${label}: link`} onChange={(e) => onChange(e.target.value)}
      />
      {problem && <div className="small" role="alert" style={{ color: 'var(--bad)', fontWeight: 600 }}>{problem}</div>}
    </div>
  );
}
