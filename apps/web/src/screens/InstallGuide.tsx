import { Share, SquarePlus } from 'lucide-react';
import { KaixaGlyph } from '../ui/icons';

const STEPS = [
  {
    icon: <Share size={18} strokeWidth={1.8} aria-hidden="true" />,
    text: (
      <>
        Toque em <strong>Compartilhar</strong> na barra do Safari
      </>
    ),
  },
  {
    icon: <SquarePlus size={18} strokeWidth={1.8} aria-hidden="true" />,
    text: (
      <>
        Escolha <strong>Adicionar à Tela de Início</strong>
      </>
    ),
  },
  {
    icon: <KaixaGlyph size={18} />,
    text: (
      <>
        Abra o <strong>Kaixa</strong> pelo ícone criado
      </>
    ),
  },
];

/** Mostrado no Safari do iPhone quando o app ainda não foi adicionado à Tela de Início. */
export function InstallGuide({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="dark-screen">
      <div className="dark-screen-inner" style={{ gap: 28 }}>
        <div className="fu" style={{ width: 88, height: 88, borderRadius: 22, background: '#1C1E23', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <KaixaGlyph size={62} color="var(--accent)" />
        </div>
        <div className="stack fu" style={{ gap: 10, animationDelay: '80ms' }}>
          <h1 style={{ fontSize: 34, lineHeight: 1.1, fontWeight: 600, letterSpacing: '-0.03em' }}>Instale o Kaixa no iPhone</h1>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: '#A3A8B0' }}>As notificações só funcionam com o app aberto pela Tela de Início.</p>
        </div>
        <ol className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 10 }}>
          {STEPS.map((s, i) => (
            <li key={i} className="row fu" style={{ gap: 14, padding: 14, borderRadius: 22, background: '#1C1E23', animationDelay: `${160 + i * 80}ms` }}>
              <span className="tile tile-sm tile-accent">{s.icon}</span>
              <span style={{ fontSize: 15 }}>{s.text}</span>
            </li>
          ))}
        </ol>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" onClick={onContinue}>
          Continuar no navegador
        </button>
      </div>
    </div>
  );
}
