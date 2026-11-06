import type { ChunkEvent } from '../domain/simulation';
import { JointBuffer } from './jointBuffer';

const chunk = (angleDeg: number[]) => ({ joint: { angleDeg, torqueNm: angleDeg.map(() => 0) } }) as unknown as ChunkEvent;

describe('JointBuffer', () => {
  it('keeps the angles of consecutive chunks and reads them by output sample', () => {
    const b = new JointBuffer();
    expect(b.at(0)).toBeNull();
    b.append(chunk([0, 1, 2]));
    b.append({ joint: null } as unknown as ChunkEvent);
    b.append(chunk(Array.from({ length: 2000 }, (_, i) => 3 + i)));
    expect(b.length).toBe(2003);
    expect(b.at(4.4)).toBe(4);
    expect(b.at(-5)).toBe(0);
    expect(b.at(1e9)).toBe(2002);
    b.reset();
    expect(b.at(0)).toBeNull();
  });
});
