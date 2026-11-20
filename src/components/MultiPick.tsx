/* A dropdown that takes several values: a tick list that opens under its button.

   It opens in place (it pushes what is below it down) rather than floating, so it
   is never cut off inside a dialog and works the same on a phone. With many
   choices it has a search box. */

import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui';

export interface PickOption { value: string; label: string; detail?: string }

export function MultiPick({ options, value, onChange, any, none, label }: {
  options: PickOption[]; value: string[]; onChange: (v: string[]) => void;
  /** Shown when nothing is ticked, e.g. "Any city". */
  any: string;
  /** Shown, disabled, when there is nothing to choose from. */
  none: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  /* A click anywhere else closes it. On click, not mousedown: closing on mousedown shrinks the dialog under the
     pointer, so the button that was pressed (Show members) moved away before the click landed and needed a second one. */
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', away);
    return () => document.removeEventListener('click', away);
  }, [open]);

  const chosen = new Set(value);
  const names = options.filter((o) => chosen.has(o.value)).map((o) => o.label);
  const summary = !names.length ? any : names.length <= 2 ? names.join(', ') : `${names.length} chosen`;
  const needle = find.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const toggle = (v: string) => onChange(chosen.has(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div className="mpick" ref={box}>
      <button type="button" className={'sel mpick-btn' + (names.length ? ' on' : '')} disabled={!options.length}
        aria-label={label} aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
        <span className="ellip grow">{options.length ? summary : none}</span>
      </button>
      {open && (
        <div className="mpick-pop" id={listId}>
          {options.length > 8 && (
            <input className="inp" placeholder="Search" value={find} autoFocus aria-label={`Search ${label.toLowerCase()}`}
              onChange={(e) => setFind(e.target.value)} />
          )}
          <div className="mpick-list" role="group" aria-label={label}>
            {shown.map((o) => (
              <label key={o.value} className="mpick-row">
                <input type="checkbox" checked={chosen.has(o.value)} onChange={() => toggle(o.value)} />
                <span className="grow">{o.label}</span>
                {o.detail && <span className="muted small">{o.detail}</span>}
              </label>
            ))}
            {!shown.length && <div className="muted small" style={{ padding: '6px 8px' }}>Nothing matches.</div>}
          </div>
          <div className="row gap6" style={{ justifyContent: 'space-between', paddingTop: 6 }}>
            <button type="button" className="btn sm ghost" disabled={!value.length} onClick={() => onChange([])}>Clear</button>
            <button type="button" className="btn sm" onClick={() => setOpen(false)}><Icon name="check" />Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
