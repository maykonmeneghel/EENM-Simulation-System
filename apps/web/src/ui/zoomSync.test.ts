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

describe('ZoomSync — hand (pan)', () => {
  it('moves the zoomed window, keeping its width, inside [0, end]', () => {
    const z = new ZoomSync();
    z.set(200, 400);
    z.pan(100, 1000);
    expect(z.x).toEqual([300, 500]);
    z.pan(-1000, 1000);
    expect(z.x).toEqual([0, 200]);
    z.pan(5000, 1000);
    expect(z.x).toEqual([800, 1000]);
  });

  it('nothing to move without zoom; the drag mode is shared and notified', () => {
    const z = new ZoomSync();
    const l = vi.fn();
    z.subscribe(l);
    z.pan(100, 1000);
    expect(z.x).toBeNull();
    expect(z.mode).toBe('zoom');
    z.setMode('pan');
    z.setMode('pan');
    expect(z.mode).toBe('pan');
    expect(l).toHaveBeenCalledTimes(1);
  });
});
