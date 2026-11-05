/**
 * Time zoom shared by every chart of a run: dragging a box on one chart sets the same time window on all of
 * them; double-click or "Restaurar zoom" goes back to the whole run. (Amplitude zoom stays per chart: units
 * differ.)
 */
export type TimeWindow = readonly [number, number];

export class ZoomSync {
  private window: TimeWindow | null = null;
  private generation = 0;
  private readonly listeners = new Set<() => void>();

  /** The zoomed time window, or null for the whole run. */
  get x(): TimeWindow | null {
    return this.window;
  }

  /** Increases on every change; charts compare it to drop their own amplitude zoom on a reset. */
  get version(): number {
    return this.generation;
  }

  set(a: number, b: number): void {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (!(hi > lo) || !Number.isFinite(lo) || !Number.isFinite(hi)) return;
    this.window = [lo, hi];
    this.notify();
  }

  reset(): void {
    if (this.window === null) return;
    this.window = null;
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.generation++;
    for (const l of this.listeners) l();
  }
}
