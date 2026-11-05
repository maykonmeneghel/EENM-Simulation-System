import { useCallback, useState } from 'react';
import type { CSSProperties } from 'react';

/**
 * How much an SVG with a fixed viewBox width is scaled on screen. Exposed as the CSS variable `--svg-k` so text
 * inside can use `calc(var(--fs-…) / var(--svg-k))` and keep the app's type scale at any width.
 */
export function useSvgScale(viewBoxWidth: number): [(el: SVGSVGElement | null) => void, CSSProperties] {
  const [k, setK] = useState(1);
  const measure = useCallback(
    (el: SVGSVGElement | null) => {
      if (!el || typeof ResizeObserver === 'undefined') return;
      const update = () => {
        const w = el.getBoundingClientRect().width;
        if (w > 0) setK(w / viewBoxWidth);
      };
      update();
      new ResizeObserver(update).observe(el);
    },
    [viewBoxWidth],
  );
  return [measure, { '--svg-k': k } as CSSProperties];
}
