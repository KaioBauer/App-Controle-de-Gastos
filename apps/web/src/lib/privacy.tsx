import { formatAmount } from '@financas/shared';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const KEY = 'hide-values';

function readStored(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

const PrivacyContext = createContext<{ hidden: boolean; toggle: () => void }>({ hidden: false, toggle: () => {} });

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(readStored);
  const toggle = useCallback(() => {
    setHidden((h) => {
      try {
        localStorage.setItem(KEY, h ? '0' : '1');
      } catch {
        // armazenamento indisponível: vale só para a sessão
      }
      return !h;
    });
  }, []);
  return <PrivacyContext.Provider value={{ hidden, toggle }}>{children}</PrivacyContext.Provider>;
}

export const usePrivacy = () => useContext(PrivacyContext);

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Anima a troca de valores (ease-out cúbico, 1s), como no saldo do design. */
export function useCountUp(target: number, duration = 1000): number {
  const [shown, setShown] = useState(reducedMotion() ? target : 0);
  const from = useRef(shown);
  useEffect(() => {
    if (reducedMotion()) {
      setShown(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const v = origin + (target - origin) * (1 - Math.pow(1 - k, 3));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return Math.round(shown);
}

interface MoneyProps {
  cents: number;
  /** "auto": − para saídas e + para entradas; "none": só o módulo */
  sign?: 'auto' | 'none';
  /** Mostra "R$" menor e mais claro, separado do número */
  splitSymbol?: boolean;
  symbolStyle?: CSSProperties;
  className?: string;
  style?: CSSProperties;
}

/** Valor em BRL que respeita "ocultar valores". */
export function Money({ cents, sign = 'none', splitSymbol, symbolStyle, className, style }: MoneyProps) {
  const { hidden } = usePrivacy();
  const prefix = sign === 'auto' && cents !== 0 ? (cents < 0 ? '−' : '+') : '';
  const value = hidden ? '••••' : formatAmount(cents);
  return (
    <span className={`num ${className ?? ''}`} style={style}>
      {hidden && <span className="visually-hidden">Valor oculto</span>}
      <span aria-hidden={hidden || undefined}>
        {splitSymbol ? (
          <>
            {prefix}
            <span style={{ marginRight: 6, ...symbolStyle }}>R$</span>
            {value}
          </>
        ) : (
          `${prefix}R$ ${value}`
        )}
      </span>
    </span>
  );
}
