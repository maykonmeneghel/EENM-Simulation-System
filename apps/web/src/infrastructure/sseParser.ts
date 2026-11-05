/**
 * Incremental Server-Sent Events parser (WHATWG HTML §9.2 "event stream interpretation").
 *
 * Text is pushed in arbitrary pieces (as they arrive from the network); complete events are
 * returned as soon as their terminating blank line is seen. Handles LF, CR and CRLF line endings,
 * including a CRLF split across two pushes, multi-line `data:`, comments and the `id`/`retry`
 * fields. Events without any `data:` line are dropped, as the spec requires.
 */
export interface SseMessage {
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

export class SseParser {
  private buffer = '';
  /** A trailing '\r' in the previous push may be the first half of a CRLF. */
  private pendingCR = false;
  private eventType = '';
  private dataLines: string[] = [];
  private hasData = false;
  private lastEventId: string | undefined;
  private retry: number | undefined;

  push(text: string): SseMessage[] {
    if (this.pendingCR && text.startsWith('\n')) text = text.slice(1);
    this.pendingCR = false;
    this.buffer += text;

    const out: SseMessage[] = [];
    let start = 0;
    const buf = this.buffer;
    for (let i = 0; i < buf.length; i++) {
      const ch = buf.charCodeAt(i);
      if (ch !== 10 /* \n */ && ch !== 13 /* \r */) continue;
      const line = buf.slice(start, i);
      if (ch === 13) {
        if (i + 1 < buf.length) {
          if (buf.charCodeAt(i + 1) === 10) i++;
        } else {
          this.pendingCR = true;
        }
      }
      start = i + 1;
      const msg = this.processLine(line);
      if (msg) out.push(msg);
    }
    this.buffer = buf.slice(start);
    return out;
  }

  /**
   * Call at end of stream. Per spec an unterminated final event is discarded; we keep that
   * behaviour but expose whether anything was left over so callers can flag truncation.
   */
  end(): { truncated: boolean } {
    const truncated = this.buffer.length > 0 || this.hasData;
    this.buffer = '';
    this.resetEvent();
    return { truncated };
  }

  private processLine(line: string): SseMessage | null {
    if (line === '') return this.dispatch();
    if (line.startsWith(':')) return null; // comment / keep-alive

    const colon = line.indexOf(':');
    let field: string;
    let value: string;
    if (colon === -1) {
      field = line;
      value = '';
    } else {
      field = line.slice(0, colon);
      value = line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
    }

    switch (field) {
      case 'event':
        this.eventType = value;
        break;
      case 'data':
        this.dataLines.push(value);
        this.hasData = true;
        break;
      case 'id':
        if (!value.includes('\0')) this.lastEventId = value;
        break;
      case 'retry':
        if (/^\d+$/.test(value)) this.retry = Number(value);
        break;
      default:
        break; // unknown fields are ignored
    }
    return null;
  }

  private dispatch(): SseMessage | null {
    if (!this.hasData) {
      this.resetEvent();
      return null;
    }
    const msg: SseMessage = {
      event: this.eventType || 'message',
      data: this.dataLines.join('\n'),
    };
    if (this.lastEventId !== undefined) msg.id = this.lastEventId;
    if (this.retry !== undefined) msg.retry = this.retry;
    this.resetEvent();
    return msg;
  }

  private resetEvent(): void {
    this.eventType = '';
    this.dataLines = [];
    this.hasData = false;
  }
}

/**
 * Decode a byte stream into SSE messages. UTF-8 sequences split across chunks are handled by
 * TextDecoder's streaming mode. Returns `truncated: true` via the callback if the stream ended
 * mid-event.
 */
export async function* readSseStream(
  body: ReadableStream<Uint8Array>,
  onEnd?: (info: { truncated: boolean }) => void,
): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  const parser = new SseParser();
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      yield* parser.push(decoder.decode(value, { stream: true }));
    }
    yield* parser.push(decoder.decode());
    onEnd?.(parser.end());
  } finally {
    // Consumer stopped early (e.g. after a terminal event): close the connection.
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
