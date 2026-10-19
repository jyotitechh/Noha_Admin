/* Showing what a member uploaded: the ID scan, the photograph, the KYC video.

   The bytes come through our own server, not from a public URL, so the
   permission check runs and the view is written to the audit log. Looking at
   someone's Aadhaar is an action, not a page view.

   When the file cannot be read the reason is shown plainly. An office that
   cannot see the video must not be able to mistake a broken player for a
   video it has watched. */

import { useEffect, useRef, useState } from 'react';
import { getToken } from '@/lib/api';
import { Icon, Note } from './ui';

type Kind = 'id' | 'photo' | 'video';

interface Props {
  registrationId: string;
  kind: Kind;
  filename?: string;
  /** Seconds, for the video. */
  seconds?: number;
  sizeKb?: number;
}

const LABEL: Record<Kind, string> = { id: 'ID document', photo: 'Photograph', video: 'KYC video' };

export function Upload({ registrationId, kind, filename, seconds, sizeKb }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const [scopeMissing, setScopeMissing] = useState(false);
  /* The server says so when the Noah API key is not set. That is the route
     that can actually read File Store, so it is the fix worth naming — not
     the Catalyst scopes, which are the older, harder way round. */
  const [needsAdminKey, setNeedsAdminKey] = useState(false);
  const objectUrl = useRef('');

  async function load() {
    setState('loading');
    setError('');
    try {
      const res = await fetch(`/api/registrations/${registrationId}/file/${kind}`, {
        headers: { authorization: 'Bearer ' + getToken() },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setScopeMissing(!!body.scopeMissing);
        setNeedsAdminKey(!!body.needsAdminKey);
        throw new Error(body.error || `Could not load it (${res.status}).`);
      }
      const blob = await res.blob();
      objectUrl.current = URL.createObjectURL(blob);
      setSrc(objectUrl.current);
      setState('ready');
    } catch (e) {
      setError((e as Error).message);
      setState('failed');
    }
  }

  /* Release the blob when the drawer closes, or the browser holds every
     video the office has opened today. */
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  const meta = [
    filename,
    sizeKb ? `${sizeKb} KB` : null,
    seconds ? `${seconds} seconds` : null,
  ].filter(Boolean).join(' · ');

  if (state === 'ready') {
    return (
      <div>
        {kind === 'video' ? (
          <video src={src} controls preload="metadata" style={{ width: '100%', maxHeight: 340, borderRadius: 10, background: '#000' }} />
        ) : (
          <img
            src={src}
            alt={LABEL[kind]}
            style={{
              maxWidth: '100%', maxHeight: 340, borderRadius: 10,
              border: '1px solid var(--line)', display: 'block',
            }}
          />
        )}
        <p className="xs muted mt8 mb0">{meta} · opening this was recorded in the audit log</p>
      </div>
    );
  }

  return (
    <div className={'filebox' + (kind === 'video' ? ' video' : '')}>
      <Icon name={kind === 'video' ? 'video' : kind === 'photo' ? 'sil' : 'file-text'} />
      <div className="grow">
        <b>{filename || LABEL[kind]}</b>
        {meta || LABEL[kind]}
        {state === 'failed' && (
          <div className="mt8">
            <Note tone={scopeMissing || needsAdminKey ? 'warn' : 'bad'} icon="alert">
              {error}
              {/* The file is in Catalyst either way. What is missing is
                  permission to read it, and there are two ways to get that —
                  the first needs nobody else. */}
              {(scopeMissing || needsAdminKey) && (
                <>
                  <br />
                  <span className="small">
                    The upload is in Catalyst; what is missing is permission to
                    read it. Either:
                    <br />
                    <b>1.</b> Add the File Store scopes to the Catalyst token —{' '}
                    <code className="mono">node server/catalyst.js --scopes</code>{' '}
                    prints the list, then generate a fresh self-client code and run{' '}
                    <code className="mono">--exchange</code> with it.
                    {needsAdminKey && (
                      <>
                        <br />
                        <b>2.</b> Or put the key from{' '}
                        <code className="mono">ADMIN_API_KEY.txt</code> into{' '}
                        <code className="mono">.env.local</code> as{' '}
                        <code className="mono">NOAH_ADMIN_API_KEY</code>, which reads
                        uploads through the Noah API and needs no scope at all.
                      </>
                    )}
                  </span>
                </>
              )}
            </Note>
          </div>
        )}
      </div>
      <button className="btn sm" disabled={state === 'loading'} onClick={load}>
        {state === 'loading' ? 'Opening…' : state === 'failed' ? 'Try again' : `Open the ${kind === 'id' ? 'document' : kind}`}
      </button>
    </div>
  );
}
