/* Choosing an event's place on a big map: search, click the map or drag the pin to the exact spot, then "Use this place".

   Two maps, one behaviour:
     Mappls (MapmyIndia)  when the API has MAPPLS_KEY. Its own Place Picker plugin shows the map, a search box and a pin
                          whose address it looks up itself. Its key has to be in the browser: it is restricted to the
                          console's domains in the Mappls console.
     OpenStreetMap        otherwise, or if Mappls cannot be loaded. Leaflet draws the map; the address at the pin comes from
                          the server (GET /api/event-admin/places/reverse), and the search from the same place search as
                          the form (server/places.js).
   Either way the form gets the same thing back: a name, an address, a latitude and longitude and the parts of the address. */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '@/lib/api';
import { Btn, Icon } from '@/components/ui';
import { lineOf, type Chosen } from './LocationPicker';
import type { Place } from './shared';

export interface MapConfig { provider: 'mappls' | 'osm'; key?: string }

/* Mumbai, when there is nothing to start from. */
const HOME = { lat: 19.076, lon: 72.8777 };

const fromPlace = (p: Place): Chosen => ({
  id: p.id, name: p.name, address: p.address || lineOf(p), lat: p.lat, lon: p.lon,
  parts: { area: p.area, city: p.city, state: p.state, country: p.country },
});

/* ---------------- Mappls ---------------- */

declare global {
  interface Window {
    mappls?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    __ksMapplsMap?: () => void;
    __ksMapplsPlugins?: () => void;
  }
}

let mapplsLoading: Promise<void> | null = null;
function loadMappls(key: string): Promise<void> {
  if (mapplsLoading) return mapplsLoading;
  const add = (src: string, ready: '__ksMapplsMap' | '__ksMapplsPlugins') => new Promise<void>((ok, fail) => {
    window[ready] = () => ok();
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onerror = () => fail(new Error('Mappls could not be loaded.'));
    document.head.appendChild(s);
  });
  const k = encodeURIComponent(key);
  mapplsLoading = add(`https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=${k}&callback=__ksMapplsMap`, '__ksMapplsMap')
    .then(() => add(`https://sdk.mappls.com/map/sdk/plugins?v=3.0&libraries=placePicker&access_token=${k}&callback=__ksMapplsPlugins`, '__ksMapplsPlugins'))
    .catch((e) => { mapplsLoading = null; throw e; });
  return mapplsLoading;
}

/** Mappls's Place Picker answers with address fields like its reverse geocoding (formatted_address, poi, subLocality, city...).
    The names are read loosely, so a field that is named differently is simply missed, never a crash. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromMappls(d: any): Chosen | null {
  if (!d) return null;
  const r = Array.isArray(d.results) ? d.results[0] : d;
  const lat = Number(r?.lat ?? r?.latitude); const lon = Number(r?.lng ?? r?.lon ?? r?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const s = (v: unknown) => String(v ?? '').trim();
  const address = s(r.formatted_address ?? r.formattedAddress ?? r.placeAddress);
  const name = s(r.poi) || s(r.placeName) || s(r.houseName) || s(r.street) || s(r.subLocality) || s(r.locality) || address.split(',')[0];
  const eLoc = s(r.eLoc ?? r.mapplsPin ?? r.pin);
  return {
    id: eLoc ? `mappls:${eLoc}` : `mappls:${lat.toFixed(6)},${lon.toFixed(6)}`,
    name, address, lat: lat.toFixed(6), lon: lon.toFixed(6),
    parts: { area: s(r.subLocality) || s(r.locality), city: s(r.city) || s(r.district), state: s(r.state), country: 'India' },
  };
}

/* ---------------- the window ---------------- */

