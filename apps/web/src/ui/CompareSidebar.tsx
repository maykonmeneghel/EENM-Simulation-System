import { useRef, useState } from 'react';
import type { SavedSimulations } from '../application/savedSimulations';
import { MAX_COMPARED } from '../application/savedSimulations';
import type { SavedSimulationMeta } from '../domain/savedSimulation';
import type { SimulationRequest } from '../domain/simulation';
import { getLocale, tr } from '../i18n/locale';
import { COMPARE_COLORS, useColorScheme } from './theme';
import { download } from './download';
import { useSavedSimulations } from './useSavedSimulations';

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

function SavedItem({
  meta,
  slot,
  color,
  full,
  saved,
  onOpen,
}: {
  meta: SavedSimulationMeta;
  slot: number | undefined;
  color: string | undefined;
  full: boolean;
  saved: SavedSimulations;
  onOpen(request: SimulationRequest): void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(meta.name);
  const id = `saved-${meta.id}`;
  const checked = slot !== undefined;
  const date = new Date(meta.savedAt).toLocaleString(getLocale(), { dateStyle: 'short', timeStyle: 'short' });
  return (
    <li className={`saved-item${checked ? ' saved-item--on' : ''}`}>
      <input
        id={id}
        type="checkbox"
        className="saved-check"
        checked={checked}
        disabled={!checked && full}
        title={!checked && full ? tr({ 'pt-BR': `No máximo ${MAX_COMPARED} de cada vez`, en: `At most ${MAX_COMPARED} at a time` }) : undefined}
        onChange={(e) => void saved.select(meta.id, e.target.checked)}
      />
      <span className="saved-swatch" style={color ? { background: color } : undefined} aria-hidden="true" />
      <div className="saved-body">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saved.rename(meta.id, draft);
              setEditing(false);
            }}
          >
            <input
              className="saved-rename"
              aria-label={tr({ 'pt-BR': 'Novo nome', en: 'New name' })}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                void saved.rename(meta.id, draft);
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDraft(meta.name);
                  setEditing(false);
                }
              }}
            />
          </form>
        ) : (
          <label htmlFor={id} className="saved-name">
            {meta.name}
          </label>
        )}
        <small className="saved-date muted">{date}</small>
        <div className="saved-actions">
          <button type="button" className="btn btn--small btn--link" onClick={() => setEditing(true)}>
            {tr({ 'pt-BR': 'Renomear', en: 'Rename' })}
          </button>
          <button type="button" className="btn btn--small btn--link" onClick={() => onOpen(meta.request)}>
            {tr({ 'pt-BR': 'Abrir parâmetros', en: 'Open settings' })}
          </button>
          <button
            type="button"
            className="btn btn--small btn--link btn--danger"
            onClick={() => {
              if (window.confirm(tr({ 'pt-BR': `Apagar “${meta.name}”?`, en: `Delete “${meta.name}”?` }))) void saved.remove(meta.id);
            }}
          >
            {tr({ 'pt-BR': 'Apagar', en: 'Delete' })}
          </button>
        </div>
      </div>
    </li>
  );
}

/** Compare step, left sidebar: the saved simulations, which ones are compared, and the export file. */
export function CompareSidebar({ saved, onOpen }: { saved: SavedSimulations; onOpen(request: SimulationRequest): void }) {
  const state = useSavedSimulations(saved);
  const palette = COMPARE_COLORS[useColorScheme()];
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const full = state.selected.size >= MAX_COMPARED;

  const exportFile = async (ids?: readonly string[]) => {
    const json = await saved.exportJson(ids);
    if (json) download(`eenm-simulations-${stamp()}.json`, json, 'application/json');
  };

  return (
    <div className="compare-sidebar">
      <p className="dial-hint">
        {tr({
          'pt-BR': `Marque até ${MAX_COMPARED} simulações para comparar. Elas ficam guardadas neste navegador; exporte um arquivo para levá-las a outro computador.`,
          en: `Tick up to ${MAX_COMPARED} simulations to compare. They are kept in this browser; export a file to take them to another computer.`,
        })}
      </p>
      {!state.loaded ? null : state.list.length === 0 ? (
        <p className="muted">
          {tr({
            'pt-BR': 'Nenhuma simulação salva ainda. Ao terminar uma simulação, salve-a na etapa Resultados.',
            en: 'No saved simulations yet. When a simulation finishes, save it in the Results step.',
          })}
        </p>
      ) : (
        <ul className="saved-list" aria-label={tr({ 'pt-BR': 'Simulações salvas', en: 'Saved simulations' })}>
          {state.list.map((m) => {
            const slot = state.selected.get(m.id);
            return (
              <SavedItem
                key={m.id}
                meta={m}
                slot={slot}
                color={slot !== undefined ? palette[slot] : undefined}
                full={full}
                saved={saved}
                onOpen={onOpen}
              />
            );
          })}
        </ul>
      )}
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {notice ? (
        <p className="dial-hint" role="status">
          {notice}
        </p>
      ) : null}
      <div className="inspector-footer">
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          {tr({ 'pt-BR': 'Importar…', en: 'Import…' })}
        </button>
        <button type="button" className="btn" disabled={state.selected.size === 0} onClick={() => void exportFile([...state.selected.keys()])}>
          {tr({ 'pt-BR': 'Exportar marcadas', en: 'Export ticked' })}
        </button>
        <button type="button" className="btn" disabled={state.list.length === 0} onClick={() => void exportFile()}>
          {tr({ 'pt-BR': 'Exportar todas', en: 'Export all' })}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label={tr({ 'pt-BR': 'Arquivo de simulações', en: 'Simulations file' })}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            const added = await saved.importJson(await file.text());
            setNotice(
              saved.getState().error
                ? null
                : tr({
                    'pt-BR': `${added} simulação(ões) importada(s).`,
                    en: `${added} simulation(s) imported.`,
                  }),
            );
          }}
        />
      </div>
    </div>
  );
}
