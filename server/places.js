/* Finding a place on the map, for an event's location.

   The office types a place or an address and picks one from what comes back; the console keeps its name, its
   address and its latitude and longitude. The search is OpenStreetMap's (Nominatim): free and with no key, which is
   why it is asked for here, on the server, and not from the browser: it asks for one request a second at most, a
   named application and no repeating the same search, so searches are spaced and remembered for ten minutes.

   PLACES_BASE_URL points it somewhere else (the offline stand-in, or a Nominatim of the church's own). Google Places
   or Mapbox would be a replacement for `searchPlaces` and nothing else: the rest only sees { id, name, area, city,
   state, country, address, lat, lon }. */

const base = () => String(process.env.PLACES_BASE_URL || 'https://nominatim.openstreetmap.org').trim().replace(/\/+$/, '');
const custom = () => !!String(process.env.PLACES_BASE_URL || '').trim();

const GAP_MS = 1100;
const KEEP_MS = 10 * 60 * 1000;
const cache = new Map();
let lastCall = 0;
let chain = Promise.resolve();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class PlaceError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** One at a time, a second apart, for the public server. */
const spaced = (fn) => {
  const run = chain.then(async () => {
    if (!custom()) {
      const wait = lastCall + GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
    }
    lastCall = Date.now();
    return fn();
  });
  chain = run.catch(() => {});
  return run;
};

const first = (...v) => v.map((x) => String(x ?? '').trim()).find(Boolean) || '';
const coord = (n) => String(Math.round(Number(n) * 1e6) / 1e6);

function shape(r) {
  const a = r.address || {};
  const name = first(r.name, a.amenity, a.building, a.road, String(r.display_name || '').split(',')[0]);
  return {
    id: first(r.osm_type && r.osm_id ? `${r.osm_type}:${r.osm_id}` : r.place_id),
    name,
    area: first(a.suburb, a.neighbourhood, a.quarter, a.city_district, a.village, a.hamlet),
    city: first(a.city, a.town, a.municipality, a.county, a.state_district),
    state: first(a.state, a.region),
    country: first(a.country),
    address: first(r.display_name),
    lat: coord(r.lat),
    lon: coord(r.lon),
  };
}

/** Places matching what was typed, best first. At most six. */
export async function searchPlaces(query) {
  const q = String(query ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (q.length < 3) return [];
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.rows;

  const url = new URL(base() + '/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '6');
  url.searchParams.set('accept-language', 'en');

  const rows = await spaced(async () => {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': 'KarunaSadanAdminConsole/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    } catch (err) {
      console.error(`[places] search failed: ${err.message}`);
      throw new PlaceError(503, 'Place search is not available right now. Try again in a moment.');
    }
    if (!res.ok) {
      console.error(`[places] search answered ${res.status}`);
      throw new PlaceError(503, 'Place search is not available right now. Try again in a moment.');
    }
    const body = await res.json().catch(() => []);
    return (Array.isArray(body) ? body : [])
      .filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)))
      .map(shape)
      .filter((p, i, all) => p.name && all.findIndex((x) => x.id === p.id) === i);
  });

  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), rows });
  return rows;
}
