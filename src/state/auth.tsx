/* Who is signed in, and what they may do.

   NO ZOHO SINGLE SIGN-ON. Sign-in is the local email + one-time-code flow in
   server/auth.js. When Zoho SSO goes in, replace `requestCode` and `verify`
   with the Zoho redirect and callback — `can`, `user` and everything that
   reads them stay as they are.

   `can` mirrors the server's check exactly. Hiding a button is a courtesy;
   the API refuses the call either way. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken, type User } from '@/lib/api';

interface AuthValue {
  user: User | null;
  loading: boolean;
  /** True when the signed-in role holds any one of `perm`. */
  can: (perm?: string | string[]) => boolean;
  requestCode: (email: string) => Promise<{ name: string; devCode: string }>;
  verify: (email: string, code: string) => Promise<void>;
  viewAs: (role: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /* Pick up an existing session on reload. */
  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api.get<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setToken(''))
      .finally(() => setLoading(false));
  }, []);

  const requestCode = useCallback(async (email: string) => {
    const r = await api.post<{ name: string; devCode: string }>('/auth/request-code', { email });
    return r;
  }, []);

  const verify = useCallback(async (email: string, code: string) => {
    const r = await api.post<{ token: string; user: User }>('/auth/verify', { email, code });
    setToken(r.token);
    setUser(r.user);
  }, []);

  /* Prototype affordance: look at the console as any of the ten roles, to
     show what each one can and cannot reach. The prototype did the same. */
  const viewAs = useCallback(async (role: string) => {
    const r = await api.post<{ user: User }>('/auth/view-as', { role });
    setUser(r.user);
  }, []);

  const signOut = useCallback(async () => {
    try { await api.post('/auth/sign-out'); } catch { /* the session may already be gone */ }
    setToken('');
    setUser(null);
  }, []);

  const can = useCallback(
    (perm?: string | string[]) => {
      if (!perm) return true;
      if (!user) return false;
      return ([] as string[]).concat(perm).some((p) => user.perms.includes(p));
    },
    [user],
  );

  const value = useMemo<AuthValue>(
    () => ({ user, loading, can, requestCode, verify, viewAs, signOut }),
    [user, loading, can, requestCode, verify, viewAs, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>.');
  return v;
}
