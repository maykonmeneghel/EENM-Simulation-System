import { useState } from 'react';
import type { SavedSimulations } from '../application/savedSimulations';
import type { SimulationController } from '../application/simulationController';
import type { SessionState } from '../application/session';
import type { RunLabels } from '../application/runName';
import { suggestedName } from '../application/runName';
import { tr } from '../i18n/locale';
import { useSavedSimulations } from './useSavedSimulations';

/** Results step: keep the finished run to compare it later (Compare step). */
export function SaveRunCard({
  state,
  controller,
  saved,
  labels,
  onCompare,
}: {
  state: SessionState;
  controller: SimulationController;
  saved: SavedSimulations;
  labels?: RunLabels;
  onCompare(): void;
}) {
  const store = useSavedSimulations(saved);
  const [name, setName] = useState<{ runId: number; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (state.status !== 'completed' || !state.request) return null;
  const text = name?.runId === state.runId ? name.text : suggestedName(state.request, labels);
  const isSaved = store.savedRunId === state.runId;
  const save = async () => {
    setBusy(true);
    await saved.saveRun(controller, text);
    setBusy(false);
  };
  return (
    <section className="card save-run" aria-label={tr({ 'pt-BR': 'Salvar simulação', en: 'Save simulation' })}>
      {isSaved ? (
        <p className="save-run-done" role="status">
          {tr({ 'pt-BR': 'Simulação salva neste navegador.', en: 'Simulation saved in this browser.' })}{' '}
          <button type="button" className="btn btn--small btn--link" onClick={onCompare}>
            {tr({ 'pt-BR': 'Ver em Comparar', en: 'See in Compare' })}
          </button>
        </p>
      ) : (
        <form
          className="save-run-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor="save-run-name">{tr({ 'pt-BR': 'Nome', en: 'Name' })}</label>
          <input
            id="save-run-name"
            className="save-run-input"
            type="text"
            value={text}
            onChange={(e) => setName({ runId: state.runId, text: e.target.value })}
          />
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {tr({ 'pt-BR': 'Salvar para comparar', en: 'Save to compare' })}
          </button>
        </form>
      )}
      {store.error ? (
        <p className="field-error" role="alert">
          {tr({ 'pt-BR': 'Não foi possível salvar', en: 'Could not save' })}: {store.error}
        </p>
      ) : null}
    </section>
  );
}
