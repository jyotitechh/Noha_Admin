/* Things that sit over the page: drawers, modals and toasts.

   The prototype kept one layer element and swapped its contents. React does
   that for us; what matters is that the behaviour is the same — Escape
   closes, the scrim closes, and focus does not escape behind the overlay. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui';

/* ---------- shared behaviour ---------- */

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
}

/** Keeps Tab inside the overlay while it is open, and restores focus after. */
function useFocusTrap<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open || !ref.current) return;
    const root = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(root.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'))
        .filter((el) => el.offsetParent !== null);

    focusable()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    root.addEventListener('keydown', onKey);
    return () => { root.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [open]);
  return ref;
}

/* ---------- drawer ---------- */

export function Drawer({ open, onClose, title, sub, width, tabs, activeTab, onTab, footer, flush, children }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  width?: 'wide' | 'xwide';
  tabs?: { id: string; label: string }[];
  activeTab?: string;
  onTab?: (id: string) => void;
  footer?: ReactNode;
  flush?: boolean;
  children: ReactNode;
}) {
  useEscape(onClose);
  const ref = useFocusTrap<HTMLDivElement>(open);
  if (!open) return null;

  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <aside className={['drawer', width].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'} ref={ref}>
        <header className="dw-h">
          <div className="grow">
            <h2>{title}</h2>
            {sub && <div className="sub">{sub}</div>}
          </div>
          <button className="icon-btn x" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>

        {tabs && tabs.length > 1 && (
          <nav className="dw-tabs" aria-label="Sections">
            {tabs.map((t) => (
              <button key={t.id} className={t.id === activeTab ? 'on' : ''} onClick={() => onTab?.(t.id)} aria-current={t.id === activeTab ? 'page' : undefined}>
                {t.label}
              </button>
            ))}
          </nav>
        )}

        <div className={'dw-b' + (flush ? ' flush' : '')}>{children}</div>
        {footer && <footer className="dw-f">{footer}</footer>}
      </aside>
    </>,
    document.body,
  );
}

/* ---------- modal ---------- */

export function Modal({ open, onClose, title, footer, children, width = 520 }: {
  open: boolean; onClose: () => void; title: ReactNode; footer?: ReactNode; children: ReactNode; width?: number;
}) {
  useEscape(onClose);
  const ref = useFocusTrap<HTMLDivElement>(open);
  if (!open) return null;

  return createPortal(
    <>
      <div className="modal-scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dialog'} style={{ width }} ref={ref}>
        <header className="dw-h">
          <div className="grow"><h2>{title}</h2></div>
          <button className="icon-btn x" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </header>
        <div className="dw-b">{children}</div>
        {footer && <footer className="dw-f">{footer}</footer>}
      </div>
    </>,
    document.body,
  );
}

/* ---------- toasts ---------- */

type ToastTone = 'ok' | 'warn' | 'bad' | 'info';
interface Toast { id: number; text: string; tone: ToastTone }

interface ToastValue { toast: (text: string, tone?: ToastTone) => void }
const ToastCtx = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const toast = useCallback((text: string, tone: ToastTone = 'ok') => {
    const id = ++seq.current;
    setItems((xs) => [...xs, { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      {createPortal(
        <div className="toasts" role="status" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={'toast ' + t.tone}>
              <Icon name={{ ok: 'check', warn: 'alert', bad: 'alert', info: 'info' }[t.tone]} />
              <span>{t.text}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastValue {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>.');
  return v;
}

/* ---------- confirm ---------- */

/** A yes/no step for anything that cannot simply be undone. */
export function Confirm({ open, onClose, onConfirm, title, confirmLabel = 'Confirm', danger, children }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string;
  confirmLabel?: string; danger?: boolean; children: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <span className="sp" style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className={'btn ' + (danger ? 'danger' : 'pri')} onClick={() => { onConfirm(); onClose(); }}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
