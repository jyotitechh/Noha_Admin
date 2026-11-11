/* An event's place, chosen on the map instead of typed.

   Nothing chosen: a search box. Type a place or an address and pick from the short list (a name and one line under
   it); places chosen before are offered first, as "Saved places". Chosen: only a compact card is shown (the name, one
   line of address and a small map with a pin), with Change and Remove. The search itself is the server's
   (server/places.js, OpenStreetMap), so no key is needed in the browser. */

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Btn, Icon } from '@/components/ui';
import type { Place } from './shared';

export interface Chosen {
  id: string; name: string; address: string; lat: string; lon: string;
  parts?: { area: string; city: string; state: string; country: string } | null;
}

/** The one line shown under a place's name: where it is, without repeating the name. */
export const lineOf = (p: { name: string; area?: string; city?: string; state?: string; country?: string; address?: string }) => {
  const bits = [p.area, p.city, p.state, p.country].map((x) => (x ?? '').trim()).filter(Boolean)
    .filter((x, i, a) => x.toLowerCase() !== p.name.trim().toLowerCase() && a.indexOf(x) === i);
  return bits.length ? bits.join(', ') : (p.address ?? '');
};

export const mapSrc = (lat: string, lon: string) => {
  const la = Number(lat); const lo = Number(lon);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lo - 0.004},${la - 0.0025},${lo + 0.004},${la + 0.0025}&layer=mapnik&marker=${la},${lo}`;
};
export const mapLink = (lat: string, lon: string) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;

export function LocationPicker({ value, saved, onChange }: {
  value: Chosen | null; saved: Place[]; onChange: (c: Chosen | null) => void;
}) {
  const [changing, setChanging] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    const term = q.trim();
    setProblem('');
    if (term.length < 3) { setHits([]); setBusy(false); return; }
    setBusy(true);
    const t = setTimeout(() => {
      api.get<{ rows: Place[] }>(`/event-admin/places?q=${encodeURIComponent(term)}`)
        .then((r) => setHits(r.rows))
        .catch((e) => { setHits([]); setProblem((e as Error).message); })
        .finally(() => setBusy(false));
    }, 450);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (p: Place) => {
    onChange({ id: p.id, name: p.name, address: p.address || lineOf(p), lat: p.lat, lon: p.lon, parts: { area: p.area, city: p.city, state: p.state, country: p.country } });
    setChanging(false); setQ(''); setHits([]);
  };

  const hasValue = !!value && !!(value.name || value.address);

  if (hasValue && !changing) {
    const v = value!;
    const where = v.address && v.address !== v.name ? v.address : '';
    return (
      <div className="card pad stack" style={{ gap: 10 }}>
        <div className="row top" style={{ gap: 10 }}>
          <Icon name="pin" />
          <div className="grow">
            <b>{v.name || where}</b>
            {where && v.name && <div className="muted small">{where}</div>}
          </div>
          <Btn sm type="button" onClick={() => setChanging(true)}>Change</Btn>
          <Btn sm type="button" variant="ghost" onClick={() => onChange(null)}>Remove</Btn>
        </div>
        {v.lat && v.lon ? (
          <>
            <iframe title="Map" src={mapSrc(v.lat, v.lon)} style={{ width: '100%', height: 170, border: 0, borderRadius: 8 }} />
            <a className="small" href={mapLink(v.lat, v.lon)} target="_blank" rel="noreferrer">Open on the map</a>
          </>
        ) : <span className="muted small">Not placed on the map. Press Change to search for it.</span>}
      </div>
    );
  }

  const needle = q.trim().toLowerCase();
  const savedShown = saved.filter((p) => !needle || `${p.name} ${p.address}`.toLowerCase().includes(needle)).slice(0, 6);
  const savedIds = new Set(savedShown.map((p) => p.id));
  const found = hits.filter((p) => !savedIds.has(p.id));

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row gap8">
        <input className="inp grow" value={q} autoComplete="off" aria-label="Search for a place" placeholder="Search a place or an address"
          onChange={(e) => setQ(e.target.value)} />
        {hasValue && <Btn type="button" onClick={() => { setChanging(false); setQ(''); }}>Cancel</Btn>}
      </div>

      {(savedShown.length > 0 || found.length > 0 || busy || problem || q.trim().length >= 3) && (
        <div className="card" style={{ maxHeight: 300, overflow: 'auto' }}>
          {savedShown.length > 0 && (
            <>
              <div className="sect-title" style={{ padding: '10px 14px 0' }}>Saved places</div>
              <ul className="list">
                {savedShown.map((p) => (
                  <li key={'s' + p.id} className="click" onClick={() => pick(p)}>
                    <span className="grow"><span className="t1">{p.name}</span><span className="t2">{lineOf(p)}</span></span>
                    <Icon name="plus" />
                  </li>
                ))}
              </ul>
            </>
          )}
          {(found.length > 0 || busy || problem || q.trim().length >= 3) && (
            <>
              {savedShown.length > 0 && <div className="sect-title" style={{ padding: '10px 14px 0' }}>On the map</div>}
              <ul className="list">
                {found.map((p) => (
                  <li key={p.id} className="click" onClick={() => pick(p)}>
                    <span className="grow"><span className="t1">{p.name}</span><span className="t2">{lineOf(p)}</span></span>
                    <Icon name="plus" />
                  </li>
                ))}
                {busy && <li className="muted" style={{ padding: 12 }}>Searching…</li>}
                {!busy && problem && <li className="muted" style={{ padding: 12 }}>{problem}</li>}
                {!busy && !problem && q.trim().length >= 3 && !found.length && !savedShown.length && <li className="muted" style={{ padding: 12 }}>No place found. Try fewer words, such as just the name of the place or the area.</li>}
              </ul>
            </>
          )}
        </div>
      )}
      {!q.trim() && !savedShown.length && <span className="hint">Type at least three letters.</span>}
    </div>
  );
}
