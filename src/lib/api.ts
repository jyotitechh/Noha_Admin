/* The console's only way of reaching the server.

   Every screen goes through here, so swapping the mock API for a real backend
   is a change to BASE and to the sign-in calls, not to the screens. */

/* Where the API lives.

   Empty in development: Vite proxies /api to localhost:4000, so same-origin.
   In a deployment where the server is NOT on the same host — the console on
   Vercel, the API elsewhere — set VITE_API_BASE at build time to that
   server's origin, for example https://ksm-api.onrender.com

   It is baked into the bundle at build time, so it must be a URL and never a
   secret. Anything the browser holds, anyone can read. */
const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '') + '/api';
const TOKEN_KEY = 'ksm-admin-token';

export const getToken = () => {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
};
export const setToken = (t: string) => {
  try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* private window */ }
};

/** Thrown for any non-2xx reply, carrying what the server said. */
export class ApiError extends Error {
  status: number;
  needs?: string[];
  youAre?: string;
  constructor(status: number, message: string, extra?: { needs?: string[]; youAre?: string }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.needs = extra?.needs;
    this.youAre = extra?.youAre;
  }
}

/* The API sends dates as ISO strings. Turning them back into Date objects
   here means the screens never have to think about it. */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const revive = (_k: string, v: unknown) => (typeof v === 'string' && ISO.test(v) ? new Date(v) : v);

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...init.headers,
    },
  });

  const text = await res.text();

  /* The API always answers JSON. Anything else means the request never
     reached it — a host's own 404 page, a proxy error, a sign-in redirect.
     Parsing that raw gives "Unexpected token 'T'", which sends you looking
     for an expired token instead of a missing server. */
  let body: ReturnType<typeof JSON.parse> = null;
  if (text) {
    try {
      body = JSON.parse(text, revive);
    } catch {
      throw new ApiError(
        res.status,
        res.status === 404
          ? `No API is running at ${BASE}${path}. The page is deployed but its server is not: ${
            text.trim().slice(0, 80)
          }`
          : `The server replied with ${res.status} and something that is not JSON: ${
            text.trim().slice(0, 80)
          }`,
      );
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, body?.error || `Request failed (${res.status}).`, {
      needs: body?.needs,
      youAre: body?.youAre,
    });
  }
  return body as T;
}

export const api = {
  get: <T,>(path: string) => call<T>(path),
  post: <T,>(path: string, body?: unknown) => call<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T,>(path: string, body?: unknown) => call<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
};

/* ---------- shapes ---------- */

export interface User {
  id: string; name: string; title: string; email: string;
  /* The number they signed in with, and where their access comes from:
     'catalyst' (given in the console), 'catalyst-flag' (the office's own
     super-admin flag), 'test' or 'sample'. */
  mobile?: string; source?: string;
  role: string; roleName: string; perms: string[];
}

export interface Page<T> {
  rows: T[]; total: number; offset: number; limit: number;
  /* Set when Catalyst is connected but this collection has no table there.
     The screen says so rather than showing an empty list that looks like a
     filter returned nothing. */
  notInProject?: boolean;
  message?: string;
  /* Where to look instead, when there is somewhere. */
  instead?: string | null;
}

export interface Queue {
  id: string; l: string; area: string; icon: string; to: string;
  perm: string | string[]; owner: string; sla: number; hot?: boolean;
  count: number; oldest: Date | null;
}

/** Build a query string, dropping empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? '?' + s : '';
}

/** Read a seed collection, with optional search, filters, sort and paging. */
export const collection = <T,>(name: string, params: Record<string, string | number | boolean | undefined | null> = {}) =>
  api.get<Page<T>>(`/data/${name}${qs(params)}`);