export function MapPickerModal({ open, start, config, onClose, onPick }: {
  open: boolean; start: Chosen | null; config: MapConfig; onClose: () => void; onPick: (c: Chosen) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<'mappls' | 'osm'>(config.provider === 'mappls' && config.key ? 'mappls' : 'osm');
  const [notice, setNotice] = useState('');
  const [picked, setPicked] = useState<Chosen | null>(start);
  const [looking, setLooking] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState('');

  /* Leaflet's map and pin, or Mappls's picker, while the window is open. */
  const leaflet = useRef<{ map: L.Map; pin: L.Marker } | null>(null);
  const mapplsPicker = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => { if (open) { setPicked(start); setQ(''); setHits([]); setProblem(''); } }, [open, start]);

  /* Escape closes this map only. It is caught first and stopped, or the event form underneath would close as well and
     lose what was typed. */
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [open, onClose]);

  /* What is at the pin: asked of the server, for the OpenStreetMap map. */
  const lookUp = useRef<ReturnType<typeof setTimeout> | null>(null);
  function lookAt(lat: number, lon: number) {
    setProblem('');
    setPicked({ id: '', name: '', address: '', lat: lat.toFixed(6), lon: lon.toFixed(6) });
    if (lookUp.current) clearTimeout(lookUp.current);
    setLooking(true);
    lookUp.current = setTimeout(() => {
      api.get<{ place: Place | null }>(`/event-admin/places/reverse?lat=${lat}&lon=${lon}`)
        .then((r) => setPicked(r.place
          ? fromPlace(r.place)
          : { id: `pin:${lat.toFixed(6)},${lon.toFixed(6)}`, name: 'Pinned place', address: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat: lat.toFixed(6), lon: lon.toFixed(6) }))
        .catch((e) => setProblem((e as Error).message))
        .finally(() => setLooking(false));
    }, 350);
  }

  /* Build the map when the window opens; take it down when it closes. */
  useEffect(() => {
    if (!open || !box.current) return;
    const el = box.current;
    const at = start?.lat && start?.lon ? { lat: Number(start.lat), lon: Number(start.lon) } : HOME;
    const zoom = start?.lat ? 17 : 12;
    let cancelled = false;

    const startOsm = () => {
      if (cancelled || leaflet.current) return;
      el.innerHTML = '';
      const map = L.map(el, { zoomControl: true }).setView([at.lat, at.lon], zoom);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const icon = L.divIcon({ className: 'ks-pin', html: '<span></span>', iconSize: [28, 40], iconAnchor: [14, 38] });
      const pin = L.marker([at.lat, at.lon], { draggable: true, icon, keyboard: true, title: 'Drag to the exact spot' }).addTo(map);
      pin.on('dragend', () => { const p = pin.getLatLng(); lookAt(p.lat, p.lng); });
      map.on('click', (e: L.LeafletMouseEvent) => { pin.setLatLng(e.latlng); lookAt(e.latlng.lat, e.latlng.lng); });
      leaflet.current = { map, pin };
      setTimeout(() => map.invalidateSize(), 60);
    };

    if (engine === 'mappls' && config.key) {
      const id = 'ks-mappls-map';
      el.id = id;
      const giveUp = setTimeout(() => {
        if (!mapplsPicker.current && !cancelled) { setNotice('Mappls did not load in time, so the standard map is shown.'); setEngine('osm'); }
      }, 12000);
      loadMappls(config.key).then(() => {
        if (cancelled) return;
        const M = window.mappls;
        const map = new M.Map(id, { center: [at.lat, at.lon], zoom, zoomControl: true });
        const begin = () => {
          if (cancelled) return;
          try {
            mapplsPicker.current = M.placePicker({ map, location: { lat: at.lat, lng: at.lon }, search: true, closeBtn: false }, (d: unknown) => {
              const c = fromMappls((d as { data?: unknown })?.data ?? d);
              if (c) setPicked(c);
            });
            clearTimeout(giveUp);
          } catch {
            clearTimeout(giveUp);
            setNotice('The Mappls place picker could not start, so the standard map is shown.');
            setEngine('osm');
          }
        };
        if (map.addListener) map.addListener('load', begin); else begin();
      }).catch(() => {
        clearTimeout(giveUp);
        if (!cancelled) { setNotice('Mappls could not be loaded (check the key and its allowed domains), so the standard map is shown.'); setEngine('osm'); }
      });
      return () => { cancelled = true; clearTimeout(giveUp); mapplsPicker.current = null; el.innerHTML = ''; };
    }

    startOsm();
    return () => {
      cancelled = true;
      leaflet.current?.map.remove();
      leaflet.current = null;
    };
  }, [open, engine]); // eslint-disable-line react-hooks/exhaustive-deps

  /* The search box, for the OpenStreetMap map (Mappls's picker has its own). */
  useEffect(() => {
    if (engine !== 'osm') return;
    const term = q.trim();
    if (term.length < 3) { setHits([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api.get<{ rows: Place[] }>(`/event-admin/places?q=${encodeURIComponent(term)}`)
        .then((r) => setHits(r.rows))
        .catch((e) => { setHits([]); setProblem((e as Error).message); })
        .finally(() => setSearching(false));
    }, 450);
    return () => clearTimeout(t);
  }, [q, engine]);

  function goTo(p: Place) {
    const lat = Number(p.lat); const lon = Number(p.lon);
    leaflet.current?.map.setView([lat, lon], 17);
    leaflet.current?.pin.setLatLng([lat, lon]);
    setPicked(fromPlace(p));
    setHits([]); setQ('');
  }

  function use() {
    let c = picked;
    if (engine === 'mappls' && mapplsPicker.current) {
      try {
        const now = mapplsPicker.current.getLocation?.() ?? mapplsPicker.current.getData?.();
        c = fromMappls(now?.data ?? now) ?? c;
      } catch { /* keep what the callback gave */ }
    }
    if (c && c.lat && c.lon) onPick({ ...c, name: c.name || 'Pinned place', address: c.address || `${c.lat}, ${c.lon}` });
  }

  if (!open) return null;
  const ready = !!(picked && picked.lat && picked.lon && !looking) || engine === 'mappls';

  return createPortal(
    <>
      <div className="scrim modal-scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label="Choose the place on the map"
        style={{ width: 'min(1200px, calc(100vw - 24px))', height: 'calc(100vh - 32px)', maxHeight: 'none' }}>
        <header className="dw-h">
          <div className="grow">
            <h2>Choose the place on the map</h2>
            <div className="sub">{engine === 'mappls' ? 'Mappls · search, then move the map so the pin sits on the spot' : 'Search, or click the map / drag the pin to the exact spot'}</div>
          </div>
          <button className="icon-btn x" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </header>

        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {notice && <div className="small" style={{ padding: '8px 16px', background: 'var(--warn-bg, #fff7e6)' }}>{notice}</div>}
          {engine === 'osm' && (
            <div style={{ position: 'absolute', top: 12, left: 60, right: 12, zIndex: 500, maxWidth: 480 }}>
              <input className="inp" value={q} autoComplete="off" aria-label="Search the map" placeholder="Search a place or an address"
                style={{ boxShadow: 'var(--sh-2)' }} onChange={(e) => setQ(e.target.value)} />
              {(hits.length > 0 || searching) && (
                <div className="card" style={{ marginTop: 6, maxHeight: 280, overflow: 'auto', boxShadow: 'var(--sh-2)' }}>
                  <ul className="list">
                    {hits.map((p) => (
                      <li key={p.id} className="click" onClick={() => goTo(p)}>
                        <span className="grow"><span className="t1">{p.name}</span><span className="t2">{lineOf(p)}</span></span>
                      </li>
                    ))}
                    {searching && <li className="muted" style={{ padding: 12 }}>Searching…</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div ref={box} style={{ flex: 1, minHeight: 300 }} />
        </div>

        <footer className="dw-f" style={{ alignItems: 'center' }}>
          <Icon name="pin" />
          <div className="grow" style={{ minWidth: 0 }}>
            {looking ? <span className="muted">Finding the address…</span>
              : problem ? <span style={{ color: 'var(--bad)' }}>{problem}</span>
              : picked && picked.lat ? (
                <>
                  <b>{picked.name || 'Pinned place'}</b>
                  <div className="small muted ellip">{picked.address || `${picked.lat}, ${picked.lon}`}</div>
                </>
              ) : <span className="muted">{engine === 'mappls' ? 'Search or move the map, then press Use this place.' : 'Click the map to drop the pin.'}</span>}
          </div>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="ok" icon="check" disabled={!ready} onClick={use}>Use this place</Btn>
        </footer>
      </div>
    </>,
    document.body,
  );
}
