/* A picture the console's API serves only to a signed-in member of staff (an Aadhaar, a child's photo).

   An <img src> cannot send the sign-in, so the picture is fetched with it and shown from memory, which is released when the
   picture leaves the screen. Each view goes through a route that checks the permission and writes the audit log. */

import { useEffect, useRef, useState } from 'react';
import { apiUrl, getToken } from '@/lib/api';

export function AuthImage({ path, alt, width = 240, height, fit = 'contain', open = false }: {
  /** The API path, without /api, e.g. /family-requests/123/aadhaar */
  path: string; alt: string; width?: number; height?: number; fit?: 'contain' | 'cover';
  /** Clicking opens the full picture in a new tab. */
  open?: boolean;
}) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const url = useRef('');
  useEffect(() => {
    let live = true;
    setSrc(''); setError('');
    fetch(apiUrl(path), { headers: { authorization: 'Bearer ' + getToken() } })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `It could not be loaded (${res.status}).`);
        return res.blob();
      })
      .then((b) => { if (live) { url.current = URL.createObjectURL(b); setSrc(url.current); } })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; if (url.current) URL.revokeObjectURL(url.current); url.current = ''; };
  }, [path]);

  const style = { width, height: height ?? 'auto', maxHeight: 320, objectFit: fit, borderRadius: 10, border: '1px solid var(--line)', display: 'block', background: 'var(--wash)' } as const;
  if (!src) return <div className="muted xs" style={{ width, minHeight: 48 }}>{error || 'Loading…'}</div>;
  const img = <img src={src} alt={alt} style={style} />;
  return open ? <a href={src} target="_blank" rel="noreferrer" title="Open the full picture">{img}</a> : img;
}
