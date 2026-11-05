import { describe, expect, it, vi } from 'vitest';
import { ZoomSync } from './zoomSync';

describe('ZoomSync', () => {
  it('shares one time window, normalised, with every subscriber', () => {
    const z = new ZoomSync();
    const a = vi.fn();
    const b = vi.fn();
    z.subscribe(a);
    const off = z.subscribe(b);
    z.set(800, 200);
    expect(z.x).toEqual([200, 800]);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    off();
    z.reset();
    expect(z.x).toBeNull();
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('ignores empty or invalid windows and a reset with nothing zoomed', () => {
    const z = new ZoomSync();
    const l = vi.fn();
    z.subscribe(l);
    z.set(5, 5);
    z.set(NaN, 10);
    z.reset();
    expect(z.x).toBeNull();
    expect(l).not.toHaveBeenCalled();
    expect(z.version).toBe(0);
  });
});
