import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitInput } from '../components/common/CommitInput';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('CommitInput', () => {
  it('resets a draft on Escape without committing it on blur', () => {
    const onCommit = vi.fn();
    act(() => {
      root = createRoot(host!);
      root.render(
        <CommitInput
          aria-label="Name"
          value="Original"
          onCommit={onCommit}
        />,
      );
    });
    const input = host!.querySelector('input') as HTMLInputElement;

    act(() => {
      input.focus();
      setInputValue(input, 'Canceled edit');
    });
    expect(input.value).toBe('Canceled edit');

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('Original');
    expect(document.activeElement).not.toBe(input);
  });
});
