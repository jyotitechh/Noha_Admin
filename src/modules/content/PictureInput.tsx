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

/** Phones take 4 to 12 MB photographs; a banner needs a fraction of that. Anything over 1 MB (a picture that is not a GIF) is drawn
    smaller (at most 1600 pixels either way) and sent as a JPEG. A picture that cannot be read here is sent as it is. */
async function shrink(file: File): Promise<File> {
  if (file.size <= 1024 * 1024 || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** A file as base64 text, without the data: prefix. */
const toBase64 = (file: File) => new Promise<string>((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] ?? '');
  r.onerror = () => bad(r.error);
  r.readAsDataURL(file);
});

export function PictureInput({ value, onChange, invalid, label }: {
  value: string; onChange: (v: string) => void; invalid?: boolean; label: string;
}) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const pick = useRef<HTMLInputElement>(null);

  async function upload(chosen: File | undefined) {
    if (!chosen) return;
    setProblem('');
    if (!chosen.type.startsWith('image/')) { setProblem('That is not a picture. Drop a JPEG, PNG, WebP or GIF.'); return; }

    setBusy(true);
    try {
      const file = await shrink(chosen);
      if (file.size > MAX_MB * 1048576) { setProblem(`That picture is ${(file.size / 1048576).toFixed(1)} MB. The most allowed is ${MAX_MB} MB.`); return; }
      let res: Response;
      try {
        res = await fetch(apiUrl('/uploads/picture'), {
          method: 'POST',
          headers: { authorization: 'Bearer ' + getToken(), 'Content-Type': file.type },
          body: file,
        });
      } catch {
        /* The browser never got an answer. Some hosts in front of the API let only JSON through, so send the same picture that way. */
        res = await fetch(apiUrl('/uploads/picture'), {
          method: 'POST',
          headers: { authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: await toBase64(file), type: file.type }),
        });
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `The upload failed (${res.status}). Try again, or paste a picture link instead.`);
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
          <img src={value} alt={label} className="dropzone-img"
            onError={() => setProblem('This picture cannot be shown. Check the link, or choose the file again.')}
            onLoad={() => setProblem((p) => (p.startsWith('This picture cannot be shown') ? '' : p))} />
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
