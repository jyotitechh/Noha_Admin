/* Who is signed in, and what they may do.

   NO ZOHO SINGLE SIGN-ON. Sign-in is the local mobile-or-email + one-time-code
   flow in server/auth.js. When Zoho SSO goes in, replace `requestCode` and `verify`
   with the Zoho redirect and callback — `can`, `user` and everything that
   reads them stay as they are.

   `can` mirrors the server's check exactly. Hiding a button is a courtesy;
   the API refuses the call either way. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken, type User } from '@/lib/api';
import { forgetMemberPhotos } from '@/components/MemberPhoto';

/** How someone signs in: by mobile number (a code is texted) or by email (a code is emailed). */
export type Identity = { mobile: string; email?: undefined } | { email: string; mobile?: undefined };

export interface CodeSent {
  name: string;
  devCode?: string;
  test?: boolean;
  via?: 'sms' | 'email';
  sentTo?: string;
  resendAfterSeconds?: number;
}

interface AuthValue {
  user: User | null;
  loading: boolean;
  /** The server could not be reached to check the saved login. The login is kept; `retry` tries again. */
  unreachable: boolean;
  retry: () => Promise<void>;
  /** True when the signed-in role holds any one of `perm`. */
  can: (perm?: string | string[]) => boolean;
  /* `devCode` is only present when nothing was really sent: no SMS or email
     set up on the server, and test accounts outside production. `via` and
     `sentTo` say how it went when it was sent. */
  requestCode: (who: Identity, passphrase?: string) => Promise<CodeSent>;
  verify: (who: Identity, code: string) => Promise<void>;
  viewAs: (role: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  /* Set when the saved session could not be checked because the server did not answer: the
     login is KEPT, and the screen offers to try again. */
  const [unreachable, setUnreachable] = useState(false);

  /* Pick up an existing session on reload.

     Refreshing the page must not sign anyone out; only signing out, the tab closing (the token
     lives in sessionStorage) or the server saying the session is no longer valid (401) does.
     A server that is waking up, a dropped connection or a 503 is none of those, so those are
     retried and, if they keep failing, the saved login is kept rather than thrown away. */
  const resume = useCallback(async () => {
    if (!getToken()) { setLoading(false); return; }
    setLoading(true);
    setUnreachable(false);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await api.get<{ user: User }>('/auth/me');
        setUser(r.user);
        setLoading(false);
        return;
      } catch (e) {
        if ((e as { status?: number }).status === 401) { setToken(''); setLoading(false); return; }
        if (attempt < 3) await new Promise((ok) => setTimeout(ok, 1200 * (attempt + 1)));
      }
    }
    setUnreachable(true);
    setLoading(false);
  }, []);

  useEffect(() => { resume(); }, [resume]);

  const requestCode = useCallback(async (who: Identity, passphrase?: string) => {
    return api.post<CodeSent>('/auth/request-code', { ...who, passphrase });
  }, []);

  const verify = useCallback(async (who: Identity, code: string) => {
    const r = await api.post<{ token: string; user: User }>('/auth/verify', { ...who, code });
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
    forgetMemberPhotos();
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
    () => ({ user, loading, unreachable, retry: resume, can, requestCode, verify, viewAs, signOut }),
    [user, loading, unreachable, resume, can, requestCode, verify, viewAs, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>.');
  return v;
}
