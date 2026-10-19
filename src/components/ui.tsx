/* The shared pieces every screen is built from.

   They render the class names in styles/prototype.css, so the React console
   looks the same as the HTML prototype it replaces. Nothing here holds state
   beyond what it is given. */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ICONS } from '@/lib/icons';
import { ageCls, ageTxt, hue, initials, tone, type Tone } from '@/lib/format';

/* ---------- icon ---------- */

/* The prototype used one <svg> sprite. Inlining each icon instead keeps the
   component self-contained; the markup is trusted, it comes from our own
   ICONS table and never from data. */
export function Icon({ name, className, title }: { name: string; className?: string; title?: string }) {
  const path = ICONS[name];
  if (!path) return null;
  return (
    <svg
      className={'i' + (className ? ' ' + className : '')}
      viewBox="0 0 24 24"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      dangerouslySetInnerHTML={{ __html: path }}
    />
  );
}

/* ---------- chip ---------- */

export function Chip({ tone: t = 'mute', icon, dot, children }: { tone?: Tone | 'brand' | 'plain'; icon?: string; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`chip ${t}${dot ? ' dot' : ''}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

/** A status word, coloured by what it means. */
export const Status = ({ children }: { children: string }) => <Chip tone={tone(children)}>{children}</Chip>;

/* ---------- button ---------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'pri' | 'dark' | 'ok' | 'danger' | 'ghost';
  icon?: string;
  sm?: boolean;
};

export function Btn({ variant, icon, sm, children, className, ...rest }: BtnProps) {
  return (
    <button className={['btn', variant, sm && 'sm', className].filter(Boolean).join(' ')} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export function BtnLink({ to, variant, icon, children }: { to: string; variant?: string; icon?: string; children: ReactNode }) {
  return (
    <Link to={to} className={['btn', variant].filter(Boolean).join(' ')}>
      {icon && <Icon name={icon} />}
      {children}
    </Link>
  );
}

/* ---------- note ---------- */

export function Note({ tone: t = 'info', icon, children }: { tone?: 'info' | 'warn' | 'ok' | 'bad' | 'brand' | 'mute'; icon?: string; children: ReactNode }) {
  const fallback = { info: 'info', warn: 'alert', ok: 'check', bad: 'alert', brand: 'sparkles', mute: 'info' }[t];
  return (
    <div className={`note ${t === 'info' ? '' : t}`.trim()}>
      <Icon name={icon || fallback} />
      <div className="grow">{children}</div>
    </div>
  );
}

/* ---------- cards ---------- */

export function Card({ title, sub, actions, children, footer, flush, className }: {
  title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode;
  footer?: ReactNode; flush?: boolean; className?: string;
}) {
  return (
    <section className={['card', className].filter(Boolean).join(' ')}>
      {(title || actions) && (
        <header className="card-h">
          <div className="grow">
            {title && <h3>{title}</h3>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {actions && <div className="r">{actions}</div>}
        </header>
      )}
      {children != null && <div className={'card-b' + (flush ? ' flush' : '')}>{children}</div>}
      {footer && <footer className="card-f">{footer}</footer>}
    </section>
  );
}

/* ---------- KPI tile ---------- */

export function Kpi({ label, value, icon, detail, to, tone: t }: {
  label: string; value: ReactNode; icon?: string; detail?: ReactNode; to?: string; tone?: Tone;
}) {
  const body = (
    <>
      <div className="l">
        {icon && <Icon name={icon} />}
        {label}
      </div>
      <div className="v" style={t === 'warn' ? { color: 'var(--warn)' } : t === 'bad' ? { color: 'var(--bad)' } : undefined}>
        {value}
      </div>
      {detail && <div className="d">{detail}</div>}
    </>
  );
  return to
    ? <Link to={to} className="kpi click" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{body}</Link>
    : <div className="kpi">{body}</div>;
}

export const Kpis = ({ children }: { children: ReactNode }) => <div className="kpis">{children}</div>;

/* ---------- people ---------- */

export const Avatar = ({ name, size }: { name: string; size?: 'sm' | 'lg' }) => (
  <span className={'av' + (size ? ' ' + size : '')} style={{ ['--h' as string]: hue(name) }} aria-hidden="true">
    {initials(name)}
  </span>
);

export function Who({ name, sub, size }: { name: string; sub?: ReactNode; size?: 'sm' | 'lg' }) {
  return (
    <div className="who">
      <Avatar name={name} size={size} />
      <div className="grow">
        <b className="ellip">{name}</b>
        {sub != null && sub !== '' && <span className="ellip">{sub}</span>}
      </div>
    </div>
  );
}

/* ---------- waiting time ---------- */

/** How long an item has waited, coloured by the queue's SLA. */
export const Age = ({ at, warn, bad }: { at: import('@/lib/format').MaybeDate; warn?: number; bad?: number }) => (
  <span className={'age ' + ageCls(at, warn, bad)}>{ageTxt(at)}</span>
);

/* ---------- empty state ---------- */

export function Empty({ icon = 'inbox', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <b>{title}</b>
      {children}
    </div>
  );
}

/* ---------- form fields ---------- */

export function Field({ label, hint, error, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode }) {
  return (
    <label className="fld">
      <span className="lbl">{label}</span>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="errmsg">{error}</span>}
    </label>
  );
}

/* A toggle.

   The wrapper MUST be a <label>. The real checkbox is `width:0;height:0;
   opacity:0` (see .switch input in prototype.css) — the thing you can see
   and click is the <span> after it, which has no connection to the input on
   its own. As a <span> wrapper, clicking the toggle did nothing at all, and
   only keyboard users could change it.

   Tests that call .click() on the input do not catch this, because that
   bypasses the layout entirely. It has to be clicked like a person would. */
export function Switch({ checked, onChange, disabled, label }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string;
}) {
  return (
    <label className="switch" title={label}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span />
    </label>
  );
}

/** A segmented control. */
export function Seg<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { id: T; label: string; count?: number }[];
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={o.id === value} className={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
          {o.count != null && <span className="cnt">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- key/value list ---------- */

export function Kv({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- progress ---------- */

export const Bar = ({ value, max = 100, tone: t }: { value: number; max?: number; tone?: 'ok' | 'warn' | 'bad' }) => (
  <div className={'bar' + (t ? ' ' + t : '')}>
    <i style={{ width: Math.max(0, Math.min(100, (value / max) * 100)) + '%' }} />
  </div>
);

/* ---------- loading and failure ---------- */

export const Loading = ({ what = 'this' }: { what?: string }) => (
  <div className="empty">
    <Icon name="refresh" />
    <b>Loading {what}…</b>
  </div>
);

export function Failed({ error, onRetry }: { error: Error & { needs?: string[]; youAre?: string }; onRetry?: () => void }) {
  /* A refused request is not a fault: say which permission was missing. */
  if (error.needs?.length) {
    return (
      <div className="card">
        <Empty icon="lock" title="You do not have access to this section">
          It needs the permission “{error.needs[0]}”. You are viewing as {error.youAre || 'this role'}.
          <br />
          The same check runs on the server, so anything not granted is refused there too.
        </Empty>
      </div>
    );
  }
  return (
    <div className="card">
      <Empty icon="alert" title="That did not load">
        {error.message}
        {onRetry && (
          <div className="mt12">
            <Btn icon="refresh" onClick={onRetry}>Try again</Btn>
          </div>
        )}
      </Empty>
    </div>
  );
}
