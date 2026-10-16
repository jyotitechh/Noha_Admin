/* The frame every screen sits in: sidebar, top bar, breadcrumb, queue bell,
   account menu and the command palette.

   The prototype's sidebar ended with a "Zoho, single sign-on" block of three
   buttons. It is gone: there is no Zoho SSO in this build. In its place the
   foot says how much of the port is built, which is information the people
   using it actually need right now. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/state/auth';
import { useQueues } from '@/state/queues';
import { GROUPS, MODULES, buildProgress, type ModuleDef } from '@/modules/registry';
import { Icon, Avatar, Age } from './ui';
import logo from '@/assets/logo.png';

/* ---------- sidebar ---------- */

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  const { byId } = useQueues();
  const progress = buildProgress();

  const badgeFor = (m: ModuleDef) =>
    (m.badges ?? []).reduce((n, id) => n + (byId[id]?.count ?? 0), 0);

  return (
    <aside className="side" aria-label="Main navigation">
      <div className="brand">
        <img src={logo} alt="" />
        <div>
          <b>Karuna Sadan</b>
          <span>Admin console · Noah and Jodie</span>
        </div>
      </div>

      <nav className="nav">
        {GROUPS.map(([group, label]) => {
          const mods = MODULES.filter((m) => m.group === group && can(m.perm));
          if (!mods.length) return null;
          return (
            <div key={group}>
              <h6>{label}</h6>
              {mods.map((m) => {
                const n = badgeFor(m);
                return (
                  <NavLink key={m.id} to={'/' + m.id} className={({ isActive }) => (isActive ? 'on' : '')} onClick={onNavigate}>
                    <Icon name={m.icon} />
                    <span className="grow ellip">{m.nav || m.title}</span>
                    {n > 0 && <span className={'cnt' + (m.hot ? ' hot' : '')} title={`${n} open items`}>{n > 999 ? '999+' : n}</span>}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="side-foot">
        <h6>This build</h6>
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--side-fg-2)', lineHeight: 1.55 }}>
          {progress.built} of {progress.total} screens built against the API.
          The rest are routed and say what they will hold.
          <br />
          <span style={{ color: 'var(--side-fg-3)' }}>Zoho single sign-on is not wired up.</span>
        </p>
      </div>
    </aside>
  );
}

/* ---------- queue bell ---------- */

function QueueBell() {
  const { queues, total } = useQueues();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const waiting = queues.filter((q) => q.count > 0).sort((a, b) => b.count - a.count);

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" aria-label={`Work queues, ${total} waiting`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" />
        {total > 0 && <span className="dot">{total > 99 ? '99+' : total}</span>}
      </button>

      {open && (
        <div className="pop" style={{ right: 0, width: 380 }} role="menu">
          <div className="card-h" style={{ padding: '12px 16px 8px' }}>
            <div className="grow">
              <h3>Waiting for a decision</h3>
              <div className="sub">{total} items across {waiting.length} queues</div>
            </div>
          </div>
          <ul className="list" style={{ maxHeight: 420, overflow: 'auto' }}>
            {waiting.slice(0, 12).map((q) => (
              <li key={q.id}>
                <Link to={q.to} onClick={() => setOpen(false)} style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', textDecoration: 'none', color: 'inherit' }}>
                  <span className={'qi ' + (q.sla && q.oldest && (Date.now() - +q.oldest) / 36e5 > q.sla ? 'bad' : 'warn')}>
                    <Icon name={q.icon} />
                  </span>
                  <span className="grow">
                    <span className="t1" style={{ display: 'block' }}>{q.l}</span>
                    <span className="t2">{q.area} · oldest <Age at={q.oldest} warn={q.sla} bad={q.sla * 2} /></span>
                  </span>
                  <b className="tnum">{q.count}</b>
                </Link>
              </li>
            ))}
            {!waiting.length && <li className="muted" style={{ padding: 18 }}>Nothing is waiting. </li>}
          </ul>
          <div className="card-f">
            <Link to="/queues" onClick={() => setOpen(false)}>Open all queues</Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- account menu ---------- */

function MeMenu() {
  const { user, viewAs, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  if (!user) return null;

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="me-btn" aria-label="Account and role" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Avatar name={user.name} />
        <div className="nm">
          <b>{user.name}</b>
          <span>{user.roleName}</span>
        </div>
        <Icon name="chev-d" />
      </button>

      {open && (
        <div className="pop" style={{ right: 0, width: 320 }} role="menu">
          <div style={{ padding: '14px 16px 10px' }}>
            <b style={{ display: 'block' }}>{user.name}</b>
            <span className="small muted">{user.email}</span>
          </div>
          <hr />
          <div style={{ padding: '10px 16px 6px' }}>
            <div className="small b mb8">View the console as</div>
            <select
              className="sel"
              value={user.role}
              onChange={async (e) => { await viewAs(e.target.value); setOpen(false); }}
            >
              {ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <p className="xs muted mt8" style={{ margin: '8px 0 0' }}>
              Changes what you can reach, here and on the server. {user.perms.length} of 36 permissions held.
            </p>
          </div>
          <hr />
          <button
            className="btn ghost"
            style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0, height: 40 }}
            onClick={async () => { await signOut(); nav('/'); }}
          >
            <Icon name="logout" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/* The ten roles. Fetched once and cached, because they never change in a session. */
let ROLE_OPTIONS: { id: string; name: string }[] = [];
export const setRoleOptions = (r: { id: string; name: string }[]) => { ROLE_OPTIONS = r; };

/* ---------- command palette ---------- */

function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const { can } = useAuth();

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pages = MODULES.filter((m) => can(m.perm)).flatMap((m) =>
      m.tabs.map((t) => ({
        id: m.id + '/' + t.id,
        title: t.label,
        sub: m.title,
        icon: m.icon,
        to: `/${m.id}/${t.id}`,
        planned: t.status === 'planned',
      })),
    );
    if (!needle) return pages.slice(0, 10);
    return pages.filter((p) => (p.title + ' ' + p.sub).toLowerCase().includes(needle)).slice(0, 14);
  }, [q, can]);

  useEffect(() => { if (open) setQ(''); }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!open) return null;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="pal" role="dialog" aria-modal="true" aria-label="Search">
        <div className="pal-in">
          <Icon name="search" />
          <input autoFocus value={q} placeholder="Go to a screen" aria-label="Search the console" onChange={(e) => setQ(e.target.value)} />
          <kbd>Esc</kbd>
        </div>
        <div className="pal-res">
          {results.map((r) => (
            <button key={r.id} className="pal-i" onClick={() => { nav(r.to); onClose(); }}>
              <Icon name={r.icon} />
              <span className="grow">
                <b>{r.title}</b>
                <span className="muted small"> · {r.sub}</span>
              </span>
              {r.planned && <span className="chip plain">Planned</span>}
            </button>
          ))}
          {!results.length && <div className="empty">Nothing matches “{q}”.</div>}
        </div>
      </div>
    </>
  );
}

/* ---------- shell ---------- */

export function Shell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [palette, setPalette] = useState(false);

  /* Ctrl/Cmd+K opens the palette, as the top bar advertises. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const [modId, tabId] = loc.pathname.replace(/^\//, '').split('/');
  const mod = MODULES.find((m) => m.id === modId);
  const tab = mod?.tabs.find((t) => t.id === tabId);

  return (
    <div className={'app' + (navOpen ? ' nav-open' : '')} id="app">
      <Nav onNavigate={() => setNavOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn burger" aria-label="Open navigation" onClick={() => setNavOpen((o) => !o)}>
            <Icon name="menu" />
          </button>

          <div className="crumb" id="crumb">
            {mod ? (
              <>
                {mod.group === 'work' ? 'Workspace' : mod.group === 'noah' ? 'Noah' : mod.group === 'jodie' ? 'Jodie' : 'Administration'}
                <Icon name="chev-r" />
                {tab && mod.tabs.length > 1 ? (
                  <>
                    <Link to={'/' + mod.id} style={{ color: 'inherit', textDecoration: 'none' }}>{mod.title}</Link>
                    <Icon name="chev-r" />
                    <b>{tab.label}</b>
                  </>
                ) : (
                  <b>{mod.title}</b>
                )}
              </>
            ) : (
              <b>Karuna Sadan</b>
            )}
          </div>

          <button className="search-btn" aria-label="Search" onClick={() => setPalette(true)}>
            <Icon name="search" />
            <span className="lbl">Go to a screen</span>
            <kbd>Ctrl K</kbd>
          </button>

          <span className="sp" style={{ flex: 1 }} />
          <span className="proto-pill" title="Every name, number and amount on these screens is sample data.">
            Prototype · sample data
          </span>
          <QueueBell />
          <MeMenu />
        </header>

        <main className="view" id="view" tabIndex={-1}>{children}</main>
      </div>

      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} style={{ zIndex: 25 }} />}
      <Palette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
