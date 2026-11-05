import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useMemo } from 'react';

/** KaTeX render (throwOnError: false → malformed TeX shows in red instead of crashing). */
export function Tex({ tex, display = false }: { tex: string; display?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(tex, { throwOnError: false, displayMode: display, strict: 'ignore' }),
    [tex, display],
  );
  return <span className={display ? 'tex tex--display' : 'tex'} dangerouslySetInnerHTML={{ __html: html }} />;
}
