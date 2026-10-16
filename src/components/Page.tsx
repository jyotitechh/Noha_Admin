/* The heading and tab strip at the top of every area, and the panel that
   stands in for a screen that is routed but not yet built. */

import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/state/auth';
import { useQueues } from '@/state/queues';
import type { ModuleDef, TabDef } from '@/modules/registry';
import { Icon, Empty, Note } from './ui';

export function PageHeader({ mod, tab, actions }: { mod: ModuleDef; tab?: TabDef; actions?: ReactNode }) {
  const { can } = useAuth();
  const { byId } = useQueues();
  const { '*': _rest } = useParams();

  return (
    <>
      <div className="ph">
        <div className="grow">
          <h1>{mod.title}</h1>
          <div className="meta">
            {mod.sec && <span className="sec-ref" title="Engineering brief section">§{mod.sec}</span>}
            {mod.badges?.map((id) => {
              const q = byId[id];
              if (!q?.count) return null;
              return <span key={id} className="chip warn"><Icon name="clock" />{q.count} waiting</span>;
            })}
          </div>
          {mod.desc && <p className="desc">{mod.desc}</p>}
        </div>
        {actions && <div className="acts">{actions}</div>}
      </div>

      {mod.tabs.length > 1 && (
        <nav className="tabs" aria-label={`${mod.title} sections`}>
          {mod.tabs.map((t) => {
            const allowed = can(t.perm);
            const on = t.id === tab?.id;
            return (
              <Link key={t.id} to={`/${mod.id}/${t.id}`} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
                {t.label}
                {t.status === 'planned' && <span className="cnt" title="Routed, not built yet">·</span>}
                {!allowed && <Icon name="lock" className="lock" />}
              </Link>
            );
          })}
        </nav>
      )}

      {tab?.desc && (
        <p className="muted small" style={{ margin: '-6px 0 14px', maxWidth: '90ch' }}>{tab.desc}</p>
      )}
    </>
  );
}

/** Shown where a tab is routed but not yet built, so nothing is a dead end. */
export function Planned({ mod, tab }: { mod: ModuleDef; tab: TabDef }) {
  return (
    <div className="stack">
      <Note tone="mute" icon="layers">
        <b>Not built yet in this React console.</b> This screen is routed, and the
        data behind it is already in the API, but the screen itself has not been
        written. {tab.from && <>It comes from <b>{tab.from}</b> in the HTML prototype at <code className="mono">admin/index.html</code>, which still works and can be opened alongside this one.</>}
      </Note>

      <div className="card">
        <Empty icon={mod.icon} title={tab.label}>
          {tab.desc}
        </Empty>
      </div>
    </div>
  );
}

export function NoAccess({ perm, youAre }: { perm: string | string[]; youAre: string }) {
  const first = ([] as string[]).concat(perm)[0];
  return (
    <div className="card">
      <Empty icon="lock" title="You do not have access to this section">
        It needs the permission “{first}”. You are viewing as {youAre}.
        <br />
        The same check runs on the server, so anything not granted is refused there too.
      </Empty>
    </div>
  );
}
