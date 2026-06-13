import { useLayoutEffect, useState, type RefObject } from 'react';

export type ElementSize = { width: number; height: number };

/** Track an element's size with a ResizeObserver. */
export function useElementSize(
  ref: RefObject<HTMLElement>,
  initial: ElementSize = { width: 800, height: 600 },
): ElementSize {
  const [size, setSize] = useState(initial);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
