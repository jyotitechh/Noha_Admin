/* Routing.

   One route pattern, /:mod/:tab, resolved against the module registry. A tab
   with a screen in SCREENS renders it; a tab without one renders <Planned>,
   which says what it will hold and which prototype screen it comes from.
   That way the navigation never offers a dead end. */

import { Suspense, lazy, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/state/auth';
import { QueuesProvider } from '@/state/queues';
import { ToastProvider } from '@/components/layers';
import { Shell } from '@/components/Shell';
import { PageHeader, Planned, NoAccess } from '@/components/Page';
import { Loading } from '@/components/ui';
import { MODULES, moduleById } from '@/modules/registry';
import SignIn from '@/modules/SignIn';

/* Screens that exist, keyed by "<module>/<tab>". */
const SCREENS: Record<string, ComponentType> = {
  'dashboard/main': lazy(() => import('@/modules/Dashboard')),
  'queues/main': lazy(() => import('@/modules/Queues')),

  'members/registrations': lazy(() => import('@/modules/members/Registrations')),
  'members/approved': lazy(() => import('@/modules/members/Approved')),
  'approles/people': lazy(() => import('@/modules/approles/People')),
  'members/register': lazy(() => import('@/modules/members/Register')),

  'community/prayer-inbox': lazy(() => import('@/modules/community/PrayerInbox')),
  'community/queue': lazy(() => import('@/modules/community/Moderation')),
  'community/flagged': lazy(() => import('@/modules/community/Flagged')),
  'community/praise': lazy(() => import('@/modules/community/Praise')),

  /* Authoring: every one of these is a ContentManager, drawn from the server's
     definitions. See modules/content/screens.tsx. */
  'content/manna': lazy(() => import('@/modules/content/screens').then((m) => ({ default: m.Manna }))),
  'content/prayers': lazy(() => import('@/modules/content/screens').then((m) => ({ default: m.Prayers }))),
  'content/confessions': lazy(() => import('@/modules/content/screens').then((m) => ({ default: m.Confessions }))),
  'content/dictionary': lazy(() => import('@/modules/content/screens').then((m) => ({ default: m.Dictionary }))),
  'content/announce': lazy(() => import('@/modules/content/Announce')),
  'media/noahgram': lazy(() => import('@/modules/content/screens').then((m) => ({ default: m.Noahgram }))),
  'media/noahtube': lazy(() => import('@/modules/content/screens').then((m) => ({ default: m.NoahTube }))),
  'school/bibleschool': lazy(() => import('@/modules/content/screens').then((m) => ({ default: m.BibleSchool }))),
  'school/courses': lazy(() => import('@/modules/content/screens').then((m) => ({ default: m.Courses }))),

  'events/events': lazy(() => import('@/modules/events/Events')),
  'events/passes': lazy(() => import('@/modules/events/Passes')),

  'finance/receipts': lazy(() => import('@/modules/finance/Receipts')),

  'comms/threads': lazy(() => import('@/modules/comms/Threads')),
  'ops/store': lazy(() => import('@/modules/ops/Store')),

  'jverify/queue': lazy(() => import('@/modules/jodie/VerifyQueue')),
  'jverify/done': lazy(() => import('@/modules/jodie/VerifyDone')),
  'jodie/profiles': lazy(() => import('@/modules/jodie/Profiles')),
  'jodie/blocked': lazy(() => import('@/modules/jodie/Blocked')),

  'subs/subscriptions': lazy(() => import('@/modules/subs/Subscriptions')),
  'subs/plans': lazy(() => import('@/modules/subs/Plans')),
  'subs/dunning': lazy(() => import('@/modules/subs/Dunning')),

  'staff/accounts': lazy(() => import('@/modules/staff/Accounts')),
  'staff/roles': lazy(() => import('@/modules/staff/Roles')),
  'staff/coverage': lazy(() => import('@/modules/staff/Coverage')),

  'audit/log': lazy(() => import('@/modules/Audit')),
  'reports/library': lazy(() => import('@/modules/Reports')),
};

/** Resolves /:mod/:tab and renders the right screen inside the page header. */
function ModulePage() {
  const { mod: modId, tab: tabId } = useParams();
  const { can, user } = useAuth();

  const mod = moduleById(modId || '');
  if (!mod) return <Navigate to="/dashboard" replace />;

  /* No tab in the URL: open the first one this role may see. */
  if (!tabId) {
    const first = mod.tabs.find((t) => can(t.perm)) ?? mod.tabs[0];
    return <Navigate to={`/${mod.id}/${first.id}`} replace />;
  }

  const tab = mod.tabs.find((t) => t.id === tabId);
  if (!tab) return <Navigate to={`/${mod.id}`} replace />;

  const Screen = SCREENS[`${mod.id}/${tab.id}`];

  return (
    <>
      <PageHeader mod={mod} tab={tab} />
      {!can(mod.perm) || !can(tab.perm) ? (
        <NoAccess perm={tab.perm ?? mod.perm ?? ''} youAre={user?.roleName ?? 'this role'} />
      ) : Screen ? (
        <Suspense fallback={<div className="card"><Loading what={tab.label.toLowerCase()} /></div>}>
          <Screen />
        </Suspense>
      ) : (
        <Planned mod={mod} tab={tab} />
      )}
    </>
  );
}

function Routed() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <Loading what="the console" />
      </div>
    );
  }

  if (!user) return <SignIn />;

  return (
    <QueuesProvider>
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/:mod" element={<ModulePage />} />
          <Route path="/:mod/:tab" element={<ModulePage />} />
          {/* Deeper paths keep the tab and let the screen read the rest. */}
          <Route path="/:mod/:tab/*" element={<ModulePage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Shell>
    </QueuesProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routed />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

/* Re-exported so the registry and the router cannot drift apart unnoticed. */
export const SCREEN_KEYS = Object.keys(SCREENS);
export const ALL_TAB_KEYS = MODULES.flatMap((m) => m.tabs.map((t) => `${m.id}/${t.id}`));
