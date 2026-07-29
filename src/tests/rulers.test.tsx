import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Rulers } from '../components/cad/Rulers';

let host: HTMLDivElement;
let root: Root | null;

const viewportRect: DOMRect = {
  x: 100,
  y: 50,
  top: 50,
  right: 500,
  bottom: 350,
  left: 100,
  width: 400,
  height: 300,
  toJSON: () => ({}),
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  host.remove();
  root = null;
  vi.restoreAllMocks();
});

describe('Rulers guide dragging', () => {
  it('creates one guide on release in SVG-local coordinates for both axes', () => {
    const onCreateGuide = vi.fn();
    act(() => {
      root?.render(
        <svg>
          <Rulers
            width={400}
            height={300}
            view={{ scale: 2, offsetX: 10, offsetY: 20 }}
            onCreateGuide={onCreateGuide}
          />
        </svg>,
      );
    });
    const svg = host.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(viewportRect);
    const vertical = host.querySelector(
      '[data-ruler-orientation="vertical"]',
    )!;
    const horizontal = host.querySelector(
      '[data-ruler-orientation="horizontal"]',
    )!;

    act(() => {
      vertical.dispatchEvent(new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 150,
        clientY: 55,
      }));
      window.dispatchEvent(new MouseEvent('pointermove', {
        clientX: 250,
        clientY: 100,
      }));
      window.dispatchEvent(new MouseEvent('pointermove', {
        clientX: 275,
        clientY: 120,
      }));
    });
    expect(onCreateGuide).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', {
        clientX: 300,
        clientY: 100,
      }));
    });
    expect(onCreateGuide).toHaveBeenNthCalledWith(1, 'vertical', 95);

    act(() => {
      horizontal.dispatchEvent(new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 105,
        clientY: 80,
      }));
      window.dispatchEvent(new MouseEvent('pointerup', {
        clientX: 200,
        clientY: 200,
      }));
    });
    expect(onCreateGuide).toHaveBeenNthCalledWith(2, 'horizontal', -65);
  });

  it('removes pending window listeners when unmounted', () => {
    const onCreateGuide = vi.fn();
    act(() => {
      root?.render(
        <svg>
          <Rulers
            width={400}
            height={300}
            view={{ scale: 1, offsetX: 0, offsetY: 0 }}
            onCreateGuide={onCreateGuide}
          />
        </svg>,
      );
    });
    const svg = host.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(viewportRect);
    const vertical = host.querySelector(
      '[data-ruler-orientation="vertical"]',
    )!;
    act(() => {
      vertical.dispatchEvent(new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 150,
        clientY: 55,
      }));
      root?.unmount();
    });
    root = null;

    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 300,
      clientY: 100,
    }));
    expect(onCreateGuide).not.toHaveBeenCalled();
  });
});
