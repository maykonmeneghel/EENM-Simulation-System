import { useSyncExternalStore } from 'react';
import type { ZoomSync } from './zoomSync';

const fmt = (ms: number) =>
  ms >= 2000
    ? `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} s`
    : `${ms.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ms`;

/** Hint and "Restaurar zoom" for the charts that share `zoom`. */
export function ZoomBar({ zoom }: { zoom: ZoomSync }) {
  const window = useSyncExternalStore(
    (cb) => zoom.subscribe(cb),
    () => zoom.x,
  );
  return (
    <div className="zoom-bar" role="toolbar" aria-label="Zoom dos gráficos">
      <span className="muted">
        {window
          ? `Zoom: ${fmt(window[0])} – ${fmt(window[1])} em todos os gráficos`
          : 'Arraste sobre um gráfico para dar zoom (tempo em todos, amplitude naquele) · duplo clique restaura'}
      </span>
      <button type="button" className="btn btn--small" onClick={() => zoom.reset()} disabled={!window}>
        Restaurar zoom
      </button>
    </div>
  );
}
