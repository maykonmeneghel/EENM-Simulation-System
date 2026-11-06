import { describe, expect, it } from 'vitest';
import { tickDecimals } from './tickDecimals';

describe('y-axis tick decimals', () => {
  it('as many as the tick step needs, so neighbouring ticks never read the same', () => {
    expect(tickDecimals(20)).toBe(0);
    expect(tickDecimals(2.5)).toBe(1);
    expect(tickDecimals(0.25)).toBe(2);
    expect(tickDecimals(0.0005)).toBe(4); // fatigue 0.998 … 1: was printed as 1, 1, 0.999, 0.999
    expect(tickDecimals(0.1 + 0.2)).toBe(1); // float noise is not a decimal
  });
});
