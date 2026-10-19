/* Formatting, ported from the prototype's admin/_src/10-core.js so numbers,
   money, dates and ages read exactly as they did there.

   Indian conventions throughout: lakh/crore grouping, rupees, 24-hour clock,
   day-month-year. */

export const num = (n: number) => Number(n).toLocaleString('en-IN');

export const inr = (n: number, dp = 0) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** Short money: ₹1.2 Cr, ₹3.4 L, ₹12.5k, ₹900. */
export function inrS(n: number): string {
  const v = Number(n);
  const a = Math.abs(v);
  if (a >= 1e7) return '₹' + (v / 1e7).toFixed(2) + ' Cr';
  if (a >= 1e5) return '₹' + (v / 1e5).toFixed(1) + ' L';
  if (a >= 1e4) return '₹' + (v / 1e3).toFixed(1) + 'k';
  return inr(v);
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
export const plural = (n: number, w: string, ws?: string) => num(n) + ' ' + (n === 1 ? w : ws || w + 's');
export const sum = <T,>(a: T[], f?: (x: T) => number) => a.reduce<number>((t, x) => t + (f ? f(x) : (x as unknown as number)), 0);

/* ---------- dates ---------- */

const D = (d: Date | string | number | null | undefined) => {
  if (d instanceof Date) return Number.isNaN(+d) ? null : d;
  if (!d) return null;
  const parsed = new Date(d);
  return Number.isNaN(+parsed) ? null : parsed;
};

/* Every formatter takes a date that might not be there.

   Real records are full of blanks — a member who has entered their phone
   number and nothing else has no date of birth and no joining date. The seed
   never had those gaps, so the first run against live data crashed a whole
   table on one null. A missing date is not an error; it renders as a dash. */
export type MaybeDate = Date | string | number | null | undefined;

const EMPTY = '—';
const fmt = (d: MaybeDate, f: (d: Date) => string) => {
  const dt = D(d);
  return dt ? f(dt) : EMPTY;
};

export const fd = (d: MaybeDate) => fmt(d, (x) => x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
export const fds = (d: MaybeDate) => fmt(d, (x) => x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
export const ft = (d: MaybeDate) => fmt(d, (x) => x.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }));
export const fdt = (d: MaybeDate) => (D(d) ? fds(d) + ', ' + ft(d) : EMPTY);
export const fwd = (d: MaybeDate) => fmt(d, (x) => x.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }));
export const flong = (d: MaybeDate) =>
  fmt(d, (x) => x.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

const MIN = 6e4;

/* The sample data is pinned to Friday 9 October 2026, 10:30 IST and moves
   forward in real time from the moment the page loaded, matching the API. */
const PINNED = new Date(2026, 9, 9, 10, 30, 0);
const LOADED = Date.now();
export const now = () => new Date(+PINNED + (Date.now() - LOADED));

/** "12 min ago", "3 h ago", "4 d ago", then the date. */
export function since(d: MaybeDate): string {
  const dt = D(d);
  if (!dt) return '—';
  const m = (+now() - +dt) / MIN;
  if (m < 1) return 'just now';
  if (m < 60) return Math.round(m) + ' min ago';
  const h = m / 60;
  if (h < 24) return Math.round(h) + ' h ago';
  const dd = h / 24;
  if (dd < 30) return Math.round(dd) + ' d ago';
  return fd(dt);
}

export function until(d: MaybeDate): string {
  const dt = D(d);
  if (!dt) return '—';
  const h = (+dt - +now()) / 36e5;
  if (h < 0) return 'overdue';
  if (h < 24) return 'in ' + Math.round(h) + ' h';
  return 'in ' + Math.round(h / 24) + ' d';
}

export const ageH = (d: MaybeDate) => { const dt = D(d); return dt ? (+now() - +dt) / 36e5 : 0; };

/** How long something has been waiting: "40 min", "6 h", "3 d". */
export function ageTxt(d: MaybeDate): string {
  const dt = D(d);
  if (!dt) return '—';
  const h = ageH(dt);
  if (h < 1) return Math.max(1, Math.round(h * 60)) + ' min';
  if (h < 48) return Math.round(h) + ' h';
  return Math.round(h / 24) + ' d';
}

/** ok / warn / bad, by how far past the warn and bad thresholds (hours). */
export function ageCls(d: MaybeDate, warn = 24, bad = 48): 'ok' | 'warn' | 'bad' {
  const dt = D(d);
  if (!dt) return 'ok';
  const h = ageH(dt);
  return h >= bad ? 'bad' : h >= warn ? 'warn' : 'ok';
}

/* ---------- people ---------- */

const HUES = [268, 292, 318, 342, 206, 228, 170, 26];

/** A stable colour per name, so the same person is the same colour everywhere. */
export function hue(s: string): number {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

export const initials = (n: string) =>
  String(n)
    .replace(/^(Ps\.|Dr\.|Bro\.|Sis\.|Rev\.)\s*/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/* ---------- status words ---------- */

/* The prototype coloured status words by meaning rather than by column, so a
   "Pending" reads the same whether it is a receipt or a profile. */
const GOOD = ['Active', 'Paid', 'Approved', 'Published', 'Verified', 'Delivered', 'Reconciled', 'Done', 'Processed', 'Sent', 'Live', 'Completed', 'Resolved', 'Answered', 'Synced', 'Healthy', 'Admitted', 'Cleared', 'Issued', 'Posted', 'Matched', 'Renewed', 'Reached', 'Followed up'];
const WAIT = ['Pending', 'Pending approval', 'Scheduled', 'In progress', 'Draft', 'Waiting', 'Open', 'Processing', 'Review', 'Grace', 'Judging', 'Part paid', 'Due', 'To do', 'Unreconciled', 'Awaiting dispatch', 'Retrying', 'Callback', 'Shipped', 'Unmatched'];
const BAD = ['Failed', 'Rejected', 'Returned', 'Overdue', 'Past due', 'Suspended', 'Blocked', 'Bounced', 'Expired', 'Declined', 'Degraded', 'Removed', 'Not reached', 'videoReturned'];
const MUTE = ['Archived', 'Cancelled', 'Hidden', 'Deceased', 'Closed', 'Inactive', 'Skipped', 'Not started', 'Withdrawn', 'Ended', 'Retired', 'None', 'Paused', 'Unpublished', 'No action'];

export type Tone = 'ok' | 'warn' | 'bad' | 'mute' | 'info';

export function tone(status: string): Tone {
  const s = String(status);
  if (GOOD.includes(s)) return 'ok';
  if (WAIT.includes(s)) return 'warn';
  if (BAD.includes(s)) return 'bad';
  if (MUTE.includes(s)) return 'mute';
  return 'info';
}

/** Workflow words the API uses, in the wording the office reads. */
export const REG_STATE: Record<string, string> = {
  pending: 'Waiting',
  approved: 'Approved',
  videoReturned: 'Video returned',
  rejected: 'Rejected',
  draft: 'Not submitted',
};
