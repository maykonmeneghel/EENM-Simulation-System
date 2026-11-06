import { lengthLabel, scaleBar } from './scaleBar';

describe('scaleBar', () => {
  it('picks the longest 1/2/5 length that fits', () => {
    expect(scaleBar(0.001).metres).toBeCloseTo(0.1); // 120 px = 12 cm → 10 cm
    expect(scaleBar(0.0005).metres).toBeCloseTo(0.05); // 6 cm → 5 cm
    expect(scaleBar(2e-7).metres).toBeCloseTo(2e-5); // 24 µm → 20 µm
    const b = scaleBar(3e-6);
    expect(b.pixels).toBeLessThanOrEqual(120);
    expect(b.pixels).toBeGreaterThan(120 / 2.5); // never less than half the room minus the 2→5 gap
  });

  it('labels in the unit that keeps the number ≥ 1', () => {
    expect(lengthLabel(0.1)).toMatch(/^10 cm$/);
    expect(lengthLabel(0.005)).toMatch(/^5 mm$/);
    expect(lengthLabel(2e-5)).toMatch(/^20 µm$/);
    expect(lengthLabel(1)).toMatch(/^1 m$/);
  });
});
