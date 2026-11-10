import { describe, it, expect } from 'vitest';
import { tintPixelsToInk, hexToRgb } from './signature';

const INK = [26, 63, 168] as const; // #1a3fa8

function px(r: number, g: number, b: number, a: number) {
  const d = new Uint8ClampedArray([r, g, b, a]);
  tintPixelsToInk(d, INK);
  return Array.from(d);
}

describe('tintPixelsToInk', () => {
  it('opaque black stroke becomes opaque ink blue', () => {
    expect(px(0, 0, 0, 255)).toEqual([26, 63, 168, 255]);
  });
  it('white paper background becomes fully transparent', () => {
    expect(px(255, 255, 255, 255)[3]).toBe(0);
  });
  it('already-transparent pixels stay transparent', () => {
    expect(px(0, 0, 0, 0)[3]).toBe(0);
  });
  it('mid grey gets roughly half opacity and always uses the ink colour', () => {
    const [r, g, b, a] = px(128, 128, 128, 255);
    expect([r, g, b]).toEqual([26, 63, 168]);
    expect(a).toBeGreaterThan(110);
    expect(a).toBeLessThan(145);
  });
  it('hexToRgb parses #rrggbb and rejects junk', () => {
    expect(hexToRgb('#1a3fa8')).toEqual([26, 63, 168]);
    expect(hexToRgb('blue')).toBeNull();
  });
});
