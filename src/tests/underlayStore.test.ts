import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  imageDimensions,
  normalizeUnderlayTransform,
} from '../persistence/underlayStore';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('underlay transforms', () => {
  it('normalizes unsafe image transform input', () => {
    expect(normalizeUnderlayTransform({
      x: Number.NaN,
      y: 20,
      scale: -1,
      rotationDeg: 450,
      opacity: 2,
      visible: false,
    })).toEqual({
      x: 0,
      y: 20,
      scale: 1,
      rotationDeg: 90,
      opacity: 1,
      visible: false,
    });
    expect(normalizeUnderlayTransform({ rotationDeg: -90 }).rotationDeg).toBe(270);
  });

  it('always closes decoded ImageBitmap resources', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 12,
      height: 34,
      close,
    })));

    await expect(imageDimensions(
      new Blob(['image'], { type: 'image/png' }),
    )).resolves.toEqual({ width: 12, height: 34 });
    expect(close).toHaveBeenCalledOnce();
  });
});
