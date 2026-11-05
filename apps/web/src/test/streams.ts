/** Test helpers: build fetch Responses whose body arrives in the given pieces. */
export function streamOf(pieces: readonly (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= pieces.length) {
        controller.close();
        return;
      }
      const p = pieces[i++]!;
      controller.enqueue(typeof p === 'string' ? enc.encode(p) : p);
    },
  });
}

export function sseResponse(pieces: readonly (string | Uint8Array)[], status = 200): Response {
  return new Response(streamOf(pieces), {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

export function sse(type: string, payload: object): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`;
}

/** Split a string into pieces of `size` characters (to simulate network fragmentation). */
export function splitEvery(s: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}
