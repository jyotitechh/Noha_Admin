/* Helpers the sample-data generator needs, lifted from the prototype's
   admin/_src/10-core.js so that server/seed/data.js runs unchanged in Node.
   Keeping them identical means the React console shows exactly the same
   sample register, receipts and profiles as the HTML prototype. */

/* Time. The prototype is pinned to Friday 9 October 2026, 10:30 IST so the
   sample data stays consistent between runs. */
export const NOW = new Date(2026, 9, 9, 10, 30, 0);
const T0 = Date.now();
export const now = () => new Date(+NOW + (Date.now() - T0));
export const MIN = 6e4;
export const HR = 36e5;
export const DAY = 864e5;
export const hAgo = (h) => new Date(+NOW - h * HR);
export const dAgo = (d) => new Date(+NOW - d * DAY);
export const dAhead = (d) => new Date(+NOW + d * DAY);
export const at = (d, h, m) => { const x = new Date(d); x.setHours(h, m || 0, 0, 0); return x; };

/* Seeded random numbers, so the sample data is identical on every boot. */
let _seed = 20260922;
export const rnd = () => {
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
export const pick = (a) => a[Math.floor(rnd() * a.length)];
export const chance = (p) => rnd() < p;
export const pickW = (pairs) => {
  const t = sum(pairs, (p) => p[1]);
  let x = rnd() * t;
  for (const p of pairs) if ((x -= p[1]) < 0) return p[0];
  return pairs[0][0];
};
export const shuffle = (a) => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const sum = (a, f) => a.reduce((t, x) => t + (f ? f(x) : x), 0);
export const uniq = (a) => Array.from(new Set(a));
export const byId = (a, id) => a.find((x) => String(x.id) === String(id));
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/* Date formatters. The generator uses a couple of these to build ids and
   audit-log strings, so they must match the prototype's output exactly. */
export const fd = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const fds = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const ft = (d) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
