import { fmtNumber } from '../../i18n/locale';

/** Scale bar of the 3D step: the longest 1 / 2 / 5 × 10ⁿ length that fits in `maxPixels`. */
export function scaleBar(metresPerPixel: number, maxPixels = 120): { metres: number; pixels: number; label: string } {
  const most = metresPerPixel * maxPixels;
  const decade = 10 ** Math.floor(Math.log10(most));
  const step = [5, 2, 1].find((m) => m * decade <= most)! * decade;
  return { metres: step, pixels: step / metresPerPixel, label: lengthLabel(step) };
}

export function lengthLabel(metres: number): string {
  const units: [number, string][] = [[1, 'm'], [1e-2, 'cm'], [1e-3, 'mm'], [1e-6, 'µm']];
  const [factor, name] = units.find(([f]) => metres >= f * 0.999) ?? units[units.length - 1]!;
  const value = Math.round((metres / factor) * 1000) / 1000;
  return `${fmtNumber(value)} ${name}`;
}
