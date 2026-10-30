import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const CLOSE_MS = 260;

/** Folhas abertas, da mais antiga para a do topo: o Esc fecha só a do topo. */
const openStack: symbol[] = [];

/**
 * Controla abertura/fechamento com a animação de saída do design.
 * `close()` anima e só então desmonta.
 */
export function useSheet() {
  const [state, setState] = useState<'closed' | 'open' | 'closing'>('closed');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const open = useCallback(() => {
    window.clearTimeout(timer.current);
    setState('open');
  }, []);
  const close = useCallback(() => {
    setState((s) => (s === 'closed' ? s : 'closing'));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('closed'), CLOSE_MS);
  }, []);
  return { state, isOpen: state !== 'closed', open, close };
}

interface Props {
  state: 'closed' | 'open' | 'closing';
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Sheet({ state, onClose, title, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const visible = state !== 'closed';

  // Só reage à abertura/fechamento; o callback fica numa ref para não refocar a cada render
  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const token = Symbol('sheet');
    openStack.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openStack.at(-1) === token) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    // Evita rolar a página por trás do sheet
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      openStack.splice(openStack.indexOf(token), 1);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [visible]);

  if (state === 'closed') return null;
  const out = state === 'closing' ? ' out' : '';
  return createPortal(
    <>
      <div className={`backdrop${out}`} onClick={onClose} />
      <div className={`sheet${out}`} role="dialog" aria-modal="true" aria-label={title} ref={panel} tabIndex={-1}>
        <div className="grabber" />
        <div className="between">
          <h2 className="h2">{title}</h2>
          <button type="button" className="round-btn press" onClick={onClose} aria-label="Fechar" style={{ background: 'var(--fill)' }}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}
