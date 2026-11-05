import { describe, expect, it } from 'vitest';
import { readSseStream, SseParser } from './sseParser';
import { splitEvery, streamOf } from '../test/streams';

const collect = async (pieces: (string | Uint8Array)[]) => {
  const out = [];
  let truncated: boolean | undefined;
  for await (const m of readSseStream(streamOf(pieces), (i) => (truncated = i.truncated))) out.push(m);
  return { messages: out, truncated };
};

describe('SseParser', () => {
  it('parses a single complete event', () => {
    const p = new SseParser();
    expect(p.push('event: chunk\ndata: {"a":1}\n\n')).toEqual([{ event: 'chunk', data: '{"a":1}' }]);
  });

  it('defaults the event name to "message"', () => {
    expect(new SseParser().push('data: x\n\n')).toEqual([{ event: 'message', data: 'x' }]);
  });

  it('buffers an event split across pushes at every possible position', () => {
    const text = 'event: started\ndata: {"type":"started","n":42}\n\nevent: chunk\ndata: {"p":0.5}\n\n';
    for (let cut = 1; cut < text.length; cut++) {
      const p = new SseParser();
      const msgs = [...p.push(text.slice(0, cut)), ...p.push(text.slice(cut))];
      expect(msgs).toEqual([
        { event: 'started', data: '{"type":"started","n":42}' },
        { event: 'chunk', data: '{"p":0.5}' },
      ]);
    }
  });

  it('handles one-character-at-a-time delivery', () => {
    const p = new SseParser();
    const msgs = splitEvery('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n', 1).flatMap((c) => p.push(c));
    expect(msgs.map((m) => [m.event, m.data])).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });

  it('supports CRLF and CR line endings, including CRLF split between pushes', () => {
    const p = new SseParser();
    const msgs = [
      ...p.push('event: a\r\ndata: 1\r'),
      ...p.push('\n\r'),
      ...p.push('\nevent: b\rdata: 2\r\r'),
    ];
    expect(msgs).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ]);
  });

  it('joins multi-line data with \\n', () => {
    expect(new SseParser().push('data: line1\ndata: line2\ndata:line3\n\n')).toEqual([
      { event: 'message', data: 'line1\nline2\nline3' },
    ]);
  });

  it('ignores comments, unknown fields and events without data', () => {
    const p = new SseParser();
    expect(p.push(': keep-alive\n\nfoo: bar\nevent: x\n\n')).toEqual([]);
    expect(p.push('event: y\ndata: ok\n\n')).toEqual([{ event: 'y', data: 'ok' }]);
  });

  it('does not leak the event name into the next event', () => {
    const p = new SseParser();
    expect(p.push('event: a\ndata: 1\n\ndata: 2\n\n')).toEqual([
      { event: 'a', data: '1' },
      { event: 'message', data: '2' },
    ]);
  });

  it('keeps id and retry', () => {
    expect(new SseParser().push('id: 7\nretry: 1500\ndata: x\n\n')).toEqual([
      { event: 'message', data: 'x', id: '7', retry: 1500 },
    ]);
  });

  it('only strips one leading space from the value', () => {
    expect(new SseParser().push('data:  two\n\n')[0]?.data).toBe(' two');
  });

  it('end() reports an unterminated trailing event', () => {
    const p = new SseParser();
    p.push('data: half');
    expect(p.end()).toEqual({ truncated: true });
    const q = new SseParser();
    q.push('data: full\n\n');
    expect(q.end()).toEqual({ truncated: false });
  });
});

describe('readSseStream', () => {
  it('decodes UTF-8 multi-byte characters split across network chunks', async () => {
    const bytes = new TextEncoder().encode('data: µA/cm² — ok\n\n');
    // "µ" is 2 bytes; split right inside it.
    const { messages } = await collect([bytes.slice(0, 7), bytes.slice(7)]);
    expect(messages).toEqual([{ event: 'message', data: 'µA/cm² — ok' }]);
  });

  it('yields events as they complete and flags truncation', async () => {
    const { messages, truncated } = await collect(['event: a\nda', 'ta: 1\n\nevent: b\ndata: 2']);
    expect(messages).toEqual([{ event: 'a', data: '1' }]);
    expect(truncated).toBe(true);
  });
});
