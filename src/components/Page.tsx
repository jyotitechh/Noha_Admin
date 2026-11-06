/* The heading and tab strip at the top of every area. */

import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/state/auth';
import { useQueues } from '@/state/queues';
import { shownTabs, type ModuleDef, type TabDef } from '@/modules/registry';
import { Icon, Empty } from './ui';

export function PageHeader({ mod, tab, actions }: { mod: ModuleDef; tab?: TabDef; actions?: ReactNode }) {
  const { can } = useAuth();
  const { byId } = useQueues();
  const { '*': _rest } = useParams();
  const tabs = shownTabs(mod);
  /* One line under the heading: the tab's own, else the area's. */
  const desc = tab?.desc || mod.desc;

  return (
    <>
      <div className="ph">
        <div className="grow">
          <h1>{mod.title}</h1>
          <div className="meta">
            {mod.badges?.map((id) => {
              const q = byId[id];
              if (!q?.count) return null;
              return <span key={id} className="chip warn"><Icon name="clock" />{q.count} waiting</span>;
            })}
          </div>
          {desc && <p className="desc">{desc}</p>}
        </div>
        {actions && <div className="acts">{actions}</div>}
      </div>

      {tabs.length > 1 && (
        <nav className="tabs" aria-label={`${mod.title} sections`}>
          {tabs.map((t) => {
            const allowed = can(t.perm);
            const on = t.id === tab?.id;
            return (
              <Link key={t.id} to={`/${mod.id}/${t.id}`} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
                {t.label}
                {!allowed && <Icon name="lock" className="lock" />}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}

export function NoAccess({ youAre }: { perm: string | string[]; youAre: string }) {
  return (
    <div className="card">
      <Empty icon="lock" title="You do not have access to this section">
        Your role ({youAre}) does not include it. Ask a super administrator if you need it.
      </Empty>
    </div>
  );
}
