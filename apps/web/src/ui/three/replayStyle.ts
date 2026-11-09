/** Colours and speeds of the 3D replay, shared by the scene and its controls. */
export const SPIKE_COLORS = { central: '#7cc7ff', fes: '#ffe14d', antidromic: '#ff6bd6' } as const;

export const FLASH_COLORS = {
  fire: '#ffe14d',
  blocked: '#9aa0a6',
  collision: '#ffffff',
  reset: '#ff6bd6',
  arrival: '#ff8a5c',
  soma: '#7cc7ff',
} as const;

/**
 * Replay speeds: simulated time per real time. At 50 m/s a spike crosses the drawn forearm (≈ 15 cm) in 3 ms and the
 * axon level's 5 mm in 0.1 ms, so each level needs its own slowness.
 */
export const SPEEDS: readonly { value: number; label: string }[] = [
  { value: 0.00001, label: '1/100 000×' },
  { value: 0.0001, label: '1/10 000×' },
  { value: 0.001, label: '1/1000×' },
  { value: 0.01, label: '1/100×' },
  { value: 0.1, label: '1/10×' },
  { value: 1, label: '1×' },
];

/**
 * Speed each zoom level starts at. The forearm level shows the wrist moving (a twitch lasts ≈ 200 ms: 2 s at 1/10×);
 * the others let a spike take a few real seconds to cross the view.
 */
export const LEVEL_SPEED: Record<'L0' | 'L1' | 'L2' | 'L3', number> = { L0: 0.1, L1: 0.001, L2: 0.0001, L3: 0.0001 };
