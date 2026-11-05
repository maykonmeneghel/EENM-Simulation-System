import { useSyncExternalStore } from 'react';
import type { SimulationController } from '../application/simulationController';
import type { SessionState } from '../application/session';

export function useSimulation(controller: SimulationController): SessionState {
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}
