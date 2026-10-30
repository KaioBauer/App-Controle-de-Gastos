import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ScanFace } from 'lucide-react';
import { api } from '../lib/api';
import { markUnlocked } from '../lib/lock';
import { loginWithPasskey, passkeysSupported } from '../lib/passkey';
import { KaixaGlyph } from '../ui/icons';

const ONBOARDED = 'onboarded';

function wasOnboarded() {
  try {
    return localStorage.getItem(ONBOARDED) === '1';
  } catch {
    return false;
  }
}

export function Brand() {
  return (
    <div className="row" style={{ gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <KaixaGlyph size={22} color="#0E0F12" />
      </div>
      <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>Kaixa</span>
    </div>
  );
}

/** Onboarding (primeira abertura) e login, nas telas escuras do design. */
export function Welcome() {
  const [step, setStep] = useState<'intro' | 'login'>(wasOnboarded() ? 'login' : 'intro');
  const goLogin = () => {
    try {
      localStorage.setItem(ONBOARDED, '1');
    } catch {
      // sem armazenamento, o onboarding volta na próxima abertura
    }
    setStep('login');
  };

  return (
    <div className="dark-screen">
      <div className="dark-screen-inner">{step === 'intro' ? <Intro onNext={goLogin} /> : <Login />}</div>
    </div>
  );
}

function Intro({ onNext }: { onNext: () => void }) {
  return (
    <>
      <div className="between fu">
        <Brand />
        <button type="button" onClick={onNext} style={{ fontSize: 14, fontWeight: 500, padding: '12px 0', minWidth: 44 }}>
          Pular
        </button>
      </div>

      <div aria-hidden="true" style={{ position: 'relative', height: 400, marginTop: 28, width: '100%', maxWidth: 342, alignSelf: 'center' }}>
        <div className="fa fu" style={{ position: 'absolute', left: 4, top: 30, animationDelay: '200ms' }}>
          <div className="stack" style={{ width: 248, background: '#FFFFFF', color: '#0E0F12', borderRadius: 26, padding: 20, gap: 14, boxShadow: '0 30px 60px rgba(0,0,0,.35)' }}>
            <span style={{ fontSize: 13, color: '#6B7079' }}>Gasto do mês</span>
            <span className="num" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1 }}>
              R$ 2.281,60
            </span>
            <div style={{ height: 8, borderRadius: 4, background: '#F2F3F5', overflow: 'hidden' }}>
              <div className="gx" style={{ width: '76%', height: '100%', borderRadius: 4, background: '#0E0F12', animationDelay: '.9s' }} />
            </div>
            <span style={{ fontSize: 12, color: '#6B7079' }}>76% do orçamento</span>
          </div>
        </div>

        <div className="fb fu" style={{ position: 'absolute', right: 0, top: 168, animationDelay: '350ms' }}>
          <div className="row" style={{ width: 196, background: '#1C1E23', borderRadius: 22, padding: 14, gap: 12, boxShadow: '0 24px 48px rgba(0,0,0,.4)' }}>
            <div className="tile tile-sm tile-accent">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 4h2l2.4 11h10.8L20 7H6.4M9 20h.01M17 20h.01" />
              </svg>
            </div>
            <div className="stack" style={{ gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>Mercado</span>
              <span className="num" style={{ fontSize: 13, color: '#A3A8B0' }}>
                −R$ 186,40
              </span>
            </div>
          </div>
        </div>

        <div className="fc fu" style={{ position: 'absolute', left: 52, top: 270, animationDelay: '500ms' }}>
          <div style={{ width: 132, height: 132, borderRadius: 34, background: 'var(--accent)', color: '#0E0F12', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 24px 48px rgba(0,0,0,.35)' }}>
            <svg width="84" height="84" viewBox="0 0 64 64" style={{ position: 'absolute' }}>
              <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(14,15,18,.15)" strokeWidth="6" />
              <circle className="rg" cx="32" cy="32" r="28" fill="none" stroke="#0E0F12" strokeWidth="6" strokeLinecap="round" strokeDasharray="176" strokeDashoffset="42" transform="rotate(-90 32 32)" />
            </svg>
            <span className="num" style={{ fontSize: 18, fontWeight: 700, position: 'relative' }}>
              76%
            </span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div className="stack" style={{ gap: 14 }}>
        <h1 className="fu" style={{ animationDelay: '300ms', fontSize: 40, lineHeight: 1.05, fontWeight: 600, letterSpacing: '-0.035em' }}>
          Seu dinheiro,
          <br />
          sem ruído.
        </h1>
        <p className="fu" style={{ animationDelay: '420ms', fontSize: 16, lineHeight: 1.5, color: '#A3A8B0' }}>
          Lance um gasto em dois toques e veja, sem planilha, para onde vai cada real.
        </p>
      </div>

      <div className="stack fu" style={{ animationDelay: '600ms', gap: 12, marginTop: 28 }}>
        <button type="button" className="btn" onClick={onNext}>
          Começar
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        <button type="button" className="btn btn-ghost" onClick={onNext}>
          Já tenho conta
        </button>
      </div>
    </>
  );
}

function Login() {
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Acabou de se autenticar: não pede o Face ID de novo nesta abertura
  const onLoggedIn = (me: { username: string }) => {
    markUnlocked(true);
    qc.setQueryData(['me'], { ...me, locked: false });
    qc.invalidateQueries({ queryKey: ['me'] });
  };
  const login = useMutation({
    mutationFn: () => api<{ username: string }>('/auth/login', { method: 'POST', body: { username, password } }),
    onSuccess: onLoggedIn,
  });
  const passkey = useMutation({
    mutationFn: loginWithPasskey,
    onSuccess: onLoggedIn,
  });
  const error = login.error ?? passkey.error;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };

  return (
    <>
      <div className="fu">
        <Brand />
      </div>
      <div style={{ flex: 1, minHeight: 48 }} />
      <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
        <div className="stack fu" style={{ gap: 8, marginBottom: 14, animationDelay: '80ms' }}>
          <h1 style={{ fontSize: 34, lineHeight: 1.1, fontWeight: 600, letterSpacing: '-0.03em' }}>Bem-vindo de volta.</h1>
          <p style={{ fontSize: 16, color: '#A3A8B0' }}>Entre para ver suas finanças.</p>
        </div>
        <div className="stack fu" style={{ gap: 10, animationDelay: '160ms' }}>
          <label className="visually-hidden" htmlFor="username">
            Usuário
          </label>
          <input
            id="username"
            className="field"
            placeholder="Usuário"
            autoComplete="username webauthn"
            autoCapitalize="none"
            autoCorrect="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <label className="visually-hidden" htmlFor="password">
            Senha
          </label>
          <input
            id="password"
            className="field"
            type="password"
            placeholder="Senha"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p role="alert" style={{ fontSize: 14, color: '#FF8A7E' }}>
            {error.message}
          </p>
        )}
        <button className="btn fu" type="submit" disabled={login.isPending} style={{ marginTop: 14, animationDelay: '240ms' }}>
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </button>
        {passkeysSupported() && (
          <button type="button" className="btn btn-ghost row" style={{ gap: 8 }} onClick={() => passkey.mutate()} disabled={passkey.isPending}>
            <ScanFace size={20} strokeWidth={1.8} aria-hidden="true" />
            {passkey.isPending ? 'Aguardando Face ID…' : 'Entrar com Face ID / passkey'}
          </button>
        )}
      </form>
    </>
  );
}
