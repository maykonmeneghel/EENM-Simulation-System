import { useSyncExternalStore } from 'react';
import type { SavedSimulations, SavedSimulationsState } from '../application/savedSimulations';

export function useSavedSimulations(saved: SavedSimulations): SavedSimulationsState {
  return useSyncExternalStore(saved.subscribe, saved.getState, saved.getState);
}
