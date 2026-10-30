import { useCallback, useState } from 'react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'] as const;
const MAX_CENTS = 99_999_999;

/** Valor digitado como numa maquininha: cada dígito entra pela direita, em centavos. */
export function useCentsInput(initial = 0) {
  const [cents, setCents] = useState(initial);
  const press = useCallback((k: (typeof KEYS)[number]) => {
    setCents((c) => {
      const next = k === 'del' ? Math.floor(c / 10) : k === '00' ? c * 100 : c * 10 + Number(k);
      return next > MAX_CENTS ? c : next;
    });
  }, []);
  return { cents, setCents, press };
}

export function Keypad({ onPress }: { onPress: (k: (typeof KEYS)[number]) => void }) {
  return (
    <div className="keypad">
      {KEYS.map((k) => (
        <button key={k} type="button" className="key num" onClick={() => onPress(k)} aria-label={k === 'del' ? 'Apagar' : k}>
          {k === 'del' ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 5H9l-6 7 6 7h12z" />
              <path d="M17 9l-5 5M12 9l5 5" />
            </svg>
          ) : (
            k
          )}
        </button>
      ))}
    </div>
  );
}
