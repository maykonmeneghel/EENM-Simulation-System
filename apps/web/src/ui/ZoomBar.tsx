import { useSyncExternalStore } from 'react';
import { SegmentedControl } from './SegmentedControl';
import type { DragMode, ZoomSync } from './zoomSync';

const fmt = (ms: number) =>
  ms >= 2000
    ? `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} s`
    : `${ms.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ms`;

const MODES = [
  { value: 'zoom', label: 'Zoom' },
  { value: 'pan', label: 'Mover' },
] as const;

/** Drag mode (zoom box or hand), the current window and "Restaurar zoom" for the charts that share `zoom`. */
export function ZoomBar({ zoom, durationMs }: { zoom: ZoomSync; durationMs: number | null }) {
  const window = useSyncExternalStore(
    (cb) => zoom.subscribe(cb),
    () => zoom.x,
  );
  const mode = useSyncExternalStore(
    (cb) => zoom.subscribe(cb),
    () => zoom.mode,
  );
  const choose = (m: DragMode) => {
    zoom.setMode(m);
    // the hand needs something to move: start on the first half of the run
    if (m === 'pan' && !zoom.x && durationMs) zoom.set(0, durationMs / 2);
  };
  const hint =
    mode === 'pan'
      ? 'Arraste para mover todos os gráficos no tempo · duplo clique restaura'
      : 'Arraste uma área para dar zoom (tempo em todos, amplitude naquele) · Shift+arrastar move · duplo clique restaura';
  return (
    <div className="zoom-bar" role="toolbar" aria-label="Zoom dos gráficos">
      <SegmentedControl<DragMode> label="Ao arrastar" options={MODES} value={mode} size="small" onChange={choose} />
      <span className="muted zoom-bar-text">
        {window ? `${fmt(window[0])} – ${fmt(window[1])} · ` : ''}
        {hint}
      </span>
      <button type="button" className="btn btn--small" onClick={() => zoom.reset()} disabled={!window}>
        Restaurar zoom
      </button>
    </div>
  );
}
