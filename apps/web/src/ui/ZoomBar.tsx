import { useSyncExternalStore } from 'react';
import { SegmentedControl } from './SegmentedControl';
import type { DragMode, ZoomSync } from './zoomSync';
import { fmtNumber, tr } from '../i18n/locale';

const fmt = (ms: number) =>
  ms >= 2000
    ? `${fmtNumber(ms / 1000, { maximumFractionDigits: 2 })} s`
    : `${fmtNumber(ms, { maximumFractionDigits: 1 })} ms`;

const modes = () =>
  [
    { value: 'zoom', label: 'Zoom' },
    { value: 'pan', label: tr({ 'pt-BR': 'Mover', en: 'Pan' }) },
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
      ? tr({
          'pt-BR': 'Arraste para mover todos os gráficos no tempo · duplo clique restaura',
          en: 'Drag to move every chart in time · double-click restores',
        })
      : tr({
          'pt-BR': 'Arraste uma área para dar zoom (tempo em todos, amplitude naquele) · Shift+arrastar move · duplo clique restaura',
          en: 'Drag an area to zoom (time in all, amplitude in that one) · Shift+drag pans · double-click restores',
        });
  return (
    <div className="zoom-bar" role="toolbar" aria-label={tr({ 'pt-BR': 'Zoom dos gráficos', en: 'Chart zoom' })}>
      <SegmentedControl<DragMode> label={tr({ 'pt-BR': 'Ao arrastar', en: 'When dragging' })} options={modes()} value={mode} size="small" onChange={choose} />
      <span className="muted zoom-bar-text">
        {window ? `${fmt(window[0])} – ${fmt(window[1])} · ` : ''}
        {hint}
      </span>
      <button type="button" className="btn btn--small" onClick={() => zoom.reset()} disabled={!window}>
        {tr({ 'pt-BR': 'Restaurar zoom', en: 'Reset zoom' })}
      </button>
    </div>
  );
}
